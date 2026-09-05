import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "headers-policy-test-key-0123456789";
const SERVER_SALT = "headers-policy-salt";

const originalFetch = globalThis.fetch;
let captured: Headers | null = null;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  captured = null;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    captured = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

async function makeBlob(auth: string, token: string): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token,
      target: "https://api.mock.local",
      auth,
      scopes: ["*:*"],
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

async function call(headers: Record<string, string>, auth = "header:X-API-Key") {
  const app = createApp();
  const blob = await makeBlob(auth, "secret-du-blob");
  const res = await app.request(`/${blob}/v1/items`, {
    headers: { "X-FGP-Key": CLIENT_KEY, ...headers },
  });
  await res.body?.cancel();
  return captured!;
}

Deno.test({
  name: "AC-45.1: l'Authorization de l'appelant n'atteint pas l'upstream",
  fn: async () => {
    setup();
    const h = await call({ "Authorization": "Bearer attaquant" });
    assertEquals(h.get("authorization"), null);
    assertEquals(h.get("x-api-key"), "secret-du-blob");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.2: le Cookie de l'appelant n'est pas transmis",
  fn: async () => {
    setup();
    const h = await call({ "Cookie": "session=vole" });
    assertEquals(h.get("cookie"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.3: les en-tetes hop-by-hop ne sont pas transmis",
  fn: async () => {
    setup();
    const h = await call({
      "TE": "trailers",
      "Upgrade": "websocket",
      "Proxy-Authorization": "Basic xxx",
      "Keep-Alive": "timeout=5",
    });
    for (const name of ["te", "upgrade", "proxy-authorization", "keep-alive"]) {
      assertEquals(h.get(name), null, name);
    }
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// Registre v5 AC-45.4. Le test ci-dessous porte deja ce numero pour un autre enonce,
// decalage recense dans docs/review/ac-coverage-v5.md et traite hors de ce lot.
Deno.test({
  name: "AC-45.4 (registre v5): les en-tetes nommes par Connection sont retires aussi",
  fn: async () => {
    setup();
    const h = await call({
      "Connection": "X-Custom-A, X-Custom-B",
      "X-Custom-A": "valeur-a",
      "X-Custom-B": "valeur-b",
      "X-Custom-C": "valeur-c",
    });

    assertEquals(h.get("connection"), null);
    assertEquals(h.get("x-custom-a"), null, "en-tete nomme par Connection relaye");
    assertEquals(h.get("x-custom-b"), null, "en-tete nomme par Connection relaye");

    // Controle negatif : la regle porte sur ce que Connection designe, pas sur tout
    // en-tete proprietaire. Sans lui, un strip trop large passerait pour une reussite.
    assertEquals(h.get("x-custom-c"), "valeur-c");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.4 bis (registre v5): la designation par Connection ignore casse et espaces",
  fn: async () => {
    setup();
    const h = await call({
      "Connection": "  x-custom-a ,X-CUSTOM-B  ",
      "X-Custom-A": "valeur-a",
      "X-Custom-B": "valeur-b",
    });

    assertEquals(h.get("x-custom-a"), null);
    assertEquals(h.get("x-custom-b"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.4: les en-tetes de provenance ne sont pas transmis",
  fn: async () => {
    setup();
    const h = await call({
      "X-Forwarded-For": "1.2.3.4",
      "X-Real-IP": "1.2.3.4",
      "Forwarded": "for=1.2.3.4",
      "X-Forwarded-Host": "evil.example",
      "X-Forwarded-Proto": "http",
    });
    for (
      const name of [
        "x-forwarded-for",
        "x-real-ip",
        "forwarded",
        "x-forwarded-host",
        "x-forwarded-proto",
      ]
    ) {
      assertEquals(h.get(name), null, name);
    }
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.5: tout en-tete X-FGP-* est retire",
  fn: async () => {
    setup();
    const h = await call({ "X-FGP-Blob": "zzz", "X-FGP-Source": "forge", "X-FGP-Custom": "x" });
    assertEquals(h.get("x-fgp-key"), null);
    assertEquals(h.get("x-fgp-blob"), null);
    assertEquals(h.get("x-fgp-source"), null);
    assertEquals(h.get("x-fgp-custom"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.6: un en-tete applicatif quelconque est bien transmis",
  fn: async () => {
    setup();
    const h = await call({
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Idempotency-Key": "abc-123",
      "If-None-Match": '"etag"',
    });
    assertEquals(h.get("accept"), "application/vnd.github+json");
    assertEquals(h.get("x-github-api-version"), "2022-11-28");
    assertEquals(h.get("idempotency-key"), "abc-123");
    assertEquals(h.get("if-none-match"), '"etag"');
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.7: l'en-tete d'auth du blob ecrase celui de l'appelant portant le meme nom",
  fn: async () => {
    setup();
    const h = await call({ "X-API-Key": "clef-de-l-appelant" });
    assertEquals(h.get("x-api-key"), "secret-du-blob");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-45.10 (registre v5): l'ordre des passes preserve l'Authorization issue du blob",
  fn: async () => {
    setup();
    // Authorization est dans la denylist appliquee a l'appelant. Si cette passe tournait
    // apres la pose des en-tetes d'auth, elle supprimerait celle du blob et le mode bearer
    // partirait nu vers la cible : la requete serait refusee en amont sans que rien ici
    // ne le voie, puisque le proxy est transparent. C'est la moitie observable du critere.
    const h = await call({ "Authorization": "Bearer de-l-appelant" }, "bearer");
    assertEquals(h.get("authorization"), "Bearer secret-du-blob");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
