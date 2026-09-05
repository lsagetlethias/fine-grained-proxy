import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { app as uiApp } from "../../src/main.ts";
import { BlobConfig, encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import type { Scope } from "../../src/middleware/scopes.ts";

const CLIENT_KEY = "query-filters-integration-key";
const SERVER_SALT = "query-filters-integration-salt";
const originalFetch = globalThis.fetch;

function setup() {
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
}

// Appele en derniere instruction, teardown ne s'executait pas quand une assertion levait :
// le stub de fetch et les deux variables d'environnement survivaient au test, et un seul
// echec reel en fabriquait plusieurs autres dans le reste du processus.
function isolated(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    setup();
    try {
      await fn();
    } finally {
      teardown();
    }
  };
}

const QUERY_SCOPE = {
  methods: ["GET"],
  pattern: "/v1/items",
  queryFilters: [{ param: "status", values: [{ type: "any", value: "open" }] }],
};

function generateBody(scopes: unknown[]) {
  return {
    token: "tk-us-test-token",
    target: "https://api.mock.local",
    auth: "bearer",
    scopes,
    ttl: 3600,
  };
}

async function post(path: string, body: unknown): Promise<Response> {
  return await uiApp.request(`http://localhost:8000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- AC-53 et AC-54 : generation, partage, version ---

Deno.test({
  name: "AC-53.3: any non-string sur un query filter est refuse a la generation",
  fn: isolated(async () => {
    const res = await post(
      "/api/generate",
      generateBody([{
        methods: ["GET"],
        pattern: "/v1/items",
        queryFilters: [{ param: "page", values: [{ type: "any", value: 1 }] }],
      }]),
    );
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(
      body.message,
      `Type "any" on a query filter only accepts a string value (param: 'page')`,
    );
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-53.14: la validation de generation n'ignore pas un scope sans bodyFilters",
  fn: isolated(async () => {
    // Le scope ne porte AUCUN bodyFilters : c'est le cas majoritaire de la v5, et celui
    // que l'ancienne boucle de validation sautait avant d'avoir rien verifie.
    const res = await post(
      "/api/generate",
      generateBody([{
        methods: ["GET"],
        pattern: "/v1/items",
        queryFilters: [
          { param: "a", values: [{ type: "any", value: "1" }] },
          { param: "a", values: [{ type: "any", value: "2" }] },
        ],
      }]),
    );
    assertEquals(res.status, 400);
    assertEquals((await res.json()).message, "Duplicate query filter for param 'a'");
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-53.15: POST /api/generate ne supprime pas silencieusement les queryFilters",
  fn: isolated(async () => {
    const gen = await post("/api/generate", generateBody([QUERY_SCOPE]));
    assertEquals(gen.status, 200);
    const { blob, key } = await gen.json();

    const dec = await post("/api/decode", { blob, key });
    assertEquals(dec.status, 200);
    const decoded = await dec.json();

    // AC-54.1 : la presence de queryFilters porte le blob en v5.
    assertEquals(decoded.version, 5);
    const entry = decoded.scopes[0];
    assertEquals(entry.queryFilters.length, 1);
    assertEquals(entry.queryFilters[0].param, "status");
    assertEquals(entry.queryFilters[0].values[0].value, "open");
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-53.15 bis: une cle inconnue dans un ScopeEntry est refusee, jamais strippee",
  fn: isolated(async () => {
    // Une cle mal orthographiee doit produire une erreur. Strippee en silence, elle
    // produirait un blob ampute de sa contrainte, que rien ne signalerait a son auteur.
    const res = await post(
      "/api/generate",
      generateBody([{
        methods: ["GET"],
        pattern: "/v1/items",
        queryFilter: [{ param: "status", values: [{ type: "any", value: "open" }] }],
      }]),
    );
    assertEquals(res.status, 400);
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-53.16: POST /api/share/encode ne supprime pas silencieusement les queryFilters",
  fn: isolated(async () => {
    const enc = await post("/api/share/encode", {
      target: "https://api.mock.local",
      auth: "bearer",
      scopes: [QUERY_SCOPE],
      ttl: 3600,
    });
    assertEquals(enc.status, 200);
    const { encoded } = await enc.json();

    const dec = await post("/api/share/decode", { encoded });
    assertEquals(dec.status, 200);
    const decoded = await dec.json();
    const entry = decoded.scopes[0];
    assertEquals(entry.queryFilters.length, 1);
    assertEquals(entry.queryFilters[0].param, "status");
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-53.16 bis: /api/share/encode refuse aussi une cle inconnue",
  fn: isolated(async () => {
    const res = await post("/api/share/encode", {
      target: "https://api.mock.local",
      auth: "bearer",
      scopes: [{ methods: ["GET"], pattern: "/v1/items", queryFilterz: [] }],
      ttl: 3600,
    });
    assertEquals(res.status, 400);
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

// Le schema Zod type not.value et les elements de and.value en unknown : un discriminant
// inconnu imbrique traversait la generation, etait chiffre, et n'echouait qu'au
// dechiffrement. L'auteur repartait avec un blob mort et un bandeau vert.
const NESTED_UNKNOWN: [string, unknown][] = [
  ["not", { type: "not", value: { type: "unknown", value: "x" } }],
  ["and", {
    type: "and",
    value: [{ type: "any", value: "open" }, { type: "unknown", value: "x" }],
  }],
  ["not(and)", {
    type: "not",
    value: {
      type: "and",
      value: [{ type: "any", value: "open" }, { type: "unknown", value: "x" }],
    },
  }],
  ["regex a valeur non-string", { type: "not", value: { type: "regex", value: 42 } }],
];

for (const [label, value] of NESTED_UNKNOWN) {
  Deno.test({
    name: `parite generation : un type invalide sous « ${label} » est refuse avant chiffrement`,
    fn: isolated(async () => {
      const query = await post(
        "/api/generate",
        generateBody([{
          methods: ["GET"],
          pattern: "/v1/items",
          queryFilters: [{ param: "status", values: [value] }],
        }]),
      );
      assertEquals(query.status, 400, label);

      const body = await post(
        "/api/generate",
        generateBody([{
          methods: ["POST"],
          pattern: "/v1/items",
          bodyFilters: [{ objectPath: "a", objectValue: [value] }],
        }]),
      );
      assertEquals(body.status, 400, label);
    }),
    sanitizeOps: false,
    sanitizeResources: false,
  });
}

Deno.test({
  name: "un scope valide portant les memes structures imbriquees passe toujours",
  fn: isolated(async () => {
    const res = await post(
      "/api/generate",
      generateBody([{
        methods: ["GET"],
        pattern: "/v1/items",
        queryFilters: [{
          param: "status",
          values: [{
            type: "and",
            value: [
              { type: "stringwildcard", value: "op*" },
              { type: "not", value: { type: "any", value: "opaque" } },
            ],
          }],
        }],
      }]),
    );
    assertEquals(res.status, 200, await res.clone().text());
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-55.8 et AC-56.10 : comportement du proxy ---

function createProxyApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

function captureFetch(): { url: () => string } {
  let seen = "";
  globalThis.fetch = ((input: string | URL | Request) => {
    seen = String(input instanceof Request ? input.url : input);
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof globalThis.fetch;
  return { url: () => seen };
}

function makeBlob(scopes: Scope[]): Promise<string> {
  return encryptBlob(
    {
      v: 5,
      token: "tk-us-test-token",
      target: "https://api.mock.local",
      auth: "bearer",
      scopes,
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    } as BlobConfig,
    CLIENT_KEY,
    SERVER_SALT,
  );
}

Deno.test({
  name: "AC-55.8: la query controlee est exactement la query emise",
  fn: isolated(async () => {
    const captured = captureFetch();
    const app = createProxyApp();
    const blob = await makeBlob([{
      methods: ["GET"],
      pattern: "/v1/items",
      queryFilters: [{ param: "q", values: [{ type: "wildcard" }] }],
    } as unknown as Scope]);

    const res = await app.request(`/${blob}/v1/items?q=a%20b%2Fc`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    // Le controle porte sur la forme decodee, l'emission sur la forme brute.
    assertEquals(new URL(captured.url()).search, "?q=a%20b%2Fc");
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-56.10: en production le refus sur l'axe query reste generique",
  fn: isolated(async () => {
    captureFetch();
    const app = createProxyApp();
    const blob = await makeBlob([{
      methods: ["GET"],
      pattern: "/v1/items",
      queryFilters: [{
        param: "status",
        values: [{ type: "any", value: "open" }],
        required: true,
      }],
    } as unknown as Scope]);

    // Les quatre causes de refus de l'axe query, une par requete.
    const cases: [string, string][] = [
      ["parametre non declare", "/v1/items?status=open&sort=asc"],
      ["parametre requis absent", "/v1/items"],
      ["valeur non autorisee", "/v1/items?status=closed"],
      [
        "occurrences en surnombre",
        "/v1/items?" + Array.from({ length: 65 }, () => "status=open").join("&"),
      ],
    ];

    for (const [label, path] of cases) {
      const res = await app.request(`/${blob}${path}`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 403, label);
      assertEquals(res.headers.get("X-FGP-Source"), "proxy", label);
      const body = await res.json();
      assertEquals(body.error, "scope_denied", label);
      // Le message ne nomme ni le parametre fautif, ni la cause, ni la structure du blob.
      const serialized = JSON.stringify(body);
      for (const leak of ["status", "sort", "queryFilters", "occurrence", "required"]) {
        assertEquals(
          serialized.includes(leak),
          false,
          `${label} : « ${leak} » ne doit pas fuiter dans la reponse de production`,
        );
      }
    }
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-51.3 bis: integration, une requete conforme traverse le proxy",
  fn: isolated(async () => {
    const captured = captureFetch();
    const app = createProxyApp();
    const blob = await makeBlob([{
      methods: ["GET"],
      pattern: "/v1/items",
      queryFilters: [{ param: "status", values: [{ type: "any", value: "open" }] }],
    } as unknown as Scope]);

    const res = await app.request(`/${blob}/v1/items?status=open`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("X-FGP-Source"), "upstream");
    assertEquals(new URL(captured.url()).search, "?status=open");
  }),
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "l'etat de test ne fuit pas quand une assertion leve",
  fn: async () => {
    let raised = false;
    try {
      await isolated(() => {
        globalThis.fetch = (() => {
          throw new Error("stub qui ne doit pas survivre");
        }) as typeof globalThis.fetch;
        throw new Error("echec simule");
      })();
    } catch {
      raised = true;
    }
    assertEquals(raised, true);
    assertEquals(globalThis.fetch, originalFetch);
    assertEquals(Deno.env.get("FGP_SALT"), undefined);
    assertEquals(Deno.env.get("FGP_EGRESS_ALLOW_PRIVATE"), undefined);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
