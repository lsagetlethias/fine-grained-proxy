import { assertEquals } from "@std/assert";

import app from "../../src/main.ts";

const SERVER_SALT = "test-api-edge-salt";
const originalFetch = globalThis.fetch;

function setup() {
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
  Deno.env.set("SCALINGO_API_URL", "https://api.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_AUTH_URL");
  Deno.env.delete("SCALINGO_API_URL");
}

// --- /api/generate URL construction ---

Deno.test({
  name: "POST /api/generate without X-Forwarded-Host uses request origin",
  fn: async () => {
    setup();

    const res = await app.request("http://localhost:8000/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.url.startsWith("http://localhost"), true);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/generate with all auth modes ---

Deno.test({
  name: "POST /api/generate with scalingo-exchange auth mode works",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.osc-fr1.scalingo.com",
        auth: "scalingo-exchange",
        scopes: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
        ttl: 7200,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");
    assertEquals(typeof body.key, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with header:X-API-Key auth mode works",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "my-secret-api-key",
        target: "https://api.custom.com",
        auth: "header:X-API-Key",
        scopes: ["*:*"],
        ttl: 0,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/list-apps upstream failure ---

Deno.test({
  name: "POST /api/list-apps when upstream returns non-ok status returns 502",
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
        return Promise.resolve(new Response("Internal Error", { status: 500 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tk-us-test" }),
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_error");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/list-apps when upstream fetch throws returns 502",
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
      return Promise.reject(new Error("Network error"));
    }) as typeof globalThis.fetch;

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tk-us-test" }),
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_error");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/generate Zod edge cases ---

Deno.test({
  name: "POST /api/generate with empty scopes array is valid",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with ttl 0 is valid (no expiration)",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 0,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with extra fields in body is valid (Zod strips them)",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
        extra_field: "should_be_ignored",
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Catch-all /api/* returns 404 ---

Deno.test({
  name: "GET /api/nonexistent returns 404 with structured error",
  fn: async () => {
    const res = await app.request("/api/nonexistent");
    const body = await res.json();

    assertEquals(res.status, 404);
    assertEquals(body.error, "not_found");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/nonexistent returns 404",
  fn: async () => {
    const res = await app.request("/api/nonexistent", { method: "POST" });
    assertEquals(res.status, 404);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- DOCTYPE in HTML rendering ---

Deno.test({
  name: "GET / returns HTML with DOCTYPE",
  fn: async () => {
    const res = await app.request("/");
    const html = await res.text();
    assertEquals(html.startsWith("<!DOCTYPE html>"), true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/generate blob size validation ---

Deno.test({
  name: "POST /api/generate with massive scopes returns 400 blob_too_large",
  fn: async () => {
    setup();

    const massiveScopes = Array.from(
      { length: 5000 },
      (_, i) =>
        `GET:/v1/apps/${crypto.randomUUID()}-${crypto.randomUUID()}-${i}/containers/${crypto.randomUUID()}/restart`,
    );

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: massiveScopes,
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "blob_too_large");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
