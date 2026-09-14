import { assertEquals, assertNotEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { _setResolverForTests } from "../../src/net/egress.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { extractClientIp } from "../../src/logs/ip.ts";
// Cle de module distincte : le drapeau d'avertissement d'egress.ts ne se remet pas a zero,
// et un autre fichier de test du processus l'a peut-etre deja pose.
import { classifyLiteralHost } from "../../src/net/egress.ts?env-denied";

const CLIENT_KEY = "env-denied-key-0123456789abcdef";
const SERVER_SALT = "env-denied-salt";

const originalEnvGet = Deno.env.get;
const originalFetch = globalThis.fetch;

// Reproduit une allow-list --allow-env incomplete : tout nom absent leve NotCapable au lieu
// de rendre undefined. C'est exactement ce que fait Deno, et c'est ce qui a tue le flux
// proxy en production avec un Procfile qui ne portait que 9 des 11 variables.
function denyEnvExcept(allowed: Record<string, string>): void {
  Deno.env.get = ((name: string): string | undefined => {
    if (Object.hasOwn(allowed, name)) return allowed[name];
    throw new Deno.errors.NotCapable(
      `Requires env access to "${name}", run again with the --allow-env flag`,
    );
  }) as typeof Deno.env.get;
}

function stubNetwork(): void {
  _setResolverForTests((_host, kind) => Promise.resolve(kind === "A" ? ["93.184.216.34"] : []));
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes("/v1/tokens/exchange")) {
      return Promise.resolve(Response.json({ token: "bearer-from-exchange" }));
    }
    if (url.includes("/v1/apps")) {
      return Promise.resolve(Response.json({ apps: [{ name: "beta" }, { name: "alpha" }] }));
    }
    return Promise.resolve(Response.json({ ok: true }));
  }) as typeof globalThis.fetch;
}

function restore(): void {
  Deno.env.get = originalEnvGet;
  globalThis.fetch = originalFetch;
  _setResolverForTests(null);
}

async function makeBlob(target: string): Promise<string> {
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
    CLIENT_KEY,
    SERVER_SALT,
  );
}

Deno.test({
  name: "AC-58.1: une requete proxy legitime aboutit quand l'allow-list env est incomplete",
  fn: async () => {
    _resetStoreForTests();
    const blob = await makeBlob("https://api.example.com");
    // Le blob se chiffre avec le vrai Deno.env encore en place, le stub ne couvre que la requete.
    denyEnvExcept({ FGP_SALT: SERVER_SALT });
    stubNetwork();
    try {
      const res = await app.request(`/${blob}/v1/apps`, { headers: { "X-FGP-Key": CLIENT_KEY } });
      const body = await res.json();

      assertEquals(res.status, 200);
      assertNotEquals(body.error, "internal_error");
      assertEquals(res.headers.get("X-FGP-Source"), "upstream");
    } finally {
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-58.2: FGP_EGRESS_ALLOW_PRIVATE refuse vaut absence, la classification reste active",
  fn: async () => {
    _resetStoreForTests();
    const blob = await makeBlob("http://169.254.169.254");
    denyEnvExcept({ FGP_SALT: SERVER_SALT });
    stubNetwork();
    try {
      const res = await app.request(`/${blob}/latest/meta-data/`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const body = await res.json();

      // Un refus d'acces a la variable ne doit surtout pas se lire comme un opt-in, et pas
      // davantage sortir en 500 : le service de metadonnees reste interdit, franchement.
      assertEquals(res.status, 403);
      assertEquals(body.error, "target_forbidden");
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    } finally {
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-58.2 bis: le repli sur refus d'acces n'ecrit aucun avertissement",
  fn: () => {
    denyEnvExcept({ FGP_SALT: SERVER_SALT });
    const original = console.warn;
    const messages: string[] = [];
    console.warn = (...args: unknown[]) => {
      messages.push(args.map(String).join(" "));
    };
    try {
      // Une destination refusee, pour que le silence ne vienne pas d'un chemin non emprunte.
      assertEquals(classifyLiteralHost("10.0.0.1")?.code, "target_forbidden");
      assertEquals(messages, []);
    } finally {
      console.warn = original;
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-58.3: les routes /api repondent sans 500 quand l'allow-list env est incomplete",
  fn: async () => {
    denyEnvExcept({ FGP_SALT: SERVER_SALT });
    stubNetwork();
    try {
      const salt = await app.request("/api/salt");
      assertEquals(salt.status, 200);
      assertEquals((await salt.json()).salt, SERVER_SALT);

      // list-apps lit SCALINGO_API_URL et SCALINGO_AUTH_URL, deux variables refusees ici.
      const apps = await app.request("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tk-us-test", target: "https://api.osc-fr1.scalingo.com" }),
      });
      const body = await apps.json();
      assertEquals(apps.status, 200);
      assertNotEquals(body.error, "internal_error");
      assertEquals(body.apps, ["alpha", "beta"]);
    } finally {
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-58.4: /logs/health tient son contrat de repondre 200 malgre l'allow-list incomplete",
  fn: async () => {
    denyEnvExcept({ FGP_SALT: SERVER_SALT });
    try {
      const res = await app.request("/logs/health");
      assertEquals(res.status, 200);
      assertEquals(await res.json(), { enabled: false });
    } finally {
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-58.5: FGP_TRUSTED_PROXY_HOPS refuse retient l'IP du pair, pas X-Forwarded-For",
  fn: () => {
    denyEnvExcept({ FGP_SALT: SERVER_SALT });
    try {
      const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" });
      assertEquals(extractClientIp(headers, "198.51.100.7"), "198.51.100.7");
    } finally {
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-58.16 et AC-58.17 : le seul endpoint qui annonce la sante de la configuration ne
// doit pas annoncer l'inverse de ce que fait le flux proxy ---

Deno.test({
  name:
    "AC-58.16: FGP_SALT refuse par l'allow-list fait repondre 500 a /api/salt, jamais un salt vide",
  fn: async () => {
    denyEnvExcept({});
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const res = await app.request("/api/salt");
      const body = await res.json();

      assertEquals(res.status, 500);
      assertEquals(body.error, "server_error");
      assertEquals(body.salt, undefined, "un salt vide a ete servi comme si tout allait bien");
      assertEquals(res.headers.get("cache-control"), "no-store");

      // Le flux proxy repond deja 500 sur cette meme instance. Si les deux divergent, c'est
      // l'endpoint de diagnostic qui ment, et c'est celui-la qu'on regarde pour conclure.
      const proxy = await app.request(`/${"b".repeat(96)}/v1/items`, {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      const proxyBody = await proxy.json();

      assertEquals(proxy.status, 500);
      assertEquals(proxyBody.error, "internal_error");
    } finally {
      console.error = originalConsoleError;
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-58.17: FGP_SALT simplement absente, sans refus de permission, sort aussi en 500",
  fn: async () => {
    // Le repli de readEnv n'est pas en cause ici : Deno.env.get rend undefined comme il le
    // ferait sur une instance dont la variable n'est pas definie du tout.
    Deno.env.get = ((name: string): string | undefined =>
      name === "FGP_SALT" ? undefined : originalEnvGet(name)) as typeof Deno.env.get;
    try {
      const res = await app.request("/api/salt");
      const body = await res.json();

      assertEquals(res.status, 500);
      assertEquals(body.error, "server_error");
      assertEquals(body.salt, undefined, "un salt vide a ete servi comme si tout allait bien");
    } finally {
      restore();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
