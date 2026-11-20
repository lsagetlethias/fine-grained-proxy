import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { Hono } from "hono";

import { assertEquals } from "../_assert.ts";
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
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
  emitted = null;
  globalThis.fetch = ((input: string | URL | Request) => {
    emitted = input instanceof Request ? input.url : String(input);
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  delete process.env.FGP_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
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

test("AC-44.9: mode URL, le chemin percent-encode est emis tel que presente", async () => {
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
});

test("AC-44.9 bis: mode header, le chemin percent-encode est emis tel que presente", async () => {
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
});

test("AC-44.9 ter: ni la casse de l'encodage ni les formes non canoniques ne bougent", async () => {
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
});

test("AC-44.9 quater: la cible recoit le chemin octet pour octet", async () => {
  _resetStoreForTests();
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";

  let received: string | null = null;
  // req.url porte la cible de requete brute, telle qu'elle est passee sur le fil : c'est
  // la forme sur laquelle doit porter la comparaison, une cible qui normaliserait le
  // chemin avant de le rendre ne prouverait plus rien.
  const server = createServer((req, res) => {
    received = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    // Aucun stub de fetch ici : la garantie porte sur ce que la cible recoit, pas
    // seulement sur ce que le proxy passe a fetch.
    const target = `http://127.0.0.1:${port}`;
    const blob = await makeBlob(target);
    const res = await urlModeApp().request(`/${blob}${GITLAB_PATH}`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    await res.body?.cancel();

    assertEquals(res.status, 200);
    assertEquals(received, GITLAB_PATH);
  } finally {
    // Les connexions gardees ouvertes par le pool de fetch survivraient a close() et
    // retiendraient le processus : plus de sanitizer pour le signaler, on ferme a la main.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    delete process.env.FGP_SALT;
    delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  }
});
