import { test } from "node:test";

import { assertEquals, assertNotEquals } from "../_assert.ts";
import { app } from "../../src/main.ts";
import { _setResolverForTests } from "../../src/net/egress.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY } from "../../src/constants.ts";

const realEnv = process.env;
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

// Panne strictement locale, du meme genre que la lecture d'environnement refusee qui a tue
// le flux proxy en production : elle n'a rien a voir avec l'API cible et ne doit surtout pas
// etre presentee comme telle. Un TypeError, c'est-a-dire une faute que personne n'est cense
// rattraper, pour que la seule issue correcte soit un 500.
//
// process.env refuse un descripteur d'accesseur : l'interception passe donc par le
// remplacement de l'objet, pose sur le vrai environnement pour que les ecritures et les
// suppressions continuent de l'atteindre.
function breakEnvRead(name: string, when: () => boolean): void {
  process.env = new Proxy(realEnv, {
    get(target, prop) {
      if (prop === name && when()) throw new TypeError(`env read broken: ${String(prop)}`);
      return Reflect.get(target, prop);
    },
  });
}

function silenceUnhandledErrorLog(): void {
  console.error = () => {};
}

function restore(): void {
  process.env = realEnv;
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  _setResolverForTests(null);
}

function publicResolver(): void {
  _setResolverForTests((_host, kind) => Promise.resolve(kind === "A" ? ["93.184.216.34"] : []));
}

async function post(path: string, body: unknown): Promise<Response> {
  return await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Les deux helpers Scalingo echangent un token avant d'appeler l'API : la panne doit tomber
// pendant le second appel, celui qu'entoure le catch qu'on corrige, pas pendant l'echange.
function stubExchangeThenBreak(): { exchanged: () => boolean } {
  let exchanged = false;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes("/v1/tokens/exchange")) {
      exchanged = true;
      return Promise.resolve(Response.json({ token: "bearer-from-exchange" }));
    }
    return Promise.resolve(Response.json({ apps: [], addons: [] }));
  }) as typeof globalThis.fetch;
  breakEnvRead("FGP_EGRESS_ALLOW_PRIVATE", () => exchanged);
  return { exchanged: () => exchanged };
}

const SCALINGO_TARGET = "https://api.osc-fr1.scalingo.com";

test("AC-59.1: une panne locale pendant /api/list-apps sort en 500, pas en 502 amont", async () => {
  publicResolver();
  const state = stubExchangeThenBreak();
  silenceUnhandledErrorLog();
  try {
    const res = await post("/api/list-apps", { token: "tk-us-test", target: SCALINGO_TARGET });
    const body = await res.json();

    assertEquals(state.exchanged(), true, "l'echange n'a pas eu lieu, la panne est mal placee");
    assertEquals(res.status, 500);
    assertEquals(body.error, "internal_error");
    assertNotEquals(body.error, "upstream_unreachable");
  } finally {
    restore();
  }
});

test("AC-59.2: une panne locale pendant /api/list-addons sort en 500, pas en 502 amont", async () => {
  publicResolver();
  const state = stubExchangeThenBreak();
  silenceUnhandledErrorLog();
  try {
    const res = await post("/api/list-addons", {
      token: "tk-us-test",
      target: SCALINGO_TARGET,
      app: "my-app",
    });
    const body = await res.json();

    assertEquals(state.exchanged(), true, "l'echange n'a pas eu lieu, la panne est mal placee");
    assertEquals(res.status, 500);
    assertEquals(body.error, "internal_error");
    assertNotEquals(body.error, "upstream_unreachable");
  } finally {
    restore();
  }
});

test("AC-59.3: /api/test-proxy n'accuse plus l'amont d'une panne locale", async () => {
  publicResolver();
  // Mode bearer : aucun echange prealable, le premier appel sortant est celui qu'on teste.
  breakEnvRead("FGP_EGRESS_ALLOW_PRIVATE", () => true);
  globalThis.fetch = (() =>
    Promise.resolve(Response.json({ ok: true }))) as typeof globalThis.fetch;
  silenceUnhandledErrorLog();
  try {
    const res = await post("/api/test-proxy", {
      method: "GET",
      path: "/v1/items",
      token: "secret",
      target: "https://api.example.com",
      auth: "bearer",
      scopes: ["*:*"],
    });
    const body = await res.json();

    assertEquals(res.status, 500);
    assertEquals(body.error, "internal_error");
    assertNotEquals(body.reason, "upstream_unreachable");
  } finally {
    restore();
  }
});

