import { assertEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import type { BlobConfig } from "../../src/crypto/blob.ts";
import { _getNetworkBufferForTests, _resetStoreForTests } from "../../src/logs/store.ts";
import { computeBlobId } from "../../src/logs/blob-id.ts";

const SALT = "logs-query-capture-salt";
const CLIENT_KEY = "logs-query-capture-key-0123";
const API_KEY = "sk-live-000000";
const TOKEN = "abcdef";

function makeBlob(overrides: Partial<BlobConfig> = {}): Promise<string> {
  const config: BlobConfig = {
    v: 2,
    token: "tk-test",
    target: "https://api.mock.local",
    auth: "bearer",
    scopes: ["GET:/v1/items"],
    ttl: 3600,
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
  return encryptBlob(config, CLIENT_KEY, SALT);
}

const originalFetch = globalThis.fetch;

// La capture n'est observable qu'a travers le proxy reel : les criteres AC-57.1 et AC-57.2
// portent sur l'entry telle qu'elle atterrit dans le ring buffer, pas sur le retour de
// extractQueryParamNames. Une fuite peut entrer par n'importe lequel des champs poses par
// captureNetwork, et le « path » en est un.
function proxied(fn: (ctx: { blob: string; blobId: string }) => Promise<void>, logsOn = true) {
  return async () => {
    Deno.env.set("FGP_SALT", SALT);
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
    if (logsOn) Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch;
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      await fn({ blob, blobId: await computeBlobId(blob) });
    } finally {
      globalThis.fetch = originalFetch;
      _resetStoreForTests();
      Deno.env.delete("FGP_SALT");
      Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
      Deno.env.delete("FGP_LOGS_ENABLED");
    }
  };
}

async function call(blob: string, pathWithQuery: string): Promise<void> {
  const res = await app.request(`/${blob}${pathWithQuery}`, {
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  await res.body?.cancel();
}

Deno.test({
  name: "AC-57.1: les noms de parametres sont captures et le path reste sans query",
  fn: proxied(async ({ blob, blobId }) => {
    await call(blob, "/v1/items?status=open&per_page=50");

    const buf = _getNetworkBufferForTests(blobId);
    assertEquals(buf.length, 1);
    assertEquals(buf[0].queryParamNames, ["status", "per_page"]);
    // Le champ « path » decrit le chemin, pas la requete : §14.6 le veut inchange. Y laisser
    // la query y ferait entrer les valeurs par la porte de service, sur la seule surface que
    // rien ne chiffre.
    assertEquals(buf[0].path, "/v1/items");
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-57.2: SECURITE, aucune valeur de parametre n'entre dans l'entry network",
  fn: proxied(async ({ blob, blobId }) => {
    await call(blob, `/v1/items?api_key=${API_KEY}&token=${TOKEN}&status=open`);

    const buf = _getNetworkBufferForTests(blobId);
    assertEquals(buf.length, 1);
    assertEquals(buf[0].queryParamNames, ["api_key", "token", "status"]);
    // Le recensement porte sur l'entry entiere et non sur un champ nomme : c'est ce qui
    // distingue ce critere d'une assertion sur queryParamNames, qui resterait verte si la
    // valeur entrait par « path » ou par une concatenation quelconque.
    const serialized = JSON.stringify(buf[0]);
    for (const secret of [API_KEY, TOKEN]) {
      assertEquals(
        serialized.includes(secret),
        false,
        `« ${secret} » a fuite dans l'entry network, qui vit en clair dans le ring buffer : ` +
          serialized,
      );
    }
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-57.3: le comptage d'occurrences est diagnosticable sans les valeurs",
  fn: proxied(async ({ blob, blobId }) => {
    const ids = Array.from({ length: 5 }, (_, i) => `ids=v${i}`).join("&");
    await call(blob, `/v1/items?${ids}&status=open`);

    const buf = _getNetworkBufferForTests(blobId);
    assertEquals(buf[0].queryParamNames, ["ids", "status"]);
    // Un ensemble dedoublonne perdrait le « 5 », qui est la seule information capable
    // d'expliquer a posteriori un refus par plafond d'occurrences (AC-52.2).
    assertEquals(buf[0].queryParamRepeats, [["ids", 5]]);
    assertEquals(JSON.stringify(buf[0]).includes("v3"), false);
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-57.7: aucune capture quand la requete n'a pas de query",
  fn: proxied(async ({ blob, blobId }) => {
    await call(blob, "/v1/items");

    const buf = _getNetworkBufferForTests(blobId);
    assertEquals(buf.length, 1);
    // Le champ doit etre absent, jamais un tableau contenant la chaine vide : celle-ci se
    // lirait comme un parametre au nom vide reellement envoye par l'appelant, cas que
    // AC-55.10 traite comme un parametre a part entiere.
    assertEquals(buf[0].queryParamNames, undefined);
    assertEquals(buf[0].queryParamRepeats, undefined);
    assertEquals(buf[0].queryParamNamesTruncated, undefined);
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-57.8: NON-REGRESSION, la capture des noms reste soumise au meme gating",
  fn: proxied(async ({ blob, blobId }) => {
    // Kill switch a l'arret : proxied ne l'a pas pose, la requete doit passer sans qu'aucune
    // entry ne soit stockee, noms de parametres compris.
    await call(blob, `/v1/items?api_key=${API_KEY}`);
    assertEquals(_getNetworkBufferForTests(blobId).length, 0);
  }, false),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-57.8 bis: un blob sans logs.enabled ne capture aucun nom de parametre",
  fn: async () => {
    Deno.env.set("FGP_SALT", SALT);
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch;
    try {
      const blob = await makeBlob();
      const blobId = await computeBlobId(blob);
      await call(blob, `/v1/items?api_key=${API_KEY}`);
      assertEquals(_getNetworkBufferForTests(blobId).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      _resetStoreForTests();
      Deno.env.delete("FGP_SALT");
      Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
      Deno.env.delete("FGP_LOGS_ENABLED");
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
