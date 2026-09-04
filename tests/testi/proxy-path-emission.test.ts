import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { blobHeaderProxy, proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "path-emission-test-key-012345";
const SERVER_SALT = "path-emission-salt";
const TARGET = "https://api.mock.local";

const originalFetch = globalThis.fetch;
let emitted: string | null = null;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  emitted = null;
  globalThis.fetch = ((input: string | URL | Request) => {
    emitted = input instanceof Request ? input.url : String(input);
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
}

async function makeBlob(target = TARGET, scopes: string[] = ["*:*"]): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tok",
      target,
      auth: "bearer",
      scopes,
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

function urlModeApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

function headerModeApp(): Hono {
  const app = new Hono();
  app.use("*", blobHeaderProxy());
  return app;
}

/** Cas GitLab : l'identifiant de projet porte un %2F qui appartient a la donnee. */
const GITLAB_PATH = "/api/v4/projects/groupe%2Fprojet/repository/branches";

Deno.test({
  name: "AC-44.9: mode URL, le chemin percent-encode est emis tel que presente",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      const res = await urlModeApp().request(`/${blob}${GITLAB_PATH}`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(emitted, `${TARGET}${GITLAB_PATH}`);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-44.9 bis: mode header, le chemin percent-encode est emis tel que presente",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      const res = await headerModeApp().request(GITLAB_PATH, {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(emitted, `${TARGET}${GITLAB_PATH}`);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-44.9 ter: ni la casse de l'encodage ni les formes non canoniques ne bougent",
  fn: async () => {
    setup();
    try {
      // %2f minuscule, %2E qui decode en point, et un espace encode : trois formes qu'une
      // normalisation reecrirait sans changer le sens du chemin pour un client naif, et
      // dont la reecriture change bel et bien la ressource visee pour l'upstream.
      const path = "/v1/files/a%2fb/c%2Ed/nom%20avec%20espace";
      const blob = await makeBlob();
      const res = await urlModeApp().request(`/${blob}${path}`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(emitted, `${TARGET}${path}`);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-44.9 quater: la cible recoit le chemin octet pour octet",
  fn: async () => {
    _resetStoreForTests();
    Deno.env.set("FGP_SALT", SERVER_SALT);
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");

    let received: string | null = null;
    const server = Deno.serve(
      { port: 0, onListen: () => {} },
      (req) => {
        received = new URL(req.url).pathname;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    );

    try {
      // Aucun stub de fetch ici : la garantie porte sur ce que la cible recoit, pas
      // seulement sur ce que le proxy passe a fetch.
      const target = `http://127.0.0.1:${server.addr.port}`;
      const blob = await makeBlob(target);
      const res = await urlModeApp().request(`/${blob}${GITLAB_PATH}`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();

      assertEquals(res.status, 200);
      assertEquals(received, GITLAB_PATH);
    } finally {
      await server.shutdown();
      Deno.env.delete("FGP_SALT");
      Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