test("AC-59.4: un echec reseau reel garde reason upstream_unreachable sur /api/test-proxy", async () => {
  publicResolver();
  globalThis.fetch = (() =>
    Promise.reject(new TypeError("error sending request"))) as typeof globalThis.fetch;
  try {
    const res = await post("/api/test-proxy", {
      method: "GET",
      path: "/v1/items",
      token: "secret",
      target: "https://api.example.com",
      auth: "bearer",
      scopes: ["*:*"],
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.allowed, true);
    assertEquals(body.reason, "upstream_unreachable");
  } finally {
    restore();
  }
});

test("AC-59.5: un corps upstream illisible reste impute a l'amont, pas au proxy", async () => {
  publicResolver();
  // JSON annonce, corps malforme : la reponse est bien arrivee, c'est sa lecture qui echoue.
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("{ pas du json", { headers: { "content-type": "application/json" } }),
    )) as typeof globalThis.fetch;
  try {
    const res = await post("/api/test-proxy", {
      method: "GET",
      path: "/v1/items",
      token: "secret",
      target: "https://api.example.com",
      auth: "bearer",
      scopes: ["*:*"],
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.reason, "upstream_unreachable");
  } finally {
    restore();
  }
});

// --- AC-59.8 et AC-59.9 : la route proxy, le chemin principal du produit, que les trois
// premiers cas laissaient sans garde ---

const PROXY_CLIENT_KEY = "egress-classes-key-0123456789abc";
const PROXY_SERVER_SALT = "egress-classes-salt";

async function makeProxyBlob(target: string): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tok",
      target,
      auth: "bearer",
      scopes: ["*:*"],
      ttl: 3600,
      createdAt: Math.floor(Date.now() / 1000),
    },
    PROXY_CLIENT_KEY,
    PROXY_SERVER_SALT,
  );
}

// La destination est classifiee deux fois sur le flux proxy : une premiere fois par le
// handler avant tout appel sortant, une seconde fois dans egressFetch, sous le catch qu'on
// teste. Seule la seconde doit casser, sinon la panne tombe hors du catch et le test ne
// prouve plus rien. La resolution DNS de la premiere classification sert de frontiere.
function breakEgressEnvAfterFirstClassification(): { crossed: () => boolean } {
  let classified = false;
  _setResolverForTests((_host, kind) => {
    classified = true;
    return Promise.resolve(kind === "A" ? ["93.184.216.34"] : []);
  });
  process.env = new Proxy(realEnv, {
    get(target, prop) {
      if (prop !== "FGP_EGRESS_ALLOW_PRIVATE") return Reflect.get(target, prop);
      if (classified) throw new TypeError("env read broken: FGP_EGRESS_ALLOW_PRIVATE");
      return undefined;
    },
  });
  return { crossed: () => classified };
}

test("AC-59.8: une panne reseau reelle sur le forward proxy reste un 502 upstream_unreachable", async () => {
  _resetStoreForTests();
  process.env.FGP_SALT = PROXY_SERVER_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  const blob = await makeProxyBlob("https://api.example.com");
  publicResolver();
  globalThis.fetch = (() =>
    Promise.reject(new TypeError("error sending request"))) as typeof globalThis.fetch;
  try {
    const res = await app.request(`/${blob}/v1/items`, {
      headers: { "X-FGP-Key": PROXY_CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_unreachable");
    assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
  } finally {
    delete process.env.FGP_SALT;
    restore();
  }
});

test("AC-59.9: une panne locale pendant le forward proxy sort en 500, pas en 502 amont", async () => {
  _resetStoreForTests();
  process.env.FGP_SALT = PROXY_SERVER_SALT;
  const blob = await makeProxyBlob("https://api.example.com");
  const state = breakEgressEnvAfterFirstClassification();
  // L'amont repond normalement : si un 502 sort quand meme, il ne vient que du catch.
  globalThis.fetch = (() =>
    Promise.resolve(Response.json({ ok: true }))) as typeof globalThis.fetch;
  silenceUnhandledErrorLog();
  try {
    const res = await app.request(`/${blob}/v1/items`, {
      headers: { "X-FGP-Key": PROXY_CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(
      state.crossed(),
      true,
      "la classification prealable n'a pas eu lieu, la panne est mal placee",
    );
    assertEquals(res.status, 500);
    assertEquals(body.error, "internal_error");
    assertNotEquals(body.error, "upstream_unreachable");
  } finally {
    delete process.env.FGP_SALT;
    restore();
  }
});
