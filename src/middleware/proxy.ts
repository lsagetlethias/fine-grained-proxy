import { Context, MiddlewareHandler } from "hono";

import { BlobConfig, decryptBlob, deriveKey, isExpired } from "../crypto/blob.ts";
import { exchangeToken } from "../auth/client.ts";
import {
  clearExpired,
  deleteInflight,
  getCachedBearer,
  getInflight,
  hashToken,
  setCachedBearer,
  setInflight,
} from "../auth/cache.ts";
import { checkAccess, type Scope } from "./scopes.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY, FGP_SOURCE_UPSTREAM } from "../constants.ts";
import { logsEnabled } from "../logs/config.ts";
import { computeBlobId } from "../logs/blob-id.ts";
import { captureDetailed, captureNetwork } from "../logs/capture.ts";
import { truncateIp } from "../logs/ip.ts";

const MAX_BLOB_LENGTH = 4096;

function jsonError(c: Context, status: number, error: string, message: string): Response {
  const response = c.json({ error, message }, status as 401);
  response.headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_PROXY);
  return response;
}

function getServerSalt(): string {
  const salt = Deno.env.get("FGP_SALT");
  if (!salt) throw new Error("Server misconfigured: FGP_SALT missing");
  return salt;
}

async function obtainBearerViaExchange(apiToken: string): Promise<string> {
  clearExpired();
  const tokenHash = await hashToken(apiToken);
  const cached = getCachedBearer(tokenHash);

  if (cached) return cached;

  const pending = getInflight(tokenHash);
  if (pending) return pending;

  const promise = exchangeToken(apiToken).then((bearer) => {
    setCachedBearer(tokenHash, bearer);
    deleteInflight(tokenHash);
    return bearer;
  }).catch((err) => {
    deleteInflight(tokenHash);
    throw err;
  });

  setInflight(tokenHash, promise);
  return promise;
}

function buildAuthHeaders(config: BlobConfig): Headers {
  const headers = new Headers();
  if (config.auth === "bearer") {
    headers.set("Authorization", `Bearer ${config.token}`);
  } else if (config.auth === "basic") {
    headers.set("Authorization", `Basic ${btoa(":" + config.token)}`);
  } else if (config.auth.startsWith("header:")) {
    const headerName = config.auth.slice("header:".length);
    headers.set(headerName, config.token);
  }
  return headers;
}

async function forwardRequest(
  c: Context,
  config: BlobConfig,
  proxyPath: string,
): Promise<Response> {
  const url = new URL(c.req.url);
  const target = config.target.replace(/\/+$/, "");
  const targetUrl = `${target}${proxyPath}${url.search}`;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("X-FGP-Key");
  headers.delete("X-FGP-Blob");
  headers.delete("host");

  if (config.auth === "scalingo-exchange") {
    const bearer = await obtainBearerViaExchange(config.token);
    headers.set("Authorization", `Bearer ${bearer}`);
  } else {
    const authHeaders = buildAuthHeaders(config);
    for (const [key, value] of authHeaders) {
      headers.set(key, value);
    }
  }

  const init: RequestInit = {
    method: c.req.method,
    headers,
  };

  if (!["GET", "HEAD"].includes(c.req.method)) {
    init.body = c.req.raw.body;
  }

  return await fetch(targetUrl, init);
}

function handleUpstreamResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  headers.set(FGP_SOURCE_HEADER, FGP_SOURCE_UPSTREAM);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function extractClientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  const env = c.env as { info?: { remoteAddr?: { hostname?: string } } } | undefined;
  const host = env?.info?.remoteAddr?.hostname;
  return host ?? "";
}

