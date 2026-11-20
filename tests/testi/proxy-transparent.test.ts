import { test } from "node:test";
import { Hono } from "hono";

import { assertEquals } from "../_assert.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "transparent-test-key-padding";
const SERVER_SALT = "transparent-test-salt";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
  process.env.SCALINGO_AUTH_URL = "https://auth.mock.local";
}

function teardown() {
  globalThis.fetch = originalFetch;
  delete process.env.FGP_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  delete process.env.SCALINGO_AUTH_URL;
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

function mockUpstream(status: number, body: BodyInit | null, headers?: HeadersInit) {
  globalThis.fetch = (() =>
    Promise.resolve(new Response(body, { status, headers }))) as typeof globalThis.fetch;
}

// --- AC-17.1 : Forward 2xx + X-FGP-Source: upstream ---

test("AC-17.1: forward transparent 2xx with X-FGP-Source: upstream", async () => {
  setup();
  mockUpstream(200, JSON.stringify({ ok: true }), { "Content-Type": "application/json" });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/apps`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  const body = await res.json();
  assertEquals(body, { ok: true });
  teardown();
});

// --- AC-17.3 : Forward upstream 403 ---

test("AC-17.3: forward transparent upstream 403 with body and X-FGP-Source: upstream", async () => {
  setup();
  mockUpstream(403, JSON.stringify({ error: "forbidden_upstream" }), {
    "Content-Type": "application/json",
    "X-Custom": "some-value",
  });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/apps`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 403);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  assertEquals(res.headers.get("X-Custom"), "some-value");
  const body = await res.json();
  assertEquals(body, { error: "forbidden_upstream" });
  teardown();
});

// --- AC-17.4 : Forward upstream 404 ---

