import { Context } from "hono";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { decryptBlob, isExpired } from "../crypto/blob.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../constants.ts";
import { logsEnabled } from "../logs/config.ts";
import { computeBlobId } from "../logs/blob-id.ts";
import { flushSince, getStreamCount, subscribe } from "../logs/store.ts";
import type { LogEntry } from "../logs/events.ts";
import { LogsPage } from "../ui/logs-page.tsx";

const HEARTBEAT_MS = 15_000;
const MAX_BLOB_LENGTH = 4096;

const HealthResponseSchema = z.object({
  enabled: z.boolean(),
}).openapi("LogsHealthResponse");

const StreamErrorSchema = z.object({
  error: z.enum([
    "invalid_request",
    "missing_key",
    "invalid_credentials",
    "blob_invalid",
    "logs_not_enabled",
    "logs_stream_conflict",
    "token_expired",
    "blob_expired",
    "blob_too_large",
  ]),
  message: z.string(),
}).openapi("LogsStreamError");

const streamRoute = createRoute({
  method: "get",
  path: "/logs/stream",
  tags: ["Logs"],
  summary: "SSE stream of logs for a blob",
  description:
    "Opens a Server-Sent Events stream of log entries for the blob carried by X-FGP-Blob + X-FGP-Key. Flush the current ring buffer then pushes new entries live with a 15s heartbeat. Requires FGP_LOGS_ENABLED=1.",
  request: {
    headers: z.object({
      "X-FGP-Blob": z.string().optional(),
      "X-FGP-Key": z.string().optional(),
    }),
    query: z.object({
      since: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "SSE stream opened",
      content: { "text/event-stream": { schema: z.string() } },
    },
    400: {
      description: "Invalid request (malformed since cursor)",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
    401: {
      description: "Missing key or invalid credentials",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
    403: {
      description: "Logs not enabled for this blob",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
    404: {
      description: "Kill switch off (FGP_LOGS_ENABLED=0)",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
    409: {
      description: "Another stream is already open for this blob",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
    410: {
      description: "Blob expired (TTL reached)",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
    414: {
      description: "Blob exceeds maximum size",
      content: { "application/json": { schema: StreamErrorSchema } },
    },
  },
});

const healthRoute = createRoute({
  method: "get",
  path: "/logs/health",
  tags: ["Logs"],
  summary: "Logs feature health",
  description:
    "Returns whether the logs feature is enabled on this FGP instance. Always 200, public, no auth.",
  responses: {
    200: {
      description: "Feature status",
      content: { "application/json": { schema: HealthResponseSchema } },
    },
  },
});

export const logsRoutes = new OpenAPIHono();

logsRoutes.openapi(healthRoute, (c) => {
  c.header(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return c.json({ enabled: logsEnabled() }, 200);
});

function jsonStreamError(
  c: Context,
  status: 400 | 401 | 403 | 409 | 410 | 414,
  error: string,
  message: string,
): Response {
  const res = c.json({ error, message }, status);
  res.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return res;
}

function notFound(c: Context): Response {
  const res = c.json({ error: "not_found", message: "Endpoint not found" }, 404);
  res.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return res;
}

logsRoutes.get("/logs", (c) => {
  if (!logsEnabled()) return notFound(c);
  return c.html(<LogsPage />);
});

logsRoutes.openAPIRegistry.registerPath(streamRoute);

logsRoutes.get("/logs/stream", async (c) => {
  if (!logsEnabled()) return notFound(c);

  const blobRaw = c.req.header("X-FGP-Blob");
  const clientKey = c.req.header("X-FGP-Key");

  if (!blobRaw || !clientKey) {
    return jsonStreamError(c, 401, "missing_key", "X-FGP-Blob and X-FGP-Key are required");
  }

  if (blobRaw.length > MAX_BLOB_LENGTH) {
    return jsonStreamError(c, 414, "blob_too_large", "Encrypted blob exceeds maximum size");
  }

  const sinceParam = c.req.query("since");
  let since: number | undefined;
  if (sinceParam !== undefined) {
    const n = Number(sinceParam);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return jsonStreamError(c, 400, "invalid_request", "Invalid since cursor");
    }
    since = n;
  }

  const serverSalt = Deno.env.get("FGP_SALT");
  if (!serverSalt) {
    return jsonStreamError(c, 401, "invalid_credentials", "Unable to decrypt blob");
  }

  let config;
  try {
    config = await decryptBlob(blobRaw, clientKey, serverSalt);
  } catch {
    return jsonStreamError(c, 401, "invalid_credentials", "Unable to decrypt blob");
  }

  if (isExpired(config)) {
    return jsonStreamError(c, 410, "token_expired", "This token has expired");
  }

  if (config.logs?.enabled !== true) {
    return jsonStreamError(c, 403, "logs_not_enabled", "Logs not enabled for this blob");
  }

  const blobId = await computeBlobId(blobRaw);
  if (getStreamCount(blobId) > 0) {
    return jsonStreamError(
      c,
      409,
      "logs_stream_conflict",
      "Another stream is already active for this blob",
    );
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          cleanup();
        }
      };

      const initial = flushSince(blobId, since);
      for (const entry of initial) {
        safeEnqueue(encoder.encode(formatLogEvent(entry)));
      }

      const unsub = subscribe(blobId, (entry: LogEntry) => {
        safeEnqueue(encoder.encode(formatLogEvent(entry)));
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode("event: ping\ndata: {}\n\n"));
      }, HEARTBEAT_MS) as unknown as number;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      c.req.raw.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      [FGP_SOURCE_HEADER]: FGP_SOURCE_PROXY,
    },
  });
});

function formatLogEvent(entry: LogEntry): string {
  return `event: log\ndata: ${JSON.stringify(entry)}\n\n`;
}
