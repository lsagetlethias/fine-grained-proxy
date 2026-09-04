import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { app } from "../../src/main.ts";
import { decryptBlob, encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { FGP_SOURCE_UPSTREAM } from "../../src/constants.ts";

const CLIENT_KEY = "retro-compat-test-key";
const SERVER_SALT = "retro-compat-test-salt";
const AUTH_URL = "https://auth.mock.local";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("SCALINGO_AUTH_URL", AUTH_URL);
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

interface Capture {
  calls: { url: string; headers: Headers; body: string | null }[];
}

function captureUpstream(): Capture {
  const capture: Capture = { calls: [] };
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);

    if (url.startsWith(AUTH_URL)) {
      capture.calls.push({ url, headers, body: null });
      return new Response(JSON.stringify({ token: "bearer-echange" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Le proxy forwarde le body brut en ReadableStream (c.req.raw.body), pas en string :
    // le lire tel quel est le seul moyen de verifier qu'il n'a pas ete transforme.
    let body: string | null = null;
    if (input instanceof Request) body = await input.clone().text();
    else if (typeof init?.body === "string") body = init.body;
    else if (init?.body instanceof ReadableStream) body = await new Response(init.body).text();

    capture.calls.push({ url, headers, body });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return capture;
}

// deno-lint-ignore no-explicit-any
async function blobOf(config: any): Promise<string> {
  return await encryptBlob(config, CLIENT_KEY, SERVER_SALT);
}

function proxyApp(): Hono {
  const instance = new Hono();
  instance.use("/:blob{.+}/*", proxyMiddleware());
  return instance;
}

const BASE_V2 = {
  v: 2,
  token: "tk-legacy-1234",
  target: "https://api.mock.local",
  auth: "bearer",
  scopes: ["GET:/v1/apps"],
  ttl: 3600,
};

Deno.test({
  name: "AC-42.1: un blob v2 en bearer se comporte exactement comme avant le lot v4",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await blobOf({ ...BASE_V2, createdAt: nowUnix() });

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(res.headers.get("X-FGP-Source"), FGP_SOURCE_UPSTREAM);
      assertEquals(capture.calls[0].headers.get("Authorization"), "Bearer tk-legacy-1234");
      // X-FGP-Key reste consomme par le proxy, jamais transmis.
      assertEquals(capture.calls[0].headers.get("X-FGP-Key"), null);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.1: un blob v2 en basic reste inchange",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await blobOf({ ...BASE_V2, auth: "basic", createdAt: nowUnix() });

      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(
        capture.calls[0].headers.get("Authorization"),
        `Basic ${btoa(":tk-legacy-1234")}`,
      );
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.2: un blob v3 en scalingo-exchange avec body filters reste inchange",
  fn: async () => {
    setup();
    try {
      const capture = captureUpstream();
      const blob = await blobOf({
        v: 3,
        token: "tk-us-compte",
        target: "https://api.mock.local",
        auth: "scalingo-exchange",
        scopes: [
          {
            methods: ["POST"],
            pattern: "/v1/apps/my-app/deployments",
            bodyFilters: [
              {
                objectPath: "deployment.git_ref",
                objectValue: [{ type: "any", value: "main" }],
              },
            ],
          },
        ],
        ttl: 3600,
        createdAt: nowUnix(),
      });

      const allowed = await proxyApp().request(`/${blob}/v1/apps/my-app/deployments`, {
        method: "POST",
        headers: { "X-FGP-Key": CLIENT_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ deployment: { git_ref: "main" } }),
      });
      await allowed.body?.cancel();

      assertEquals(allowed.status, 200);
      // Exchange puis forward : le flow v3 est intact.
      assertEquals(capture.calls[0].url.startsWith(AUTH_URL), true);
      assertEquals(capture.calls[1].headers.get("Authorization"), "Bearer bearer-echange");
      // Le body brut est forwarde tel quel, meme quand un body filter l'a inspecte.
      assertEquals(capture.calls[1].body, JSON.stringify({ deployment: { git_ref: "main" } }));

      const denied = await proxyApp().request(`/${blob}/v1/apps/my-app/deployments`, {
        method: "POST",
        headers: { "X-FGP-Key": CLIENT_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ deployment: { git_ref: "prod" } }),
      });
      const deniedBody = await denied.json();

      assertEquals(denied.status, 403);
      assertEquals(deniedBody.error, "scope_denied");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.9: le champ logs reste lisible sur un blob v4",
  fn: async () => {
    setup();
    try {
      // Le champ logs est orthogonal au versioning : il s'applique a toutes les versions.
      const blob = await blobOf({
        v: 4,
        target: "https://api.mock.local",
        auth: {
          type: "headers",
          headers: [
            { name: "X-A", value: "a" },
            { name: "X-B", value: "b" },
          ],
        },
        scopes: ["GET:/v1/apps"],
        ttl: 3600,
        createdAt: nowUnix(),
        logs: { enabled: true, detailed: true },
      });

      const config = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
      assertEquals(config.v, 4);
      assertEquals(config.logs, { enabled: true, detailed: true });
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.9: un champ logs mal type reste traite comme desactive, sans erreur",
  fn: async () => {
    setup();
    try {
      const blob = await blobOf({
        ...BASE_V2,
        createdAt: nowUnix(),
        logs: { enabled: "true", detailed: 1 },
      });

      const capture = captureUpstream();
      const res = await proxyApp().request(`/${blob}/v1/apps`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200, "un logs mal type ne doit pas casser le forward");
      assertEquals(capture.calls.length, 1);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.12: FGP ne migre jamais un blob a la volee",
  fn: async () => {
    setup();
    try {
      // Un aller-retour dechiffrement puis rechiffrement ne doit rien changer a la version
      // ni au contenu : aucune migration implicite.
      const original = { ...BASE_V2, createdAt: nowUnix() };
      const blob = await blobOf(original);

      const decoded = await decryptBlob(blob, CLIENT_KEY, SERVER_SALT);
      assertEquals(decoded.v, 2);

      const rechiffre = await encryptBlob(decoded, CLIENT_KEY, SERVER_SALT);
      const again = await decryptBlob(rechiffre, CLIENT_KEY, SERVER_SALT);

      assertEquals(again.v, 2);
      assertEquals(again.auth, "bearer");
      assertEquals(again.scopes, original.scopes);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.10: /api/decode d'un blob v3 garde la shape existante",
  fn: async () => {
    setup();
    try {
      const blob = await blobOf({
        v: 3,
        token: "tk-legacy-9876",
        target: "https://api.mock.local",
        auth: "scalingo-exchange",
        scopes: ["GET:/v1/apps", { methods: ["POST"], pattern: "/v1/deploy" }],
        ttl: 3600,
        createdAt: nowUnix(),
      });

      const res = await app.request("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob, key: CLIENT_KEY }),
      });
      const decoded = await res.json();

      assertEquals(res.status, 200);
      // auth reste une string : un consommateur existant qui la typait ainsi ne casse pas.
      assertEquals(decoded.auth, "scalingo-exchange");
      assertEquals(decoded.version, 3);
      assertEquals(decoded.tokenRedacted.endsWith("9876"), true);
      assertEquals(decoded.scopes.length, 2);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-42.11: l'aller-retour de partage d'une config v2 reste fidele",
  fn: async () => {
    setup();
    try {
      const config = {
        target: "https://api.mock.local",
        auth: "bearer",
        scopes: ["GET:/v1/apps"],
        ttl: 3600,
      };

      const encoded = await (await app.request("/api/share/encode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })).json();

      const decoded = await (await app.request("/api/share/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encoded: encoded.encoded }),
      })).json();

      assertEquals(decoded.target, config.target);
      assertEquals(decoded.auth, config.auth);
      assertEquals(decoded.scopes, config.scopes);
      assertEquals(decoded.ttl, config.ttl);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
