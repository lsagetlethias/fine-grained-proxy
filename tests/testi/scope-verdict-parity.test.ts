import { assertEquals, assertNotEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { checkRequestAccess, type Scope } from "../../src/middleware/scopes.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "verdict-parity-test-key-0123456789";
const SERVER_SALT = "verdict-parity-salt";
const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )) as typeof globalThis.fetch;
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

function makeBlob(scopes: Scope[], v = 5): Promise<string> {
  return encryptBlob(
    {
      v,
      token: "tok",
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

async function proxyAllows(scopes: Scope[], method: string, pathWithQuery: string): Promise<
  boolean
> {
  const blob = await makeBlob(scopes);
  const res = await createApp().request(`/${blob}${pathWithQuery}`, {
    method,
    headers: { "X-FGP-Key": CLIENT_KEY },
  });
  await res.body?.cancel();
  if (res.status === 200) return true;
  assertEquals(res.status, 403, `statut inattendu ${res.status} pour ${method} ${pathWithQuery}`);
  return false;
}

interface Cas {
  titre: string;
  scopes: Scope[];
  method: string;
  path: string;
  attendu: boolean;
}

const PLAIN: Scope[] = ["GET:/v1/items"];
const WILDCARD: Scope[] = ["GET:/v1/public/*"];
const GITLAB: Scope[] = ["GET:/api/v4/projects/*"];
const QUERY_FILTERED: Scope[] = [{
  methods: ["GET"],
  pattern: "/v1/orders",
  queryFilters: [{ param: "status", values: [{ type: "any", value: "open" }] }],
}];

const CORPUS: Cas[] = [
  // Le cas fondateur de l'ADR-0009 §4 : avant le lot de securite, le testeur repondait
  // « refuse » la ou la production repondait 200, parce qu'il comparait le chemin query
  // comprise. Un outil de verification qui se trompe dans le sens permissif est pire que
  // pas d'outil, et c'est ce cas qui le revele.
  { titre: "query non contrainte", scopes: PLAIN, method: "GET", path: "/v1/items", attendu: true },
  {
    titre: "query non contrainte, parametres arbitraires",
    scopes: PLAIN,
    method: "GET",
    path: "/v1/items?action=delete&scope=all",
    attendu: true,
  },
  {
    titre: "methode hors scope",
    scopes: PLAIN,
    method: "POST",
    path: "/v1/items",
    attendu: false,
  },
  {
    titre: "traversee percent-encodee",
    scopes: WILDCARD,
    method: "GET",
    path: "/v1/public/..%2f..%2fadmin",
    attendu: false,
  },
  {
    titre: "wildcard nominal",
    scopes: WILDCARD,
    method: "GET",
    path: "/v1/public/rapport.json",
    attendu: true,
  },
  {
    titre: "cas GitLab, slash encode dans un identifiant",
    scopes: GITLAB,
    method: "GET",
    path: "/api/v4/projects/groupe%2Fprojet",
    attendu: true,
  },
  {
    titre: "query contrainte, valeur declaree",
    scopes: QUERY_FILTERED,
    method: "GET",
    path: "/v1/orders?status=open",
    attendu: true,
  },
  {
    titre: "query contrainte, parametre non declare",
    scopes: QUERY_FILTERED,
    method: "GET",
    path: "/v1/orders?status=open&debug=1",
    attendu: false,
  },
];

Deno.test({
  name: "AC-46.2: PARITE, le testeur de scopes et le proxy rendent le meme verdict",
  fn: async () => {
    setup();
    try {
      for (const cas of CORPUS) {
        // checkRequestAccess est la fonction que le testeur de l'UI appelle : la comparer a
        // la reponse du proxy, c'est comparer les deux verdicts que l'utilisateur voit.
        const testeur = checkRequestAccess(cas.scopes, cas.method, cas.path).allowed;
        const proxy = await proxyAllows(cas.scopes, cas.method, cas.path);

        // Les trois valeurs, pas deux : comparer le testeur au proxy seuls resterait vert
        // si les deux basculaient ensemble sur une lecture des scopes commune mais fausse.
        assertEquals(testeur, cas.attendu, `testeur, ${cas.titre}`);
        assertEquals(proxy, cas.attendu, `proxy, ${cas.titre}`);
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-49.3 (registre v5): le verdict du testeur se calcule sans aucun appel reseau",
  fn: () => {
    let appels = 0;
    const original = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request) => {
      appels++;
      throw new Error(`appel reseau interdit vers ${String(input)}`);
    }) as typeof globalThis.fetch;
    try {
      for (const cas of CORPUS) {
        assertEquals(
          checkRequestAccess(cas.scopes, cas.method, cas.path).allowed,
          cas.attendu,
          cas.titre,
        );
      }
      // C'est ce qui rend la route serveur de test de scope inutile : maintenir une copie
      // serveur d'une logique deja executee dans le navigateur, c'est payer une surface
      // publique non authentifiee pour zero valeur.
      assertEquals(appels, 0, `${appels} appels reseau emis par l'evaluation du verdict`);
    } finally {
      globalThis.fetch = original;
    }
  },
});

Deno.test({
  name: "AC-46.4 (registre v5): un pattern portant un ? reste dechiffrable et ne matche jamais",
  fn: async () => {
    setup();
    try {
      // Blob forge hors ligne, ce que la generation refuse (AC-46.3) : c'est exactement la
      // population des blobs deja en circulation avant ce refus.
      const scopes: Scope[] = ["GET:/v1/items?safe=1", "GET:/v1/orders"];
      const blob = await makeBlob(scopes, 2);

      // Le blob est accepte : refuser casserait /v1/orders pour un gain nul, un pattern qui
      // ne peut rien autoriser n'est pas dangereux (ADR-0006 applique a la validation).
      assertEquals(await proxyAllows(scopes, "GET", "/v1/orders"), true, "scope voisin casse");

      assertNotEquals(blob.length, 0);

      // Le pattern mort ne matche rien, ni sa forme litterale ni la ressource qu'il avait
      // l'air de designer.
      for (const chemin of ["/v1/items", "/v1/items?safe=1", "/v1/items%3Fsafe=1"]) {
        assertEquals(
          await proxyAllows(scopes, "GET", chemin),
          false,
          `le pattern mort a autorise ${chemin}`,
        );
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