test("AC-17.4: forward transparent upstream 404 with X-FGP-Source: upstream", async () => {
  setup();
  mockUpstream(404, JSON.stringify({ error: "not_found" }), {
    "Content-Type": "application/json",
  });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/unknown`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 404);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.8 : Forward upstream 502 ---

test("AC-17.8: forward transparent upstream 502 preserves status, body, X-FGP-Source: upstream", async () => {
  setup();
  mockUpstream(502, "Bad Gateway upstream");
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/apps`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 502);
  assertEquals(await res.text(), "Bad Gateway upstream");
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.10 : Forward upstream 504 ---

test("AC-17.10: forward transparent upstream 504 with X-FGP-Source: upstream", async () => {
  setup();
  mockUpstream(504, "Gateway Timeout");
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/apps`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 504);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.11 : Status atypique ---

test("AC-17.11: forward atypical upstream statuses (418, 507, 451, 226)", async () => {
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  for (const status of [418, 451, 507, 226]) {
    setup();
    mockUpstream(status, `status-${status}`);
    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, status);
    assertEquals(res.headers.get("X-FGP-Source"), "upstream");
    assertEquals(await res.text(), `status-${status}`);
    teardown();
  }
});

// --- AC-17.12 : Body upstream byte-exact ---

test("AC-17.12: upstream body preserved byte-exact (JSON multiline)", async () => {
  setup();
  const payload = JSON.stringify({
    nested: { a: 1, b: [1, 2, 3], c: "with\nnewline\tand\ttabs" },
    unicode: "éàü中文",
  });
  mockUpstream(200, payload, { "Content-Type": "application/json" });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(await res.text(), payload);
  teardown();
});

// --- AC-17.13 : Body vide preserve ---

test("AC-17.13: empty upstream body preserved (no JSON error injected)", async () => {
  setup();
  mockUpstream(500, null);
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 500);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  const body = await res.text();
  assertEquals(body, "");
  teardown();
});

// --- AC-17.15 : Content-Type application/xml ---

test("AC-17.15: upstream application/xml preserved", async () => {
  setup();
  const xml = `<?xml version="1.0"?><root><item>hello</item></root>`;
  mockUpstream(200, xml, { "Content-Type": "application/xml" });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/xml");
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  assertEquals(await res.text(), xml);
  teardown();
});

// --- AC-17.16 : Content-Type application/octet-stream binaire ---

test("AC-17.16: upstream octet-stream preserved without byte corruption", async () => {
  setup();
  const bytes = new Uint8Array([0x00, 0xff, 0x10, 0x7f, 0x80, 0xaa, 0x55]);
  mockUpstream(200, bytes, { "Content-Type": "application/octet-stream" });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/file`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/octet-stream");
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  const received = new Uint8Array(await res.arrayBuffer());
  assertEquals(received.length, bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    assertEquals(received[i], bytes[i]);
  }
  teardown();
});

// --- AC-17.17 : Redirect 302 ---

test("AC-17.17: upstream 302 with Location header forwarded", async () => {
  setup();
  // fetch by default follows redirects; we mock the upstream to already give the "followed" 302
  // scenario: we intercept and return a 302 without Location to the client, showing forward works.
  // Note: per lead arbitrage, we do not pass redirect: "manual". This test covers the case where
  // the upstream final response is a 302 that fetch did not follow (e.g., cross-origin scenarios).
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "/new-path", "Content-Length": "0" },
      }),
    )) as typeof globalThis.fetch;
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/redirect`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
    redirect: "manual",
  });

  assertEquals(res.status, 302);
  assertEquals(res.headers.get("Location"), "/new-path");
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.19 : Multi Set-Cookie stripped ---

test("AC-17.19: multiple Set-Cookie headers all stripped", async () => {
  setup();
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", "session=abc; Path=/");
  headers.append("Set-Cookie", "csrf=def; Path=/; Secure");
  headers.append("Set-Cookie", "pref=light; Path=/");
  globalThis.fetch = (() =>
    Promise.resolve(new Response("{}", { status: 200, headers }))) as typeof globalThis.fetch;

  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Set-Cookie"), null);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.20 : X-FGP-Source overwrite ---

test("AC-17.20: upstream X-FGP-Source header is overwritten by proxy value", async () => {
  setup();
  mockUpstream(200, "{}", {
    "Content-Type": "application/json",
    "X-FGP-Source": "attacker-value",
  });
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.21 : X-FGP-Source: proxy on missing_key ---

test("AC-17.21: missing_key carries X-FGP-Source: proxy", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "missing_key");
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.22 : X-FGP-Source: proxy on blob_too_large ---

test("AC-17.22: blob_too_large carries X-FGP-Source: proxy", async () => {
  setup();
  const app = createApp();
  const fakeBlob = "A".repeat(4097);

  const res = await app.request(`/${fakeBlob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 414);
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.23 : X-FGP-Source: proxy on invalid_credentials ---

test("AC-17.23: invalid_credentials carries X-FGP-Source: proxy", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": "wrong-key" },
  });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "invalid_credentials");
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.24 : X-FGP-Source: proxy on token_expired ---

test("AC-17.24: token_expired carries X-FGP-Source: proxy", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["*:*"], { ttl: 1, createdAt: nowUnix() - 60 });

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 410);
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.25 : X-FGP-Source: proxy on invalid_auth_mode ---

test("AC-17.25: invalid_auth_mode carries X-FGP-Source: proxy", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["*:*"], { auth: "oauth2-not-supported" });

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_auth_mode");
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.26 : X-FGP-Source: proxy on invalid_body ---

