import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../../src/constants.ts";

const CLIENT_KEY = "scalingo-addon-test-key-padd";
const SERVER_SALT = "scalingo-addon-test-salt";
const AUTH_URL = "https://auth.mock.local";
const API_URL = "https://api.mock.local";
const TARGET = "https://db-api.mock.local";
const ACCOUNT_TOKEN = "tk-us-COMPTE-SECRET";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
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

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

interface Stub {
  exchange: number;
  addonToken: number;
  forward: number;
  calls: { url: string; headers: Headers }[];
}

interface StubOptions {
  exchangeStatus?: number;
  addonStatus?: number;
  addonThrows?: boolean;
  exchangeThrows?: boolean;
  addonTokenValue?: string;
}

/** Trois etapes distinctes : exchange, obtention du token d'addon, forward. */
function stubScalingo(options: StubOptions = {}): Stub {
  const stub: Stub = { exchange: 0, addonToken: 0, forward: 0, calls: [] };

  globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    stub.calls.push({ url, headers });

    if (url.startsWith(AUTH_URL)) {
      stub.exchange++;
      if (options.exchangeThrows) return Promise.reject(new TypeError("network down"));
      const status = options.exchangeStatus ?? 200;
      if (status !== 200) return Promise.resolve(new Response("nope", { status }));
      return Promise.resolve(
        new Response(JSON.stringify({ token: "bearer-from-exchange" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (url.startsWith(API_URL)) {
      stub.addonToken++;
      if (options.addonThrows) return Promise.reject(new TypeError("network down"));
      const status = options.addonStatus ?? 200;
      if (status !== 200) return Promise.resolve(new Response("nope", { status }));
      return Promise.resolve(
        new Response(
          JSON.stringify({ addon: { token: options.addonTokenValue ?? "addon-token-abc" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    stub.forward++;
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  return stub;
}

async function makeBlob(
  overrides: Partial<{
    app: string;
    addonId: string;
    apiUrl: string;
    scopes: unknown[];
    ttl: number;
    createdAt: number;
  }> = {},
): Promise<string> {
  const auth: Record<string, unknown> = {
    type: "scalingo-addon",
    app: overrides.app ?? "mon-app",
    addonId: overrides.addonId ?? "ad-1111",
  };
  if (overrides.apiUrl) auth.apiUrl = overrides.apiUrl;

  const config: Record<string, unknown> = {
    v: 4,
    token: ACCOUNT_TOKEN,
    target: TARGET,
    auth,
    scopes: overrides.scopes ?? ["GET:/api/databases/ad-1111/stats"],
    ttl: overrides.ttl ?? 3600,
    createdAt: overrides.createdAt ?? nowUnix(),
  };
  // deno-lint-ignore no-explicit-any
  return await encryptBlob(config as any, CLIENT_KEY, SERVER_SALT);
}

function proxyApp(): Hono {
  const instance = new Hono();
  instance.use("/:blob{.+}/*", proxyMiddleware());
  return instance;
}

// --- AC-35.1, AC-35.23 : flow nominal ---

Deno.test({
  name: "AC-35.1: flow nominal en trois temps, exchange puis token d'addon puis forward",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo();
      const blob = await makeBlob();

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(stub.exchange, 1);
      assertEquals(stub.addonToken, 1);
      assertEquals(stub.forward, 1);

      // L'ordre des trois etapes est observable dans la sequence d'appels.
      assertEquals(stub.calls[0].url.startsWith(AUTH_URL), true);
      assertEquals(stub.calls[1].url, `${API_URL}/v1/apps/mon-app/addons/ad-1111/token`);
      assertEquals(stub.calls[2].url.startsWith(TARGET), true);

      // L'etape 2 s'authentifie avec le bearer, le forward avec le token d'addon.
      assertEquals(stub.calls[1].headers.get("Authorization"), "Bearer bearer-from-exchange");
      assertEquals(stub.calls[2].headers.get("Authorization"), "Bearer addon-token-abc");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-35.23: le token de compte n'atteint jamais la cible",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo();
      const blob = await makeBlob();

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      const forwardCall = stub.calls.find((c) => c.url.startsWith(TARGET));
      const serialised = [...forwardCall!.headers].map(([k, v]) => `${k}: ${v}`).join("\n");
      assertEquals(serialised.includes(ACCOUNT_TOKEN), false, "le token de compte a fuite");
      assertEquals(serialised.includes("addon-token-abc"), true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-35.16: apiUrl du blob prime sur SCALINGO_API_URL",
  fn: async () => {
    setup();
    try {
      // L'API de la region visee doit gagner sur la variable d'instance.
      const stub = stubScalingo();
      const blob = await makeBlob({ apiUrl: API_URL });

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(stub.calls[1].url, `${API_URL}/v1/apps/mon-app/addons/ad-1111/token`);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-35.8 a AC-35.10 : echecs d'obtention des credentials ---

Deno.test({
  name: "AC-35.8: un exchange refuse donne 502 auth_addon_failed",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo({ exchangeStatus: 401 });
      const blob = await makeBlob();

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      assertEquals(res.status, 502);
      assertEquals(body.error, "auth_addon_failed");
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
      assertEquals(stub.forward, 0, "la requete n'a jamais du atteindre la cible");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-35.9: une reponse non-2xx a l'etape 2 donne 502 auth_addon_failed",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo({ addonStatus: 404 });
      const blob = await makeBlob();

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      assertEquals(res.status, 502, "le 404 de Scalingo ne se propage pas au client");
      assertEquals(body.error, "auth_addon_failed");
      assertEquals(stub.forward, 0);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "AC-35.10: une API Scalingo injoignable a l'etape 2 donne auth_addon_failed, pas upstream_unreachable",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo({ addonThrows: true });
      const blob = await makeBlob();

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      // upstream_unreachable reste strictement reserve au fetch qui throw pendant le forward.
      assertEquals(res.status, 502);
      assertEquals(body.error, "auth_addon_failed");
      assertEquals(stub.forward, 0);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.6: un fetch qui throw pendant le forward donne upstream_unreachable",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      globalThis.fetch = (input: string | URL | Request): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith(AUTH_URL)) {
          return Promise.resolve(
            new Response(JSON.stringify({ token: "bearer" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (url.startsWith(API_URL)) {
          return Promise.resolve(
            new Response(JSON.stringify({ addon: { token: "addon-tok" } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        return Promise.reject(new TypeError("connection refused"));
      };

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      // Les credentials ont ete obtenus : l'echec est bien celui du forward.
      assertEquals(res.status, 502);
      assertEquals(body.error, "upstream_unreachable");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-36.1, AC-36.2 : ordre de verification, aucun appel reseau premature ---

Deno.test({
  name: "AC-36.1: une requete hors scope ne declenche aucun appel vers Scalingo",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo();
      const blob = await makeBlob({ scopes: ["GET:/api/databases/ad-1111/stats"] });

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/backups`, {
        method: "DELETE",
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      assertEquals(res.status, 403);
      assertEquals(body.error, "scope_denied");
      // Un appelant hors scope ne doit rien apprendre, et ne doit rien couter en rate limit.
      assertEquals(stub.exchange, 0);
      assertEquals(stub.addonToken, 0);
      assertEquals(stub.forward, 0);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.2: un blob expire ne declenche aucun appel vers Scalingo",
  fn: async () => {
    setup();
    try {
      const stub = stubScalingo();
      const blob = await makeBlob({ ttl: 60, createdAt: nowUnix() - 3600 });

      const res = await proxyApp().request(`/${blob}/api/databases/ad-1111/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      assertEquals(res.status, 410);
      assertEquals(body.error, "token_expired");
      assertEquals(stub.calls.length, 0, "aucun appel sortant ne doit partir");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-36.13: aucun message d'erreur du mode addon ne divulgue la configuration",
  fn: async () => {
    setup();
    try {
      stubScalingo({ addonStatus: 500 });
      const blob = await makeBlob({ app: "app-confidentielle", addonId: "ad-secret-9999" });

      const res = await proxyApp().request(`/${blob}/api/databases/ad-secret-9999/stats`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const raw = await res.text();

      assertEquals(raw.includes("app-confidentielle"), false, "nom d'app divulgue");
      assertEquals(raw.includes("ad-secret-9999"), false, "addonId divulgue");
      assertEquals(raw.includes(ACCOUNT_TOKEN), false);
      assertEquals(raw.includes("Error"), false, "trace d'exception divulguee");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