async function handleProxy(c: Context, blobRaw: string, proxyPath: string): Promise<Response> {
  const startedAt = Date.now();

  if (blobRaw.length > MAX_BLOB_LENGTH) {
    return jsonError(c, 414, "blob_too_large", "Encrypted blob exceeds maximum size");
  }

  const clientKey = c.req.header("X-FGP-Key");
  if (!clientKey) {
    return jsonError(c, 401, "missing_key", "X-FGP-Key header is required");
  }

  const serverSalt = getServerSalt();

  let config;
  try {
    config = await decryptBlob(blobRaw, clientKey, serverSalt);
  } catch {
    return jsonError(c, 401, "invalid_credentials", "Unable to decrypt token");
  }

  if (isExpired(config)) {
    return jsonError(c, 410, "token_expired", "This token has expired");
  }

  const validAuthModes = ["bearer", "basic", "scalingo-exchange"];
  if (
    !validAuthModes.includes(config.auth) && !config.auth.startsWith("header:")
  ) {
    return jsonError(c, 400, "invalid_auth_mode", "Unsupported auth mode: " + config.auth);
  }

  const logsActive = logsEnabled() && config.logs?.enabled === true;
  const detailedActive = logsActive && config.logs?.detailed === true;

  const methodsWithBody = ["POST", "PUT", "PATCH"];
  const hasBodyMethod = methodsWithBody.includes(c.req.method.toUpperCase());
  const rawContentType = c.req.header("content-type") ?? "";
  const isJsonContent = rawContentType.includes("application/json");
  const isMultipart = rawContentType.includes("multipart/");

  const scopesHaveBodyFilters = config.scopes.some(
    (s: Scope) => typeof s !== "string" && s.bodyFilters && s.bodyFilters.length > 0,
  );

  const shouldCaptureDetailed = detailedActive && hasBodyMethod && isJsonContent && !isMultipart;
  const needsRawBody = (hasBodyMethod && scopesHaveBodyFilters) || shouldCaptureDetailed;

  let parsedBody: unknown;
  let rawBodyBytes: Uint8Array | null = null;

  if (needsRawBody) {
    const buf = await c.req.raw.clone().arrayBuffer();
    rawBodyBytes = new Uint8Array(buf);
    if (hasBodyMethod && scopesHaveBodyFilters) {
      if (isJsonContent) {
        try {
          parsedBody = JSON.parse(new TextDecoder().decode(rawBodyBytes));
        } catch {
          return await finishWithCapture(
            c,
            config,
            blobRaw,
            clientKey,
            serverSalt,
            proxyPath,
            startedAt,
            logsActive,
            false,
            null,
            jsonError(c, 400, "invalid_body", "Request body is not valid JSON"),
          );
        }
      } else {
        return await finishWithCapture(
          c,
          config,
          blobRaw,
          clientKey,
          serverSalt,
          proxyPath,
          startedAt,
          logsActive,
          false,
          null,
          jsonError(
            c,
            403,
            "scope_denied",
            "Body filters require application/json content type",
          ),
        );
      }
    }
  }

  if (!checkAccess(config.scopes, c.req.method, proxyPath, parsedBody)) {
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      clientKey,
      serverSalt,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 403, "scope_denied", "Insufficient permissions for this action"),
    );
  }

  let response;
  try {
    response = await forwardRequest(c, config, proxyPath);
  } catch {
    return await finishWithCapture(
      c,
      config,
      blobRaw,
      clientKey,
      serverSalt,
      proxyPath,
      startedAt,
      logsActive,
      false,
      null,
      jsonError(c, 502, "upstream_unreachable", "Unable to reach target API"),
    );
  }

  const forwarded = handleUpstreamResponse(response);
  return await finishWithCapture(
    c,
    config,
    blobRaw,
    clientKey,
    serverSalt,
    proxyPath,
    startedAt,
    logsActive,
    shouldCaptureDetailed,
    rawBodyBytes,
    forwarded,
  );
}

async function finishWithCapture(
  c: Context,
  _config: BlobConfig,
  blobRaw: string,
  clientKey: string,
  serverSalt: string,
  proxyPath: string,
  startedAt: number,
  logsActive: boolean,
  shouldCaptureDetailed: boolean,
  rawBodyBytes: Uint8Array | null,
  response: Response,
): Promise<Response> {
  if (!logsActive) return response;

  const ts = Date.now();
  const durationMs = ts - startedAt;

  try {
    const blobId = await computeBlobId(blobRaw);
    const method = c.req.method.toUpperCase();
    const ipPrefix = truncateIp(extractClientIp(c));

    captureNetwork({
      blobId,
      method,
      path: proxyPath,
      status: response.status,
      durationMs,
      ipPrefix,
      ts,
    });

    if (shouldCaptureDetailed && rawBodyBytes) {
      const derivedKey = await deriveKey(clientKey, serverSalt);
      await captureDetailed({
        blobId,
        method,
        path: proxyPath,
        bodyRaw: rawBodyBytes,
        derivedKey,
        ts,
      });
    }
  } catch (err) {
    console.error("[fgp] logs capture failed:", err);
  }

  return response;
}

export function blobHeaderProxy(): MiddlewareHandler {
  return (c, next) => {
    const blobRaw = c.req.header("X-FGP-Blob");
    if (!blobRaw) return next();
    const url = new URL(c.req.url);
    const proxyPath = url.pathname;
    if (proxyPath === "/logs" || proxyPath.startsWith("/logs/")) return next();
    return handleProxy(c, blobRaw, proxyPath);
  };
}

export function proxyMiddleware(): MiddlewareHandler {
  return async (c) => {
    const url = new URL(c.req.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments.length < 2) {
      return jsonError(c, 400, "invalid_request", "Invalid proxy path");
    }

    const blobRaw = segments[0];
    const proxyPath = "/" + segments.slice(1).join("/");
    return await handleProxy(c, blobRaw, proxyPath);
  };
}
