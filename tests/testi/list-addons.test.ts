import { assertEquals, assertStringIncludes } from "@std/assert";

import { app } from "../../src/main.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../../src/constants.ts";

const AUTH_URL = "https://auth.mock.local";
const API_URL = "https://api.mock.local";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", "list-addons-test-salt");
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  Deno.env.set("SCALINGO_AUTH_URL", AUTH_URL);
  Deno.env.set("SCALINGO_API_URL", API_URL);
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("SCALINGO_AUTH_URL");
  Deno.env.delete("SCALINGO_API_URL");
}

interface StubOptions {
  exchangeOk?: boolean;
  addonsStatus?: number;
  addonsThrows?: boolean;
  addonsBody?: unknown;
}

function stub(options: StubOptions = {}) {
  globalThis.fetch = (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);

    if (url.startsWith(AUTH_URL)) {
      if (options.exchangeOk === false) {
        return Promise.resolve(new Response("nope", { status: 401 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ token: "bearer-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (options.addonsThrows) return Promise.reject(new TypeError("network down"));
    const status = options.addonsStatus ?? 200;
    if (status !== 200) return Promise.resolve(new Response("nope", { status }));
    return Promise.resolve(
      new Response(JSON.stringify(options.addonsBody ?? { addons: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
}

async function listAddons(body: Record<string, unknown>): Promise<Response> {
  return await app.request("/api/list-addons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = { token: "tk-us-compte", app: "mon-app" };

Deno.test({
  name: "AC-36.11: la reponse porte id et resourceId distincts, plus provider et plan",
  fn: async () => {
    setup();
    try {
      stub({
        addonsBody: {
          addons: [
            {
              id: "ad-1111-2222",
              resource_id: "my-db-123",
              plan: { name: "postgresql-starter-512" },
              addon_provider: { name: "PostgreSQL" },
            },
          ],
        },
      });

      const res = await listAddons(VALID);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.addons.length, 1);
      // id alimente addonId dans le blob, resourceId ne sert qu'a l'affichage.
      assertEquals(body.addons[0].id, "ad-1111-2222");
      assertEquals(body.addons[0].resourceId, "my-db-123");
      assertEquals(body.addons[0].provider, "PostgreSQL");
      assertEquals(body.addons[0].plan, "postgresql-starter-512");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.11: un addon sans resource_id reste listable avec un resourceId vide",
  fn: async () => {
    setup();
    try {
      stub({ addonsBody: { addons: [{ id: "ad-1", plan: null, addon_provider: null }] } });

      const res = await listAddons(VALID);
      const body = await res.json();

      assertEquals(res.status, 200);
      assertEquals(body.addons[0].id, "ad-1");
      assertEquals(body.addons[0].resourceId, "");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.7: un exchange refuse donne 401 token_exchange_failed, jamais auth_exchange_failed",
  fn: async () => {
    setup();
    try {
      stub({ exchangeOk: false });

      const res = await listAddons(VALID);
      const body = await res.json();

      // Deux publics, deux statuts, deux codes : ici l'utilisateur de l'UI saisit son propre
      // token et peut le corriger, d'ou le 401 et non le 502 du proxy principal.
      assertEquals(res.status, 401);
      assertEquals(body.error, "token_exchange_failed");
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.7: /api/list-apps utilise le meme code token_exchange_failed",
  fn: async () => {
    setup();
    try {
      stub({ exchangeOk: false });

      const res = await app.request("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tk-us-compte" }),
      });
      const body = await res.json();

      assertEquals(res.status, 401);
      assertEquals(body.error, "token_exchange_failed");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.14: une application inexistante donne 404 app_not_found",
  fn: async () => {
    setup();
    try {
      stub({ addonsStatus: 404 });

      const res = await listAddons(VALID);
      const body = await res.json();

      // Sans ce cas, une faute de casse sur le nom de l'application serait indiscernable
      // d'un incident Scalingo cote interface.
      assertEquals(res.status, 404);
      assertEquals(body.error, "app_not_found");
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "AC-36.15: app_not_found est une exception, les autres status restent upstream_list_addons_failed",
  fn: async () => {
    setup();
    try {
      // La regle de cadrage : un status upstream n'est traduit en code dedie que s'il designe
      // sans ambiguite une erreur de saisie corrigeable. 403, 429 et 500 n'en sont pas.
      for (const status of [403, 429, 500, 503]) {
        stub({ addonsStatus: status });

        const res = await listAddons(VALID);
        const body = await res.json();

        assertEquals(res.status, 502, `status ${status} traduit a tort`);
        assertEquals(body.error, "upstream_list_addons_failed");
        assertStringIncludes(body.message, String(status));
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.9: une API Scalingo injoignable donne 502 upstream_unreachable",
  fn: async () => {
    setup();
    try {
      stub({ addonsThrows: true });

      const res = await listAddons(VALID);
      const body = await res.json();

      assertEquals(res.status, 502);
      assertEquals(body.error, "upstream_unreachable");
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.10: un body invalide donne 400 invalid_body",
  fn: async () => {
    setup();
    try {
      stub();

      for (const body of [{ app: "mon-app" }, { token: "tk" }, {}]) {
        const res = await listAddons(body);
        const parsed = await res.json();
        assertEquals(res.status, 400, `body accepte a tort : ${JSON.stringify(body)}`);
        assertEquals(parsed.error, "invalid_body");
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.12: les enums OpenAPI de /api/list-addons couvrent les quatre codes",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/api/openapi.json");
      const spec = await res.json();
      const responses = spec.paths["/api/list-addons"].post.responses;

      const codesOf = (status: string): string[] => {
        const ref: string = responses[status].content["application/json"].schema.$ref;
        const name = ref.split("/").pop() as string;
        return spec.components.schemas[name].properties.error.enum;
      };

      assertEquals(codesOf("400").includes("invalid_body"), true);
      assertEquals(codesOf("401").includes("token_exchange_failed"), true);
      assertEquals(codesOf("404").includes("app_not_found"), true);
      assertEquals(codesOf("502").includes("upstream_unreachable"), true);
      assertEquals(codesOf("502").includes("upstream_list_addons_failed"), true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.12: addon_not_resolved a disparu de toutes les surfaces publiees",
  fn: async () => {
    setup();
    try {
      const spec = await (await app.request("/api/openapi.json")).text();
      const llms = await (await app.request("/llms.txt")).text();

      // Le code a ete supprime avec le multi-addon. S'il reparait dans une surface publiee,
      // c'est qu'une partie du code mort a survecu a l'arbitrage.
      assertEquals(spec.includes("addon_not_resolved"), false, "code mort dans l'OpenAPI");
      assertEquals(llms.includes("addon_not_resolved"), false, "code mort dans /llms.txt");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.12: les codes d'erreur du proxy sont documentes dans /llms.txt",
  fn: async () => {
    setup();
    try {
      const llms = await (await app.request("/llms.txt")).text();

      // La route proxy n'a pas de definition OpenAPI : le contrat d'erreur du proxy vit
      // uniquement dans /llms.txt. C'est donc la seule surface ou ces codes s'assertent.
      assertStringIncludes(llms, "auth_exchange_failed");
      assertStringIncludes(llms, "auth_addon_failed");
      assertStringIncludes(llms, "upstream_unreachable");
      assertStringIncludes(llms, "scope_denied");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
