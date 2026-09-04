import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { app } from "../../src/main.ts";
import { decryptBlob, encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../../src/constants.ts";
import type { Auth } from "../../src/auth/spec.ts";

const CLIENT_KEY = "auth-headers-test-key";
const SERVER_SALT = "auth-headers-test-salt";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

interface Capture {
  calls: { url: string; headers: Headers }[];
}

/** Capture les requetes sortantes pour inspecter les en-tetes reellement poses. */
function captureUpstream(): Capture {
  const capture: Capture = { calls: [] };
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    capture.calls.push({ url, headers });
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  return capture;
}

async function makeBlob(auth: Auth, token?: string, v = 4): Promise<string> {
  const config: Record<string, unknown> = {
    v,
    target: "https://api.mock.local",
    auth,
    scopes: ["*:*"],
    ttl: 3600,
    createdAt: nowUnix(),
  };
  if (token !== undefined) config.token = token;
  // deno-lint-ignore no-explicit-any
  return await encryptBlob(config as any, CLIENT_KEY, SERVER_SALT);
}

function proxyApp(): Hono {
  const instance = new Hono();
  instance.use("/:blob{.+}/*", proxyMiddleware());
  return instance;
}

const GENERATE_BASE = {
  target: "https://api.example.com",
  scopes: ["GET:/v2/resources"],
  ttl: 3600,
};

async function generate(overrides: Record<string, unknown>): Promise<Response> {
  return await app.request("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...GENERATE_BASE, ...overrides }),
  });
}

// --- AC-34.1, AC-34.2, AC-34.5 : serialisation et resolution de version ---

Deno.test({
  name: "AC-34.1: deux headers produisent un blob v4, dans l'ordre saisi",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        auth: {
          type: "headers",
          headers: [
            { name: "X-API-Key", value: "sk-1" },
            { name: "X-Client-Id", value: "acme" },
          ],
        },
      });
      const { blob, key } = await res.json();
      assertEquals(res.status, 200);

      const config = await decryptBlob(blob, key, SERVER_SALT);
      const auth = config.auth as { type: string; headers: { name: string; value: string }[] };

      assertEquals(config.v, 4);
      assertEquals(auth.type, "headers");
      assertEquals(auth.headers.map((h) => h.name), ["X-API-Key", "X-Client-Id"]);
      assertEquals(auth.headers.map((h) => h.value), ["sk-1", "acme"]);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.2: un seul header est serialise en forme legacy header:{name}, le blob reste v2",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        auth: { type: "headers", headers: [{ name: "X-API-Key", value: "sk-live-abc" }] },
      });
      const { blob, key } = await res.json();
      assertEquals(res.status, 200);

      const config = await decryptBlob(blob, key, SERVER_SALT);

      // Blob plus petit, aucune regression sur l'existant, un seul chemin de code
      // pour le cas le plus courant.
      assertEquals(config.auth as Auth, "header:X-API-Key");
      assertEquals(config.token, "sk-live-abc");
      assertEquals(config.v, 2);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.5: en mode headers a deux entrees, le champ token est omis du blob",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        token: "tk-ne-doit-pas-survivre",
        auth: {
          type: "headers",
          headers: [
            { name: "X-A", value: "a" },
            { name: "X-B", value: "b" },
          ],
        },
      });
      const { blob, key } = await res.json();
      const config = await decryptBlob(blob, key, SERVER_SALT);

      assertEquals(config.token, undefined, "le token n'a plus de sens dans ce mode");
      assertEquals(JSON.stringify(config).includes("tk-ne-doit-pas-survivre"), false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.4: un seul header ne produit jamais un blob v4, meme avec un ScopeEntry",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        auth: { type: "headers", headers: [{ name: "X-API-Key", value: "sk-1" }] },
        scopes: ["GET:/v1/apps", { methods: ["POST"], pattern: "/v1/deploy" }],
      });
      const { blob, key } = await res.json();
      const config = await decryptBlob(blob, key, SERVER_SALT);

      // La version est la plus haute des deux resolutions : auth string plus ScopeEntry donne 3.
      assertEquals(config.auth as Auth, "header:X-API-Key");
      assertEquals(config.v, 3);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.5: auth structuree et scopes string uniquement donnent v4",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        auth: {
          type: "headers",
          headers: [
            { name: "X-A", value: "a" },
            { name: "X-B", value: "b" },
          ],
        },
        scopes: ["GET:/v1/apps"],
      });
      const { blob, key } = await res.json();
      const config = await decryptBlob(blob, key, SERVER_SALT);
      assertEquals(config.v, 4);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.7: auth structuree et ScopeEntry donnent v4",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        token: "tk-us-compte",
        auth: { type: "scalingo-addon", app: "mon-app", addonId: "ad-1" },
        scopes: ["GET:/v1/apps", { methods: ["POST"], pattern: "/v1/deploy" }],
      });
      const { blob, key } = await res.json();
      const config = await decryptBlob(blob, key, SERVER_SALT);
      assertEquals(config.v, 4);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.6: auth string et ScopeEntry donnent v3, jamais v4",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        token: "tk-1",
        auth: "bearer",
        scopes: ["GET:/v1/apps", { methods: ["POST"], pattern: "/v1/deploy" }],
      });
      const { blob, key } = await res.json();
      const config = await decryptBlob(blob, key, SERVER_SALT);
      assertEquals(config.v, 3);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-34.3, AC-34.4, AC-34.6, AC-34.21 : forward ---