test("AC-17.26: invalid_body carries X-FGP-Source: proxy", async () => {
  setup();
  const blob = await encryptBlob(
    {
      v: 3,
      token: "tk-test",
      target: "https://api.mock.local",
      auth: "bearer",
      scopes: [
        {
          methods: ["POST"],
          pattern: "/deploy",
          bodyFilters: [{ objectPath: "branch", objectValue: [{ type: "any", value: "main" }] }],
        },
      ],
      ttl: 3600,
      createdAt: nowUnix(),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
  const app = createApp();

  const res = await app.request(`/${blob}/deploy`, {
    method: "POST",
    headers: { "X-FGP-Key": CLIENT_KEY, "Content-Type": "application/json" },
    body: "{ invalid json",
  });

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid_body");
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.27 : X-FGP-Source: proxy on scope_denied ---

test("AC-17.27: scope_denied carries X-FGP-Source: proxy", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["GET:/v1/apps/*"]);

  const res = await app.request(`/${blob}/admin/panel`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 403);
  const body = await res.json();
  assertEquals(body.error, "scope_denied");
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  teardown();
});

// --- AC-17.28 : X-FGP-Source: proxy on invalid_request ---

test("AC-17.28: invalid_request carries X-FGP-Source: proxy", async () => {
  setup();
  const app = new Hono();
  app.use("/:blob/*", proxyMiddleware());

  // Route with no path after blob triggers segments.length < 2
  const res = await app.request("/someblob/", {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  // Either 400 invalid_request (if matched) or 404 (if router rejects).
  // We test the middleware directly to hit the invalid_request branch.
  const app2 = new Hono();
  app2.all("/*", proxyMiddleware());
  const res2 = await app2.request("/onlyblob", {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res2.status, 400);
  const body = await res2.json();
  assertEquals(body.error, "invalid_request");
  assertEquals(res2.headers.get("X-FGP-Source"), "proxy");
  // Silence unused res warning
  void res;
  teardown();
});

// --- AC-17.30 : Fetch throw tous modes ---

test("AC-17.30: fetch throw all network modes returns 502 upstream_unreachable", async () => {
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const networkErrors = [
    new TypeError("fetch failed: connection refused"),
    new TypeError("fetch failed: dns lookup error"),
    new DOMException("timeout", "TimeoutError"),
    new TypeError("fetch failed: tls handshake error"),
  ];

  for (const err of networkErrors) {
    setup();
    globalThis.fetch = (() => Promise.reject(err)) as typeof globalThis.fetch;
    const res = await app.request(`/${blob}/v1/x`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();
    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_unreachable");
    assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    teardown();
  }
});

// --- AC-17.13 bis : 204 No Content ---

test("AC-17.13 bis: 204 No Content forwarded without body", async () => {
  setup();
  mockUpstream(204, null);
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    method: "DELETE",
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 204);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});

// --- AC-17.16 bis : Body binaire + Content-Length préservé ---

test("AC-17.16 bis: body binaire Content-Length préservé", async () => {
  setup();
  const bytes = new Uint8Array(256);
  crypto.getRandomValues(bytes);

  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(bytes.length),
        },
      }),
    )) as typeof globalThis.fetch;

  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/download`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "application/octet-stream");
  assertEquals(res.headers.get("Content-Length"), "256");
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");

  const received = new Uint8Array(await res.arrayBuffer());
  assertEquals(received.length, 256);
  for (let i = 0; i < bytes.length; i++) {
    assertEquals(received[i], bytes[i]);
  }
  teardown();
});

// --- AC-17.x : Chunked streaming forward ---

test("AC-17.x: chunked streaming forward", async () => {
  setup();
  const chunks = [
    new TextEncoder().encode("chunk-1-"),
    new TextEncoder().encode("chunk-2-"),
    new TextEncoder().encode("chunk-3-end"),
  ];
  const expected = "chunk-1-chunk-2-chunk-3-end";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
        await new Promise((r) => setTimeout(r, 5));
      }
      controller.close();
    },
  });

  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Transfer-Encoding": "chunked",
        },
      }),
    )) as typeof globalThis.fetch;

  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/stream`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  assertEquals(res.body instanceof ReadableStream, true);

  const body = await res.text();
  assertEquals(body, expected);
  teardown();
});

// --- AC-17.5 bis : Retry-After en date HTTP ---

test("AC-17.5 bis: Retry-After date HTTP", async () => {
  setup();
  const retryAfterDate = "Wed, 22 Apr 2026 14:00:00 GMT";
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("{}", {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfterDate,
        },
      }),
    )) as typeof globalThis.fetch;

  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  const res = await app.request(`/${blob}/v1/x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });

  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Retry-After"), retryAfterDate);
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  teardown();
});
