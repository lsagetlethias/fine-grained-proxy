import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "headers-test-key";
const SERVER_SALT = "headers-test-salt";

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

async function makeBlob(scopes: string[]): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tk-us-test-token",
      target: "https://api.mock.local",
      auth: "scalingo-exchange",
      scopes,
      ttl: 3600,
      createdAt: nowUnix(),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

Deno.test({
  name: "X-FGP-Key header is not forwarded to target",
  fn: async () => {
    setup();
    let capturedHeaders: Headers | null = null;

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("api.mock.local")) {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(capturedHeaders!.get("X-FGP-Key"), null);
    assertEquals(capturedHeaders!.get("Authorization"), "Bearer mock-bearer");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "upstream 429 without Retry-After propagated without Retry-After",
  fn: async () => {
    setup();

    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("api.mock.local")) {
        return Promise.resolve(new Response("{}", { status: 429 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 429);
    assertEquals(body.error, "rate_limited");
    assertEquals(res.headers.get("Retry-After"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "non-JSON response from target propagated with original Content-Type",
  fn: async () => {
    setup();

    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("api.mock.local")) {
        return Promise.resolve(
          new Response("<html><body>Maintenance</body></html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), "text/html");
    const body = await res.text();
    assertEquals(body.includes("Maintenance"), true);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Host header is stripped before forwarding",
  fn: async () => {
    setup();
    let capturedHeaders: Headers | null = null;

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("api.mock.local")) {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY, "Host": "fgp.example.com" },
    });

    assertEquals(capturedHeaders!.get("Host"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "Set-Cookie header from target is filtered",
  fn: async () => {
    setup();

    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("api.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": "session=abc; Path=/",
              "X-Request-Id": "req-123",
            },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("X-Request-Id"), "req-123");
    assertEquals(res.headers.get("Set-Cookie"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
