import { assertEquals, assertNotEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";

import { app } from "../../src/main.ts";
import {
  FGP_SECURITY_HEADERS,
  FGP_SOURCE_HEADER,
  FGP_SOURCE_PROXY,
  FGP_SOURCE_UPSTREAM,
  SWAGGER_DOCS_PATH,
} from "../../src/constants.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { blobHeaderProxy, proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "security-headers-test-key";
const SERVER_SALT = "security-headers-test-salt";

const originalFetch = globalThis.fetch;

// Ces en-tetes varient legitimement d'une reponse a l'autre : les comparer ferait echouer
// la parite pour de mauvaises raisons.
const VOLATILE_HEADERS = new Set([
  "content-type",
  "content-length",
  "date",
  "x-fgp-source",
  // Mecanisme de decouverte /llms.txt (AC-40.14), pose sur les seules reponses HTML.
  // Ce n'est pas un en-tete de securite : le comparer ferait echouer la parite a tort.
  "link",
]);

const SECURITY_HEADER_NAMES = FGP_SECURITY_HEADERS.map(([name]) => name.toLowerCase());

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function makeBlob(
  overrides?: Partial<{
    scopes: string[];
    ttl: number;
    createdAt: number;
    target: string;
    logs: { enabled: boolean; detailed: boolean };
  }>,
): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tk-us-test-token",
      target: overrides?.target ?? "https://api.mock.local",
      auth: "bearer",
      scopes: overrides?.scopes ?? ["GET:/v1/apps"],
      ttl: overrides?.ttl ?? 3600,
      createdAt: overrides?.createdAt ?? nowUnix(),
      ...(overrides?.logs ? { logs: overrides.logs } : {}),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

function mockUpstream(status: number, body: BodyInit | null, headers?: HeadersInit) {
  globalThis.fetch = (): Promise<Response> =>
    Promise.resolve(new Response(body, { status, headers }));
}

/** Sous-ensemble des en-tetes de securite reellement presents sur une reponse. */
function securityHeadersOf(res: Response): string[] {
  return SECURITY_HEADER_NAMES.filter((name) => res.headers.has(name));
}

function comparableHeaders(res: Response): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of res.headers) {
    const key = name.toLowerCase();
    if (!VOLATILE_HEADERS.has(key)) out.set(key, value);
  }
  return out;
}

// --- AC-41.1 a AC-41.4 : en-tetes sur les chemins servis par FGP ---

