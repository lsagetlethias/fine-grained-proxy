import { test } from "node:test";
import { Hono } from "hono";

import { assertEquals } from "../_assert.ts";
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
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
}

function teardown(): void {
  globalThis.fetch = originalFetch;
  delete process.env.FGP_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
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
  globalThis.fetch = (() =>
    Promise.resolve(new Response(body, { status, headers }))) as typeof globalThis.fetch;
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

test("decoded gzip body no longer advertises Content-Encoding nor Content-Length", async () => {
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
});

test("decoded br body no longer advertises Content-Encoding", async () => {
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
});

test("stripping stays a denylist, every other upstream header still passes", async () => {
  setup();
  mockUpstream(JSON.stringify({ ok: true }), {
    "Content-Type": "application/json",
    "Content-Encoding": "gzip",
    "Content-Length": "52",
    ETag: '"v1-abc"',
    "Cache-Control": "public, max-age=60",
    "X-RateLimit-Remaining": "42",
    "X-Scalingo-Request-Id": "req-9f2",
    Vary: "Accept-Encoding",
    Link: '<https://api.mock.local/v1/apps?page=2>; rel="next"',
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
  assertEquals(res.headers.get("Link"), '<https://api.mock.local/v1/apps?page=2>; rel="next"');
  await res.body?.cancel();
  teardown();
});

test("encoding the runtime does not decode keeps its headers untouched", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  // Mesure sur Node 26.10 : le runtime decode gzip, x-gzip, deflate, br et zstd, y compris
  // combines entre eux. Ne ressortent bruts que les etiquettes qu'il ne connait pas, et
  // toute liste qui en contient une, fut-elle par ailleurs connue.
  for (const encoding of ["compress", "x-vendor-enc", "gzip, x-vendor-enc"]) {
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
});

// Accept-Encoding: identity ne desactive plus le decodage. Mesure sur Node 26.10 : le
// runtime decode selon le seul Content-Encoding de la reponse, sans regarder la requete
// sortante. L'en-tete part toujours tel quel vers l'amont, mais l'appelant ne peut plus
// obtenir le corps compresse en le demandant.
test("asking identity no longer disables decoding, so the encoding headers go away", async () => {
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
  assertEquals(res.headers.get("Content-Encoding"), null);
  assertEquals(res.headers.get("Content-Length"), null);
  await res.body?.cancel();
  teardown();
});

test("identity combined with another codec does not disable runtime decoding", async () => {
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
});

// Un Range ne desactive plus le decodage non plus. Mesure sur Node 26.10 : un 206 dont le
// Content-Encoding est connu est decode comme un 200, donc ses en-tetes de codage decrivent
// un corps qui n'est plus celui qu'on emet et tombent avec lui.
test("a Range request no longer disables decoding, so encoding headers go away", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob(["*:*"]);

  // Ni la valeur du Range ni le status ne changent le verdict : il ne depend que du
  // Content-Encoding de la reponse.
  for (const range of ["bytes=0-100", "bytes=0-", "invalid-range-value"]) {
    for (const status of [200, 206]) {
      mockUpstream(
        "still-gzipped-bytes",
        {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
          "Content-Length": "52",
        },
        status,
      );
      const res = await app.request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY, Range: range },
      });
      assertEquals(res.status, status);
      assertEquals(res.headers.get("Content-Encoding"), null);
      assertEquals(res.headers.get("Content-Length"), null);
      await res.body?.cancel();
    }
  }
  teardown();
});

test("hop-by-hop Transfer-Encoding is never relayed downstream", async () => {
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
});

test("bodyless response keeps the upstream entity headers", async () => {
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
});

// AC-60.2 : Content-Range decrit le flux compresse. Relaye apres decodage, il fait
// reassembler un fichier faux a un client qui telecharge par morceaux, sans erreur pour
// l'en avertir. Il tombe donc avec Content-Encoding et Content-Length, jamais seul.
test("AC-60.2: un 206 decode par le runtime ne garde pas son Content-Range", async () => {
  setup();
  try {
    const blob = await makeBlob(["GET:/chunk"]);
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("corps en clair, deja decode par le runtime", {
          status: 206,
          headers: {
            "Content-Encoding": "gzip",
            "Content-Length": "31",
            "Content-Range": "bytes 0-30/31",
          },
        }),
      )) as typeof globalThis.fetch;

    const res = await createApp().request(`/${blob}/chunk`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 206, "le status amont n'est jamais transforme");
    assertEquals(res.headers.get("Content-Encoding"), null);
    assertEquals(res.headers.get("Content-Length"), null);
    assertEquals(
      res.headers.get("Content-Range"),
      null,
      "Content-Range decrit le flux compresse : le relayer ferait reassembler un fichier faux",
    );
    await res.body?.cancel();
  } finally {
    teardown();
  }
});
