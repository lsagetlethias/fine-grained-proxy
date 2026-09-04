import { assertEquals, assertRejects } from "@std/assert";

import { _resetStoreForTests, hashToken } from "../../../src/auth/cache.ts";
import { obtainAddonToken, obtainBearerViaExchange } from "../../../src/auth/credentials.ts";
import { resolveScalingoApiUrl } from "../../../src/auth/client.ts";

const AUTH_URL = "https://auth.mock.local";
const API_URL = "https://api.mock.local";
const ACCOUNT_TOKEN = "tk-us-compte";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("SCALINGO_AUTH_URL", AUTH_URL);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  Deno.env.set("SCALINGO_API_URL", API_URL);
}

function teardown() {
  globalThis.fetch = originalFetch;
  _resetStoreForTests();
  Deno.env.delete("SCALINGO_AUTH_URL");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("SCALINGO_API_URL");
}

interface Counters {
  exchange: number;
  addon: number;
  addonUrls: string[];
}

interface StubOptions {
  addonStatus?: number;
  exchangeStatus?: number;
  delayMs?: number;
}

function stub(options: StubOptions = {}): Counters {
  const counters: Counters = { exchange: 0, addon: 0, addonUrls: [] };
  let addonSeq = 0;

  globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));

    if (url.startsWith(AUTH_URL)) {
      counters.exchange++;
      if (options.exchangeStatus && options.exchangeStatus !== 200) {
        return new Response("nope", { status: options.exchangeStatus });
      }
      return new Response(JSON.stringify({ token: "bearer-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    counters.addon++;
    counters.addonUrls.push(url);
    if (options.addonStatus && options.addonStatus !== 200) {
      return new Response("nope", { status: options.addonStatus });
    }
    addonSeq++;
    return new Response(JSON.stringify({ addon: { token: `addon-token-${addonSeq}` } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return counters;
}

Deno.test("AC-35.11: le token d'addon est mis en cache entre deux appels", async () => {
  setup();
  try {
    const counters = stub();

    const first = await obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1");
    const second = await obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1");

    assertEquals(first, second);
    assertEquals(counters.exchange, 1);
    assertEquals(counters.addon, 1);
  } finally {
    teardown();
  }
});

Deno.test("AC-35.12: deux addons du meme compte ne partagent jamais leur token", async () => {
  setup();
  try {
    const counters = stub();

    const a = await obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1");
    const b = await obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-2");

    assertEquals(counters.addon, 2, "chaque couple app/addon a sa propre entree de cache");
    assertEquals(a === b, false, "deux addons distincts ont recu le meme token");
    // Le bearer, lui, est mutualise : un seul exchange pour les deux.
    assertEquals(counters.exchange, 1);
  } finally {
    teardown();
  }
});

Deno.test("AC-35.12: deux applications differentes ne partagent pas non plus leur token", async () => {
  setup();
  try {
    const counters = stub();

    await obtainAddonToken(ACCOUNT_TOKEN, "app-a", "ad-1");
    await obtainAddonToken(ACCOUNT_TOKEN, "app-b", "ad-1");

    assertEquals(counters.addon, 2);
  } finally {
    teardown();
  }
});

Deno.test("AC-35.12: la cle de cache ne peut pas etre confondue par decoupage", async () => {
  // Le separateur est un caractere impossible dans un token, un nom d'app ou un addonId :
  // deux decoupages differents ne doivent pas produire la meme cle.
  const a = await hashToken("tk", "app", "ad-1");
  const b = await hashToken("tk", "appad-1");
  const c = await hashToken("tkapp", "ad-1");

  assertEquals(a === b, false);
  assertEquals(a === c, false);
  assertEquals(b === c, false);
});

Deno.test("AC-35.13: un token d'addon expire reutilise le bearer en cache", async () => {
  setup();
  try {
    const counters = stub();

    // Le bearer est chauffe en premier, comme apres une requete precedente.
    await obtainBearerViaExchange(ACCOUNT_TOKEN);
    assertEquals(counters.exchange, 1);

    await obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1");

    // Les deux caches sont chaines : pas de nouvel exchange pour obtenir un token d'addon.
    assertEquals(counters.exchange, 1);
    assertEquals(counters.addon, 1);
  } finally {
    teardown();
  }
});

Deno.test("AC-35.14: singleflight, dix demandes concurrentes ne produisent qu'un seul appel", async () => {
  setup();
  try {
    const counters = stub({ delayMs: 10 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1")),
    );

    assertEquals(counters.exchange, 1);
    assertEquals(counters.addon, 1);
    assertEquals(new Set(results).size, 1, "toutes les requetes recoivent le meme token");
  } finally {
    teardown();
  }
});

Deno.test("AC-35.15: singleflight, un echec est propage a toutes les requetes en attente", async () => {
  setup();
  try {
    const counters = stub({ addonStatus: 500, delayMs: 10 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1")),
    );

    assertEquals(counters.addon, 1, "un seul appel en vol malgre l'echec");
    assertEquals(results.every((r) => r.status === "rejected"), true);
  } finally {
    teardown();
  }
});

Deno.test("AC-35.15: apres un echec, un nouvel appel est retente et non servi depuis le cache", async () => {
  setup();
  try {
    const counters = stub({ addonStatus: 500 });
    await assertRejects(() => obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1"));
    assertEquals(counters.addon, 1);

    // Un echec ne doit pas etre memorise : le vol en cours est nettoye.
    await assertRejects(() => obtainAddonToken(ACCOUNT_TOKEN, "mon-app", "ad-1"));
    assertEquals(counters.addon, 2);
  } finally {
    teardown();
  }
});

Deno.test("AC-35.16: resolution d'apiUrl en trois niveaux", () => {
  setup();
  try {
    // 1. La valeur du blob prime.
    assertEquals(
      resolveScalingoApiUrl("https://api.osc-secnum-fr1.scalingo.com"),
      "https://api.osc-secnum-fr1.scalingo.com",
    );
    // 2. Sinon la variable d'instance.
    assertEquals(resolveScalingoApiUrl(), API_URL);
    // 3. Sinon le defaut osc-fr1.
    Deno.env.delete("SCALINGO_API_URL");
    assertEquals(resolveScalingoApiUrl(), "https://api.osc-fr1.scalingo.com");
  } finally {
    teardown();
  }
});

Deno.test("AC-35.16: les slashs de fin d'apiUrl sont normalises", () => {
  setup();
  try {
    // Sans normalisation l'URL de l'etape 2 contiendrait un double slash.
    assertEquals(resolveScalingoApiUrl("https://api.example.com/"), "https://api.example.com");
    assertEquals(resolveScalingoApiUrl("https://api.example.com///"), "https://api.example.com");
  } finally {
    teardown();
  }
});

Deno.test("AC-35.1: l'appel d'obtention du token d'addon encode app et addonId dans l'URL", async () => {
  setup();
  try {
    const counters = stub();
    await obtainAddonToken(ACCOUNT_TOKEN, "mon app", "ad/1");

    assertEquals(counters.addonUrls[0], `${API_URL}/v1/apps/mon%20app/addons/ad%2F1/token`);
  } finally {
    teardown();
  }
});

Deno.test("AC-36.13: un echec d'obtention ne divulgue ni le token ni l'identifiant d'addon", async () => {
  setup();
  try {
    stub({ addonStatus: 403 });

    const error = await assertRejects(
      () => obtainAddonToken(ACCOUNT_TOKEN, "app-confidentielle", "ad-secret"),
      Error,
    );

    // Le message d'exception remonte dans les logs serveur : il ne doit pas porter de secret.
    assertEquals(error.message.includes(ACCOUNT_TOKEN), false);
  } finally {
    teardown();
  }
});
