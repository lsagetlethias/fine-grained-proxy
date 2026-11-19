import { test } from "node:test";
import { Hono } from "hono";

import { assertEquals } from "../_assert.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { _setResolverForTests } from "../../src/net/egress.ts";

const CLIENT_KEY = "egress-test-key-0123456789abcdef";
const SERVER_SALT = "egress-test-salt";

const originalFetch = globalThis.fetch;
let fetchCount = 0;
let resolveCount = 0;

function setup(resolved = "93.184.216.34") {
  _resetStoreForTests();
  process.env.FGP_SALT = SERVER_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  fetchCount = 0;
  resolveCount = 0;
  _setResolverForTests((_h, kind) => {
    resolveCount++;
    return Promise.resolve(kind === "A" ? [resolved] : []);
  });
  globalThis.fetch = (() => {
    fetchCount++;
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  _setResolverForTests(null);
  delete process.env.FGP_SALT;
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

async function makeBlob(target: string, scopes: string[] = ["*:*"]): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tok",
      target,
      auth: "bearer",
      scopes,
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

test("AC-43.20: une cible sur le service de metadonnees est refusee sans appel sortant", async () => {
  setup();
  const blob = await makeBlob("http://169.254.169.254");
  const res = await createApp().request(`/${blob}/latest/meta-data/`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "target_forbidden");
  assertEquals(res.headers.get("X-FGP-Source"), "proxy");
  assertEquals(fetchCount, 0);
  teardown();
});

test("AC-43.20 bis: un nom qui resout en prive est refuse", async () => {
  setup("10.0.0.5");
  const blob = await makeBlob("https://interne.example.com");
  const res = await createApp().request(`/${blob}/v1/items`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "target_forbidden");
  assertEquals(fetchCount, 0);
  teardown();
});

test("AC-43.21: le refus de scope precede le refus de destination, aucun DNS resolu", async () => {
  setup("10.0.0.5");
  const blob = await makeBlob("https://interne.example.com", ["GET:/v1/autorise"]);
  const res = await createApp().request(`/${blob}/v1/interdit`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, "scope_denied");
  assertEquals(resolveCount, 0);
  assertEquals(fetchCount, 0);
  teardown();
});

test("AC-43.22: une redirection amont remonte telle quelle, elle n'est pas suivie", async () => {
  setup();
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = ((_i: unknown, init?: RequestInit) => {
    capturedInit = init;
    return Promise.resolve(
      new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } }),
    );
  }) as typeof globalThis.fetch;

  const blob = await makeBlob("https://api.example.com");
  const res = await createApp().request(`/${blob}/v1/items`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("Location"), "http://169.254.169.254/");
  assertEquals(res.headers.get("X-FGP-Source"), "upstream");
  assertEquals(capturedInit?.redirect, "manual");
  teardown();
});

test("AC-43.16: une cible publique legitime continue de fonctionner", async () => {
  setup();
  const blob = await makeBlob("https://api.example.com");
  const res = await createApp().request(`/${blob}/v1/items`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  assertEquals(res.status, 200);
  assertEquals(fetchCount, 1);
  teardown();
});

test("AC-44.8: mode URL et mode header donnent le meme verdict sur les slashes repetes", async () => {
  setup();
  const app = createApp();
  const blob = await makeBlob("https://api.example.com", ["GET:/v1/public/*"]);

  const viaUrl = await app.request(`/${blob}/v1//public//x`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  const statusUrl = viaUrl.status;
  await viaUrl.body?.cancel();

  const headerApp = new Hono();
  const { blobHeaderProxy } = await import("../../src/middleware/proxy.ts");
  headerApp.use("*", blobHeaderProxy());
  const viaHeader = await headerApp.request("/v1//public//x", {
    headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
  });
  const statusHeader = viaHeader.status;
  await viaHeader.body?.cancel();

  assertEquals(statusUrl, statusHeader);
  teardown();
});
