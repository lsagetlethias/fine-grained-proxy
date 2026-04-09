import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "edge-case-test-key";
const SERVER_SALT = "edge-case-test-salt";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function makeBlob(
  scopes: string[],
  overrides?: {
    ttl?: number;
    createdAt?: number;
    target?: string;
    auth?: string;
    token?: string;
  },
): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: overrides?.token ?? "tk-us-test-token",
      target: overrides?.target ?? "https://api.mock.local",
      auth: overrides?.auth ?? "bearer",
      scopes,
      ttl: overrides?.ttl ?? 3600,
      createdAt: overrides?.createdAt ?? nowUnix(),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

// --- Query string forwarding ---

Deno.test({
  name: "integration: query string is forwarded to target",
  fn: async () => {
    setup();
    let capturedUrl = "";
    globalThis.fetch = ((input: string | URL | Request) => {
      capturedUrl = String(input instanceof Request ? input.url : input);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app?page=2&per_page=10`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedUrl.includes("?page=2&per_page=10"), true);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Target with trailing slash ---

Deno.test({
  name: "integration: target with trailing slash does not produce double slash",
  fn: async () => {
    setup();
    let capturedUrl = "";
    globalThis.fetch = ((input: string | URL | Request) => {
      capturedUrl = String(input instanceof Request ? input.url : input);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { target: "https://api.mock.local/" });

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedUrl, "https://api.mock.local/v1/apps");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Network error (fetch throws) ---

Deno.test({
  name: "integration: network error (fetch throws) returns 502 upstream_error",
  fn: async () => {
    setup();
    globalThis.fetch = (() => {
      return Promise.reject(new Error("Connection refused"));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();
    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_error");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- POST body forwarding ---

Deno.test({
  name: "integration: POST body is forwarded to target",
  fn: async () => {
    setup();
    let capturedBody = "";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        if (init?.body) {
          const reader = (init.body as ReadableStream).getReader();
          const chunks: Uint8Array[] = [];
          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (result.value) chunks.push(result.value);
          }
          capturedBody = new TextDecoder().decode(
            chunks.reduce((acc, chunk) => {
              const merged = new Uint8Array(acc.length + chunk.length);
              merged.set(acc);
              merged.set(chunk, acc.length);
              return merged;
            }, new Uint8Array()),
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["POST:/v1/apps/my-app/scale"]);

    const bodyPayload = JSON.stringify({ containers: [{ name: "web", amount: 2 }] });
    const res = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY, "Content-Type": "application/json" },
      body: bodyPayload,
    });
    assertEquals(res.status, 200);
    assertEquals(capturedBody, bodyPayload);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- GET body is not forwarded ---

Deno.test({
  name: "integration: GET request does not forward body",
  fn: async () => {
    setup();
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedInit?.body, undefined);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Singleflight error propagation ---

Deno.test({
  name: "integration: singleflight propagates exchange error to all concurrent requests",
  fn: async () => {
    setup();
    let exchangeCount = 0;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        exchangeCount++;
        return new Promise<Response>((resolve) =>
          setTimeout(
            () => resolve(new Response(JSON.stringify({ error: "fail" }), { status: 401 })),
            50,
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "scalingo-exchange" });

    const [r1, r2, r3] = await Promise.all([
      app.request(`/${blob}/v1/apps/my-app`, { headers: { "X-FGP-Key": CLIENT_KEY } }),
      app.request(`/${blob}/v1/apps/my-app`, { headers: { "X-FGP-Key": CLIENT_KEY } }),
      app.request(`/${blob}/v1/apps/my-app`, { headers: { "X-FGP-Key": CLIENT_KEY } }),
    ]);

    assertEquals(r1.status, 502);
    assertEquals(r2.status, 502);
    assertEquals(r3.status, 502);
    assertEquals(exchangeCount, 1);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Upstream 503 returns 502 ---

Deno.test({
  name: "integration: upstream 503 returns 502 upstream_error",
  fn: async () => {
    setup();
    globalThis.fetch = (() => {
      return Promise.resolve(new Response("Service Unavailable", { status: 503 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();
    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_error");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Verification order: TTL checked before scopes ---

Deno.test({
  name: "integration: TTL checked before scope (expired + bad scope = 410 not 403)",
  fn: async () => {
    setup();
    globalThis.fetch = (() => {
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/only-this"], { ttl: 1, createdAt: nowUnix() - 60 });

    const res = await app.request(`/${blob}/v1/other-path`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();
    assertEquals(res.status, 410);
    assertEquals(body.error, "token_expired");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Blob size checked before decryption ---

Deno.test({
  name: "integration: blob size checked before key check (oversized blob + wrong key = 414)",
  fn: async () => {
    setup();
    const app = createApp();
    const fakeBlob = "B".repeat(4097);

    const res = await app.request(`/${fakeBlob}/v1/apps`, {
      headers: { "X-FGP-Key": "any-key" },
    });
    const body = await res.json();
    assertEquals(res.status, 414);
    assertEquals(body.error, "blob_too_large");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Corrupted blob returns 401 ---

Deno.test({
  name: "integration: corrupted base64url blob returns 401 invalid_credentials",
  fn: async () => {
    setup();
    const app = createApp();

    const res = await app.request(`/not-a-valid-base64url-blob!!!/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();
    assertEquals(res.status, 401);
    assertEquals(body.error, "invalid_credentials");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Target URL construction ---

Deno.test({
  name: "integration: deeply nested proxy path is forwarded correctly",
  fn: async () => {
    setup();
    let capturedUrl = "";
    globalThis.fetch = ((input: string | URL | Request) => {
      capturedUrl = String(input instanceof Request ? input.url : input);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app/containers/web/restart`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedUrl, "https://api.mock.local/v1/apps/my-app/containers/web/restart");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Invalid auth mode returns 400 ---

Deno.test({
  name: "integration: invalid auth mode returns 400 invalid_auth_mode",
  fn: async () => {
    setup();
    globalThis.fetch = (() => {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "nimportequoi" });

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_auth_mode");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Valid auth modes are accepted ---

Deno.test({
  name: "integration: header:X-Custom auth mode is accepted",
  fn: async () => {
    setup();
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = init?.headers as Headers;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "header:X-Custom", token: "secret123" });

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedHeaders?.get("X-Custom"), "secret123");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
