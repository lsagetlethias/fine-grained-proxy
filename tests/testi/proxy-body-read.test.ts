import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import type { Scope } from "../../src/middleware/scopes.ts";

const CLIENT_KEY = "body-read-test-key-0123456789abc";
const SERVER_SALT = "body-read-salt";
const DETAILED_MAX_KB = 8;

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  Deno.env.set("FGP_LOGS_ENABLED", "1");
  Deno.env.set("FGP_LOGS_DETAILED_MAX_KB", String(DETAILED_MAX_KB));
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("FGP_LOGS_ENABLED");
  Deno.env.delete("FGP_LOGS_DETAILED_MAX_KB");
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

function makeBlob(scopes: Scope[]): Promise<string> {
  return encryptBlob(
    {
      v: 3,
      token: "tok",
      target: "https://api.mock.local",
      auth: "bearer",
      scopes,
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
      logs: { enabled: true, detailed: true },
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

async function poste(blob: string, octetsDeBourrage: number): Promise<number> {
  const res = await createApp().request(`/${blob}/v1/items`, {
    method: "POST",
    headers: { "X-FGP-Key": CLIENT_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "x", padding: "a".repeat(octetsDeBourrage) }),
  });
  await res.body?.cancel();
  return res.status;
}

const AVEC_FILTRE: Scope[] = [{
  methods: ["POST"],
  pattern: "/v1/items",
  bodyFilters: [{ objectPath: "kind", objectValue: [{ type: "any", value: "x" }] }],
}];
const SANS_FILTRE: Scope[] = ["POST:/v1/items"];

Deno.test({
  name: "AC-47.7: quand seule la capture detailed a besoin du corps, la lecture s'arrete plus tot",
  fn: async () => {
    setup();
    try {
      // Taille intermediaire : au-dessus du plafond de capture de 8 Ko, tres en dessous des
      // 512 Ko de l'inspection. C'est la seule fenetre ou les deux plafonds se distinguent.
      const INTERMEDIAIRE = 32 * 1024;

      const detailedSeul = await makeBlob(SANS_FILTRE);
      const avecFiltre = await makeBlob(AVEC_FILTRE);

      // Lire 512 Ko pour n'en garder que 8 serait du gaspillage sur le chemin chaud : la
      // lecture s'arrete peu apres le plafond de capture et la requete est refusee la.
      assertEquals(
        await poste(detailedSeul, INTERMEDIAIRE),
        413,
        "la capture detailed lit au-dela de son propre plafond",
      );

      // Meme corps, meme capture detailed, mais un body filter en plus : le besoin change,
      // le plafond aussi, et la requete passe. Sans ce cas, un plafond global rabaisse a
      // 8 Ko rendrait l'assertion precedente verte tout en cassant l'inspection des corps.
      assertEquals(
        await poste(avecFiltre, INTERMEDIAIRE),
        200,
        "un body filter doit pouvoir inspecter bien au-dela du plafond de capture",
      );

      // Bornes de part et d'autre : sous le plafond de capture la requete passe, et le
      // plafond d'inspection reste celui de l'ADR-0010 D7.
      assertEquals(await poste(detailedSeul, 1024), 200);
      assertEquals(await poste(avecFiltre, 1024 * 1024), 413);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
