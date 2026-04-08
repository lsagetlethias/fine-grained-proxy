import { Context, MiddlewareHandler } from "hono";

import { BlobConfig, decryptBlob, isExpired } from "../crypto/blob.ts";
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
import { checkAccess } from "./scopes.ts";

const MAX_BLOB_LENGTH = 4096;

function jsonError(c: Context, status: number, error: string, message: string): Response {
  return c.json({ error, message }, status as 401);
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

function handleUpstreamResponse(
  c: Context,
  response: Response,
): Response {
  if (response.status === 401) {
    return jsonError(c, 502, "upstream_auth_failed", "Target API rejected the token");
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const headers = new Headers({ "Content-Type": "application/json" });
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Rate limit exceeded, retry later" }),
      { status: 429, headers },
    );
  }
  if (response.status >= 500) {
    return jsonError(c, 502, "upstream_error", "Target API is unavailable");
  }

  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

    if (!checkAccess(config.scopes, c.req.method, proxyPath)) {
      return jsonError(c, 403, "scope_denied", "Insufficient permissions for this action");
    }

    let response;
    try {
      response = await forwardRequest(c, config, proxyPath);
    } catch {
      return jsonError(c, 502, "upstream_error", "Target API is unavailable");
    }

    return handleUpstreamResponse(c, response);
  };
}
