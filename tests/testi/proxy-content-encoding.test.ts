import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

// Le runtime decode gzip et br a la reception du fetch. Les en-tetes amont qui
// decrivaient le corps compresse deviennent alors faux et doivent partir, mais
// uniquement dans ce cas : hors decodage ils restent exacts et doivent survivre.

const CLIENT_KEY = "content-encoding-test-key-pad";
const SERVER_SALT = "content-encoding-test-salt";

const originalFetch = globalThis.fetch;

function setup(): void {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
}

function teardown(): void {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

async function makeBlob(scopes: string[]): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tk-us-test-token",
      target: "https://api.mock.local",
      auth: "bearer",
      scopes,
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

function mockUpstream(body: BodyInit | null, headers: HeadersInit, status = 200): void {
  globalThis.fetch =
    (() => Promise.resolve(new Response(body, { status, headers }))) as typeof globalThis.fetch;
}

function mockUpstreamCapturing(
  build: () => Response,
  seen: { acceptEncoding: string | null },
): void {
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    seen.acceptEncoding = new Headers(init?.headers).get("Accept-Encoding");
    return Promise.resolve(build());
  }) as typeof globalThis.fetch;
}

Deno.test({
  name: "decoded gzip body no longer advertises Content-Encoding nor Content-Length",
  fn: async () => {
    setup();
    const payload = JSON.stringify({ apps: ["a", "b"] });
    mockUpstream(payload, {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Content-Length": "52",
    });
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Encoding"), null);
    assertEquals(res.headers.get("Content-Length"), null);
    assertEquals(res.headers.get("X-FGP-Source"), "upstream");
    assertEquals(await res.text(), payload);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "decoded br body no longer advertises Content-Encoding",
  fn: async () => {
    setup();
    mockUpstream(JSON.stringify({ ok: true }), {
      "Content-Type": "application/json",
      "Content-Encoding": "br",
    });
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.headers.get("Content-Encoding"), null);
    await res.body?.cancel();
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "stripping stays a denylist, every other upstream header still passes",
  fn: async () => {
    setup();
    mockUpstream(JSON.stringify({ ok: true }), {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Content-Length": "52",
      "ETag": '"v1-abc"',
      "Cache-Control": "public, max-age=60",
      "X-RateLimit-Remaining": "42",
      "X-Scalingo-Request-Id": "req-9f2",
      "Vary": "Accept-Encoding",
      "Link": '<https://api.mock.local/v1/apps?page=2>; rel="next"',
    });
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.headers.get("Content-Type"), "application/json");
    assertEquals(res.headers.get("ETag"), '"v1-abc"');
    assertEquals(res.headers.get("Cache-Control"), "public, max-age=60");
    assertEquals(res.headers.get("X-RateLimit-Remaining"), "42");
    assertEquals(res.headers.get("X-Scalingo-Request-Id"), "req-9f2");
    assertEquals(res.headers.get("Vary"), "Accept-Encoding");
    assertEquals(
      res.headers.get("Link"),
      '<https://api.mock.local/v1/apps?page=2>; rel="next"',
    );
    await res.body?.cancel();
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "encoding the runtime does not decode keeps its headers untouched",
  fn: async () => {
    setup();
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    for (const encoding of ["deflate", "zstd", "compress", "x-vendor-enc", "gzip, br"]) {
      mockUpstream("still-encoded-bytes", {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": encoding,
      });
      const res = await app.request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.headers.get("Content-Encoding"), encoding);
      await res.body?.cancel();
    }
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "caller asking identity gets the still-compressed body with its headers intact",
  fn: async () => {
    setup();
    const seen = { acceptEncoding: null as string | null };
    mockUpstreamCapturing(
      () =>
        new Response("gzipped-bytes-here", {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
            "Content-Length": "18",
          },
        }),
      seen,
    );
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY, "Accept-Encoding": "identity" },
    });

    assertEquals(seen.acceptEncoding, "identity");
    assertEquals(res.headers.get("Content-Encoding"), "gzip");
    assertEquals(res.headers.get("Content-Length"), "18");
    await res.body?.cancel();
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "identity combined with another codec does not disable runtime decoding",
  fn: async () => {
    setup();
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    for (const accept of ["identity, gzip", "identity;q=0", "gzip", "*"]) {
      const seen = { acceptEncoding: null as string | null };
      mockUpstreamCapturing(
        () =>
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
          }),
        seen,
      );
      const res = await app.request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY, "Accept-Encoding": accept },
      });
      assertEquals(seen.acceptEncoding, accept);
      assertEquals(res.headers.get("Content-Encoding"), null);
      await res.body?.cancel();
    }
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "a Range request disables runtime decoding, so encoding headers must survive",
  fn: async () => {
    setup();
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    // La valeur du Range est sans importance et le status non plus : la seule presence de
    // l'en-tete sur la requete sortante suffit a desactiver le decodage du runtime.
    for (const range of ["bytes=0-100", "bytes=0-", "invalid-range-value"]) {
      for (const status of [200, 206]) {
        mockUpstream("still-gzipped-bytes", {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Content-Length": "52",
        }, status);
        const res = await app.request(`/${blob}/v1/apps`, {
          headers: { "X-FGP-Key": CLIENT_KEY, "Range": range },
        });
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Encoding"), "gzip");
        assertEquals(res.headers.get("Content-Length"), "52");
        await res.body?.cancel();
      }
    }
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "hop-by-hop Transfer-Encoding is never relayed downstream",
  fn: async () => {
    setup();
    mockUpstream(JSON.stringify({ ok: true }), {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    });
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.headers.get("Transfer-Encoding"), null);
    assertEquals(res.headers.get("X-FGP-Source"), "upstream");
    await res.body?.cancel();
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "bodyless response keeps the upstream entity headers",
  fn: async () => {
    setup();
    mockUpstream(null, {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Content-Length": "4707",
    });
    const app = createApp();
    const blob = await makeBlob(["HEAD:/v1/apps"]);

    const res = await app.request(`/${blob}/v1/apps`, {
      method: "HEAD",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.headers.get("Content-Encoding"), "gzip");
    assertEquals(res.headers.get("Content-Length"), "4707");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