Deno.test({
  name: "AC-41.1: chemins FGP, tous les en-tetes de securite sont poses",
  fn: async () => {
    setup();
    try {
      for (const path of ["/", "/healthz", "/logs/health", "/api/salt", "/llms.txt"]) {
        const res = await app.request(path);
        await res.body?.cancel();

        assertEquals(
          securityHeadersOf(res).length,
          SECURITY_HEADER_NAMES.length,
          `${path} ne porte pas tous les en-tetes de securite`,
        );
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.2: CSP commune, default-src none et pas de unsafe-inline",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/");
      await res.body?.cancel();
      const csp = res.headers.get("content-security-policy") ?? "";

      for (
        const directive of [
          "default-src 'none'",
          "base-uri 'none'",
          "script-src 'self'",
          "style-src 'self'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
        ]
      ) {
        assertStringIncludes(csp, directive);
      }
      assertEquals(csp.includes("unsafe-inline"), false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.3: /api/docs recoit une CSP dediee, jamais aucune CSP",
  fn: async () => {
    setup();
    try {
      const res = await app.request(SWAGGER_DOCS_PATH);
      await res.body?.cancel();
      const csp = res.headers.get("content-security-policy") ?? "";

      assertNotEquals(csp, "");
      assertStringIncludes(csp, "unsafe-inline");
      assertStringIncludes(csp, "cdn.jsdelivr.net");
      // Le durcissement de fond survit a la permissivite accordee a Swagger.
      assertStringIncludes(csp, "default-src 'none'");
      assertStringIncludes(csp, "frame-ancestors 'none'");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-41.4 : Cache-Control no-store sur les reponses porteuses de secrets ---

Deno.test({
  name: "AC-41.4: /api/salt, /api/decode et /api/generate repondent en Cache-Control no-store",
  fn: async () => {
    setup();
    try {
      const salt = await app.request("/api/salt");
      await salt.body?.cancel();
      assertEquals(salt.headers.get("cache-control"), "no-store");

      // La reponse porte la configuration dechiffree : elle ne doit jamais etre mise en cache.
      const decode = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob: await makeBlob(), key: CLIENT_KEY }),
      });
      await decode.body?.cancel();
      assertEquals(decode.status, 200);
      assertEquals(decode.headers.get("cache-control"), "no-store");

      // La reponse porte la cle client, renvoyee une seule fois et jamais stockee.
      const generate = await app.request("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "tk-us-test",
          target: "https://api.example.com",
          auth: "bearer",
          scopes: ["GET:/v1/apps"],
          ttl: 3600,
        }),
      });
      await generate.body?.cancel();
      assertEquals(generate.status, 200);
      assertEquals(generate.headers.get("cache-control"), "no-store");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.4: le no-store est pose meme quand la reponse est une erreur",
  fn: async () => {
    setup();
    try {
      // L'en-tete est pose avant le branchement d'erreur : un 401 sur /api/decode derive
      // quand meme d'un secret, il ne doit pas plus etre cache qu'un 200.
      const res = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob: await makeBlob(), key: "mauvaise-cle" }),
      });
      await res.body?.cancel();

      assertEquals(res.status, 401);
      assertEquals(res.headers.get("cache-control"), "no-store");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.4: /logs/stream repond en no-store, avec no-transform pour le SSE",
  fn: async () => {
    setup();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });

      const controller = new AbortController();
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
        signal: controller.signal,
      });

      assertEquals(res.status, 200);
      const cacheControl = res.headers.get("cache-control") ?? "";
      // no-transform en plus : un proxy intermediaire qui tamponnerait le flux casserait
      // le temps reel du stream.
      assertStringIncludes(cacheControl, "no-store");
      assertStringIncludes(cacheControl, "no-transform");

      controller.abort();
      try {
        await res.body?.cancel();
      } catch {
        // le flux est deja rompu par l'abort
      }
    } finally {
      Deno.env.delete("FGP_LOGS_ENABLED");
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.4: les routes sans secret ne sont pas passees en no-store par erreur",
  fn: async () => {
    setup();
    try {
      // Contre-epreuve : /llms.txt est un document public, il doit rester cacheable.
      // Sans elle, un no-store applique trop largement passerait inapercu.
      const llms = await app.request("/llms.txt");
      await llms.body?.cancel();
      assertEquals(llms.headers.get("cache-control"), "public, max-age=3600");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-41.5 a AC-41.8 : invariant ADR-0006, aucune reponse upstream enrichie ---

Deno.test({
  name: "AC-41.5: INVARIANT, une reponse upstream en mode URL ne porte aucun en-tete de securite",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      mockUpstream(200, JSON.stringify({ apps: [] }), {
        "Content-Type": "application/json",
      });

      const proxyApp = new Hono();
      proxyApp.use("/:blob{.+}/*", proxyMiddleware());

      const res = await proxyApp.request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_UPSTREAM);
      assertEquals(
        securityHeadersOf(res),
        [],
        "une reponse forwardee a ete enrichie : la transparence ADR-0006 est cassee",
      );
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "AC-41.6: INVARIANT, une reponse upstream en mode header ne porte aucun en-tete de securite",
  fn: async () => {
    setup();
    try {
      // Les paths qui collisionnent avec un chemin FGP sont le cas dangereux : c'est la que
      // le middleware de securite serait monte si blobHeaderProxy ne passait pas en premier.
      // /logs est volontairement absent, il n'est pas proxyfiable en mode header (AC-41.15).
      for (const path of ["/", "/api/salt", "/llms.txt", "/healthz", "/static/styles.css"]) {
        const blob = await makeBlob({ scopes: ["*:*"] });
        mockUpstream(200, "upstream body", { "Content-Type": "text/plain" });

        const res = await app.request(path, {
          headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
        });
        await res.body?.cancel();

        assertEquals(
          res.headers.get(FGP_SOURCE_HEADER),
          FGP_SOURCE_UPSTREAM,
          `${path} n'a pas ete proxyfie en mode header`,
        );
        assertEquals(
          securityHeadersOf(res),
          [],
          `${path} : reponse upstream enrichie en mode header`,
        );
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.7: INVARIANT, une CSP emise par l'upstream n'est ni ecrasee ni doublee",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      mockUpstream(200, "<html></html>", {
        "Content-Type": "text/html",
        "Content-Security-Policy": "default-src https://exemple.test",
      });

      const proxyApp = new Hono();
      proxyApp.use("/:blob{.+}/*", proxyMiddleware());

      const res = await proxyApp.request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.headers.get("content-security-policy"), "default-src https://exemple.test");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.8: INVARIANT structurel, le middleware n'est monte sur aucun pattern fourre-tout",
  fn: () => {
    // Un pattern trop large poserait les en-tetes sur du trafic proxyfie sans qu'aucun autre
    // test ne bronche : les routes FGP resteraient durcies, la transparence tomberait en silence.
    const securityRoutes = app.routes.filter((r) => r.handler.name === "securityHeaders");
    const forbidden = ["*", "/*", "/:blob/*", "/:blob{.+}/*"];

    for (const route of securityRoutes) {
      assertEquals(
        forbidden.includes(route.path),
        false,
        `en-tetes de securite montes sur le pattern fourre-tout ${route.path}`,
      );
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-41.9 : recensement enumere depuis l'app Hono, jamais depuis une liste manuelle ---

Deno.test({
  name: "AC-41.9: toutes les routes FGP enregistrees sur l'app portent les en-tetes de securite",
  fn: async () => {
    setup();
    try {
      // La source de verite est l'application elle-meme. Une liste ecrite ici ne detecterait
      // rien : qui oublie FGP_OWNED_PATHS oublierait aussi la liste du test.
      const proxyPatterns = new Set(["/:blob/*", "/:blob{.+}/*", "*", "/*"]);
      const paths = new Set<string>();

      for (const route of app.routes) {
        if (proxyPatterns.has(route.path)) continue;
        if (route.path.includes(":blob")) continue;
        // Les patterns a joker ne sont pas requetables tels quels : on les instancie.
        const concrete = route.path
          .replace("/static/*", "/static/styles.css")
          .replace("/api/*", "/api/salt")
          .replace("/logs/*", "/logs/health");
        if (concrete.includes("*") || concrete.includes(":")) continue;
        paths.add(concrete);
      }

      assertNotEquals(paths.size, 0, "aucune route FGP enumeree, le test ne verifie rien");

      const uncovered: string[] = [];
      for (const path of paths) {
        const res = await app.request(path);
        await res.body?.cancel();
        if (!res.headers.has("x-content-type-options")) uncovered.push(path);
      }

      assertEquals(
        uncovered,
        [],
        `routes FGP non durcies, a inscrire dans FGP_OWNED_PATHS : ${uncovered.join(", ")}`,
      );
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.10: le 404 statique est genere par FGP et porte les en-tetes",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/static/inexistant.css");
      await res.body?.cancel();

      assertEquals(res.status, 404);
      assertEquals(securityHeadersOf(res).length, SECURITY_HEADER_NAMES.length);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-41.12 : les erreurs FGP de la route proxy sont durcies ---

Deno.test({
  name: "AC-41.12: les erreurs FGP de la route proxy portent les en-tetes, mode header",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();

      // missing_key : X-FGP-Blob present, X-FGP-Key absent.
      const missingKey = await app.request("/v1/apps", {
        headers: { "X-FGP-Blob": blob },
      });
      const missingKeyBody = await missingKey.json();

      assertEquals(missingKey.status, 401);
      assertEquals(missingKeyBody.error, "missing_key");
      assertEquals(missingKey.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
      assertEquals(securityHeadersOf(missingKey).length, SECURITY_HEADER_NAMES.length);

      // invalid_credentials : mauvaise cle client.
      const badKey = await app.request("/v1/apps", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": "mauvaise-cle" },
      });
      const badKeyBody = await badKey.json();

      assertEquals(badKey.status, 401);
      assertEquals(badKeyBody.error, "invalid_credentials");
      assertEquals(securityHeadersOf(badKey).length, SECURITY_HEADER_NAMES.length);

      // scope_denied : blob valide, methode hors scope.
      const denied = await app.request("/v1/apps", {
        method: "DELETE",
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      const deniedBody = await denied.json();

      assertEquals(denied.status, 403);
      assertEquals(deniedBody.error, "scope_denied");
      assertEquals(securityHeadersOf(denied).length, SECURITY_HEADER_NAMES.length);

      // token_expired : TTL depasse.
      const expired = await makeBlob({ ttl: 60, createdAt: nowUnix() - 3600 });
      const expiredRes = await app.request("/v1/apps", {
        headers: { "X-FGP-Blob": expired, "X-FGP-Key": CLIENT_KEY },
      });
      const expiredBody = await expiredRes.json();

      assertEquals(expiredRes.status, 410);
      assertEquals(expiredBody.error, "token_expired");
      assertEquals(securityHeadersOf(expiredRes).length, SECURITY_HEADER_NAMES.length);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-41.13 : parite des trois sources ---

Deno.test({
  name: "AC-41.13: PARITE, route UI, erreur FGP du proxy et FGP_SECURITY_HEADERS concordent",
  fn: async () => {
    setup();
    try {
      const uiRes = await app.request("/");
      await uiRes.body?.cancel();

      const blob = await makeBlob();
      const proxyErrRes = await app.request("/v1/apps", {
        method: "DELETE",
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      await proxyErrRes.body?.cancel();
      assertEquals(proxyErrRes.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);

      const ui = comparableHeaders(uiRes);
      const proxyErr = comparableHeaders(proxyErrRes);
      const constant = new Map(
        FGP_SECURITY_HEADERS.map(([name, value]) => [name.toLowerCase(), value]),
      );

      // Les trois jeux de noms doivent coincider exactement.
      const names = (m: Map<string, string>) => [...m.keys()].sort();
      assertEquals(names(ui), names(constant), "route UI et constante divergent sur les noms");
      assertEquals(
        names(proxyErr),
        names(constant),
        "erreur FGP du proxy et constante divergent sur les noms",
      );

      // Le lead a refuse une derivation dynamique : sans comparaison des valeurs, une montee
      // de version de Hono ferait deriver la constante sans que rien ne casse visiblement.
      for (const [name, value] of constant) {
        assertEquals(ui.get(name), value, `valeur divergente sur ${name}, route UI`);
        assertEquals(proxyErr.get(name), value, `valeur divergente sur ${name}, erreur proxy`);
      }

      assertEquals(constant.size, 13, "le nombre d'en-tetes de securite a change");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.14: PARITE, la CSP dediee de /api/docs n'est pas ecrasee par la CSP stricte",
  fn: async () => {
    setup();
    try {
      const docsRes = await app.request(SWAGGER_DOCS_PATH);
      await docsRes.body?.cancel();
      const docsCsp = docsRes.headers.get("content-security-policy") ?? "";

      const strictCsp = new Map(FGP_SECURITY_HEADERS).get("Content-Security-Policy");
      assertNotEquals(
        docsCsp,
        strictCsp,
        "la CSP de /api/docs a ete remplacee par la CSP stricte, Swagger UI est casse",
      );
      assertStringIncludes(docsCsp, "unsafe-inline");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.15: /logs et /logs/* sont exclus du mode header, la feature consomme ces en-tetes",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob({ scopes: ["*:*"] });
      mockUpstream(200, "upstream body", { "Content-Type": "text/plain" });

      // /logs/stream identifie le blob a streamer par X-FGP-Blob + X-FGP-Key (specs 14.9).
      // Sans cette exclusion la feature logs serait injoignable : toute requete portant ces
      // en-tetes partirait vers l'upstream au lieu d'ouvrir le stream.
      for (const path of ["/logs", "/logs/health"]) {
        const res = await app.request(path, {
          headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
        });
        await res.body?.cancel();

        assertEquals(
          res.headers.get(FGP_SOURCE_HEADER),
          FGP_SOURCE_PROXY,
          `${path} a ete proxyfie : la feature /logs devient injoignable`,
        );
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// Garde-fou du montage : blobHeaderProxy doit rester avant les chemins FGP, sinon une
// requete portant X-FGP-Blob sur /api/salt serait servie localement au lieu d'etre proxyfiee.
Deno.test({
  name: "AC-41.6: blobHeaderProxy intercepte avant les routes FGP",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob({ scopes: ["*:*"] });
      mockUpstream(200, JSON.stringify({ upstream: true }), {
        "Content-Type": "application/json",
      });

      const res = await app.request("/api/salt", {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
      });
      const body = await res.json();

      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_UPSTREAM);
      assertEquals(body.upstream, true);
      assertEquals(body.salt, undefined, "le salt local a fuite au lieu d'etre proxyfie");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// Sanity check du harnais : blobHeaderProxy nu, hors app principale, pour isoler une
// eventuelle regression de montage d'une regression du middleware lui-meme.
Deno.test({
  name: "AC-41.5: blobHeaderProxy isole ne pose aucun en-tete de securite",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob({ scopes: ["*:*"] });
      mockUpstream(204, null);

      const bare = new Hono();
      bare.use("*", blobHeaderProxy());
      bare.get("/anything", (c) => c.text("local"));

      const res = await bare.request("/anything", {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
      });
      await res.body?.cancel();

      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_UPSTREAM);
      assertEquals(securityHeadersOf(res), []);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-41.11: les 404 generes par FGP portent X-FGP-Source proxy",
  fn: async () => {
    setup();
    try {
      // Section 8 fait de X-FGP-Source le moyen d'attribuer une erreur a FGP ou a la cible.
      // Une garantie qui souffre une exception devient inutilisable pour un client : ces deux
      // 404 l'omettaient, ils le posent desormais comme le fait app.onError.
      for (const path of ["/api/inexistant", "/static/inexistant.css"]) {
        const res = await app.request(path);
        const body = await res.json();

        assertEquals(res.status, 404, `status inattendu sur ${path}`);
        assertEquals(body.error, "not_found");
        assertEquals(
          res.headers.get(FGP_SOURCE_HEADER),
          FGP_SOURCE_PROXY,
          `${path} n'attribue pas sa reponse a FGP`,
        );
        assertEquals(securityHeadersOf(res).length, SECURITY_HEADER_NAMES.length);
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
