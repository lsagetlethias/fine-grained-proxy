import { assertEquals, assertNotEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { _resetKeyCacheForTests } from "../../src/crypto/key-cache.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const SERVER_SALT = "prevalidation-test-salt";
const originalFetch = globalThis.fetch;
const originalDeriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);

let derivations = 0;

function setup() {
  _resetStoreForTests();
  _resetKeyCacheForTests();
  derivations = 0;
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )) as typeof globalThis.fetch;
  // Espion de comptage nomme par l'ADR-0010 D8. Il porte sur crypto.subtle.deriveKey et
  // non sur le wrapper de src/crypto/blob.ts : c'est le PBKDF2 lui-meme qui coute 11,60 ms,
  // et c'est donc lui qu'il faut voir ne pas se declencher.
  // deno-lint-ignore no-explicit-any
  (crypto.subtle as any).deriveKey = (...args: unknown[]) => {
    derivations++;
    // deno-lint-ignore no-explicit-any
    return (originalDeriveKey as any)(...args);
  };
}

function teardown() {
  // deno-lint-ignore no-explicit-any
  (crypto.subtle as any).deriveKey = originalDeriveKey;
  globalThis.fetch = originalFetch;
  _resetKeyCacheForTests();
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

function makeBlob(clientKey: string): Promise<string> {
  return encryptBlob(
    {
      v: 2,
      token: "tok",
      target: "https://api.mock.local",
      auth: "bearer",
      scopes: ["*:*"],
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    },
    clientKey,
    SERVER_SALT,
  );
}

async function call(blob: string, clientKey: string): Promise<Response> {
  return await createApp().request(`/${blob}/v1/items`, {
    headers: { "X-FGP-Key": clientKey },
  });
}

Deno.test({
  name: "AC-50.7: une cle hors format est refusee avant toute derivation",
  fn: async () => {
    setup();
    try {
      // Blob reel et de taille nominale : le seul motif de refus disponible est la cle,
      // sans quoi le plancher structurel d'AC-50.8 produirait le meme 401 pour une autre
      // raison et le test resterait vert sur une pre-validation de cle supprimee.
      const blob = await makeBlob("cle-de-reference-pour-la-forge-01");
      assertNotEquals(blob.length < 64, true, "le blob temoin doit passer le plancher");

      for (const badKey of ["court", "cle avec une espace dedans 0123456789"]) {
        derivations = 0;
        const res = await call(blob, badKey);
        assertEquals(res.status, 401, `statut inattendu pour la cle ${JSON.stringify(badKey)}`);
        assertEquals((await res.json()).error, "invalid_credentials");
        assertEquals(res.headers.get("X-FGP-Source"), "proxy");
        assertEquals(
          derivations,
          0,
          `PBKDF2 execute ${derivations} fois sur une cle hors format`,
        );
      }

      // Temoin de cablage : sans lui, un espion mal branche ou une route jamais atteinte
      // ferait passer les assertions ci-dessus pour une bonne nouvelle.
      // La forge du blob temoin a peuple le cache de derivation : sans cette purge, le
      // temoin verifierait un hit de cache au lieu d'un PBKDF2.
      _resetKeyCacheForTests();
      derivations = 0;
      const ok = await call(blob, "cle-de-reference-pour-la-forge-01");
      await ok.body?.cancel();
      assertEquals(ok.status, 200);
      assertEquals(derivations, 1, "l'espion ne voit pas la derivation du cas nominal");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-50.8: un blob sous le plancher structurel est refuse avant toute derivation",
  fn: async () => {
    setup();
    try {
      const clientKey = "cle-bien-formee-pour-le-plancher-01";

      // 63 caracteres base64url valent 47 octets : sous l'IV de 12, le tag GCM de 16 et un
      // flux gzip minimal. Ce blob ne peut rien contenir, le dechiffrer serait payer 11,60 ms
      // pour un echec certain.
      const tooShort = "a".repeat(63);
      assertEquals(tooShort.length < 64, true);

      derivations = 0;
      const res = await call(tooShort, clientKey);
      assertEquals(res.status, 401);
      assertEquals((await res.json()).error, "invalid_credentials");
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
      assertEquals(derivations, 0, `PBKDF2 execute ${derivations} fois sur un blob trop court`);

      // Meme cle, meme absence de contenu exploitable, mais au-dessus du plancher : la
      // derivation a lieu. C'est ce qui prouve que le refus ci-dessus vient bien de la
      // taille et pas d'un rejet en amont de la pre-validation.
      derivations = 0;
      const longEnough = "a".repeat(64);
      const res2 = await call(longEnough, clientKey);
      assertEquals(res2.status, 401);
      assertEquals((await res2.json()).error, "invalid_credentials");
      assertEquals(derivations, 1, "un blob au-dessus du plancher doit payer la derivation");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-50.9: une cle bien formee paie la derivation, la pre-validation n'est pas une defense",
  fn: async () => {
    setup();
    try {
      // Non-propriete d'AC-50.9, ecrite pour qu'on ne vende jamais la pre-validation comme
      // une limitation de debit : des cles de 24 caracteres bien formees et toutes
      // differentes ratent le cache a 100 % et paient chacune leur PBKDF2.
      const blob = await makeBlob("cle-de-reference-pour-la-forge-01");
      const attempts = 5;
      derivations = 0;
      for (let i = 0; i < attempts; i++) {
        const res = await call(blob, `cle-aleatoire-bien-formee-${String(i).padStart(6, "0")}`);
        await res.body?.cancel();
        assertEquals(res.status, 401);
      }
      assertEquals(
        derivations,
        attempts,
        "la pre-validation ne doit filtrer que les sondes malformees",
      );
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