Deno.test({
  name: "AC-34.3: tous les headers d'auth sont poses sur la requete sortante, dans l'ordre",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await makeBlob({
        type: "headers",
        headers: [
          { name: "X-API-Key", value: "sk-1" },
          { name: "X-Client-Id", value: "acme" },
        ],
      });

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(capture.calls.length, 1);
      assertEquals(capture.calls[0].headers.get("X-API-Key"), "sk-1");
      assertEquals(capture.calls[0].headers.get("X-Client-Id"), "acme");
      // Aucun Authorization n'est fabrique dans ce mode.
      assertEquals(capture.calls[0].headers.get("Authorization"), null);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.4: un header d'auth du blob ecrase le header homonyme envoye par l'appelant",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await makeBlob({
        type: "headers",
        headers: [
          { name: "X-API-Key", value: "sk-blob" },
          { name: "X-Client-Id", value: "acme" },
        ],
      });

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-API-Key": "sk-attaquant" },
      });
      await res.body?.cancel();

      // Le consommateur d'une URL FGP ne peut ni neutraliser ni detourner l'authentification.
      assertEquals(capture.calls[0].headers.get("X-API-Key"), "sk-blob");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.6: un token orphelin n'est jamais transmis a l'API cible",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await makeBlob(
        {
          type: "headers",
          headers: [
            { name: "X-A", value: "a" },
            { name: "X-B", value: "b" },
          ],
        },
        "secret-orphelin",
      );

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200, "un secret orphelin ne doit pas casser un acces legitime");
      const serialised = [...capture.calls[0].headers].map(([k, v]) => `${k}: ${v}`).join("\n");
      assertEquals(serialised.includes("secret-orphelin"), false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.21: le mode headers ne declenche aucun appel reseau supplementaire",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await makeBlob({
        type: "headers",
        headers: [
          { name: "X-A", value: "a" },
          { name: "X-B", value: "b" },
        ],
      });

      for (let i = 0; i < 2; i++) {
        const res = await proxyApp().request(`/${blob}/v1/apps`, {
          headers: { "X-FGP-Key": CLIENT_KEY },
        });
        await res.body?.cancel();
      }

      // Le mode est purement local : deux requetes, deux appels, tous vers la cible.
      assertEquals(capture.calls.length, 2);
      for (const call of capture.calls) {
        assertEquals(
          call.url.startsWith("https://api.mock.local"),
          true,
          `appel hors cible: ${call.url}`,
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
  name: "AC-42.3: un blob v2 en header:{name} se comporte comme avant le lot v4",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await makeBlob("header:X-API-Key", "sk-1", 2);

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(capture.calls[0].headers.get("X-API-Key"), "sk-1");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-34.11, AC-34.20, AC-34.22 : erreurs ---

Deno.test({
  name:
    "AC-34.11: une auth string de forme correcte mais non supportee donne 400 invalid_auth_mode",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob("oauth2", "tk-1", 2);

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      // La frontiere avec AC-34.10 (401 invalid_credentials) est le type de `auth` :
      // string de forme correcte ici, objet malforme la-bas.
      assertEquals(res.status, 400);
      assertEquals(body.error, "invalid_auth_mode");
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.20: neuf headers a la generation donnent 400 auth_limit_exceeded",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        auth: {
          type: "headers",
          headers: Array.from({ length: 9 }, (_, i) => ({ name: `X-H${i}`, value: `v${i}` })),
        },
      });
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.error, "auth_limit_exceeded");
      assertEquals(body.blob, undefined, "aucun blob ne doit etre genere");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.22: un nom de header reserve est refuse a la generation",
  fn: async () => {
    setup();
    try {
      for (const name of ["X-FGP-Key", "Host", "Content-Length"]) {
        const res = await generate({
          auth: {
            type: "headers",
            headers: [
              { name, value: "v" },
              { name: "X-Other", value: "w" },
            ],
          },
        });
        const body = await res.json();

        assertEquals(res.status, 400, `nom reserve accepte a tort : ${name}`);
        assertEquals(body.blob, undefined);
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-34.19: une valeur de header avec CRLF est refusee a la generation",
  fn: async () => {
    setup();
    try {
      const res = await generate({
        auth: {
          type: "headers",
          headers: [
            { name: "X-API-Key", value: "sk-live\r\nX-Admin: true" },
            { name: "X-Other", value: "w" },
          ],
        },
      });
      const body = await res.json();

      assertEquals(res.status, 400);
      assertEquals(body.blob, undefined);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
