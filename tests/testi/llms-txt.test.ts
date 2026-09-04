import { assertEquals, assertStringIncludes } from "@std/assert";

import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { FGP_SOURCE_HEADER, FGP_SOURCE_PROXY, FGP_SOURCE_UPSTREAM } from "../../src/constants.ts";

const CLIENT_KEY = "llms-txt-test-key-padding-01";
const SERVER_SALT = "llms-txt-test-salt";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("FGP_LOGS_ENABLED");
}

async function makeBlob(): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: "tk-us-test",
      target: "https://api.mock.local",
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
  name: "AC-40.1: contrat HTTP, 200 en text/markdown avec un cache public d'une heure",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/llms.txt");
      const body = await res.text();

      assertEquals(res.status, 200);
      assertEquals(res.headers.get("content-type"), "text/markdown; charset=utf-8");
      assertEquals(res.headers.get("cache-control"), "public, max-age=3600");
      assertStringIncludes(body, "# Fine-Grained Proxy");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.2: aucune authentification requise, aucun kill switch",
  fn: async () => {
    setup();
    try {
      // La feature logs est coupee : /llms.txt ne doit pas en dependre.
      Deno.env.set("FGP_LOGS_ENABLED", "0");

      const res = await app.request("/llms.txt");
      await res.body?.cancel();
      assertEquals(res.status, 200);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.11: le contenu est identique pour tous les appelants",
  fn: async () => {
    setup();
    try {
      const anonymous = await (await app.request("/llms.txt")).text();
      const withKey = await (await app.request("/llms.txt", {
        headers: { "X-FGP-Key": CLIENT_KEY },
      })).text();

      assertEquals(anonymous, withKey);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.9: les liens sont absolus et construits sur l'origine de la requete",
  fn: async () => {
    setup();
    try {
      const res = await app.request("http://fgp.test.local/llms.txt");
      const body = await res.text();

      assertStringIncludes(body, "http://fgp.test.local/api/openapi.json");
      assertStringIncludes(body, "http://fgp.test.local/api/docs");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.10: le document ne divulgue aucune donnee d'instance",
  fn: async () => {
    setup();
    try {
      Deno.env.set("FGP_LOGS_ENABLED", "1");
      const body = await (await app.request("/llms.txt")).text();

      assertEquals(body.includes(SERVER_SALT), false, "le salt serveur a fuite");
      assertEquals(body.includes("enabled"), false, "l'etat de la feature logs a fuite");
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-40.13, AC-40.14 : decouverte ---

Deno.test({
  name: "AC-40.13: la balise link rel=describedby est presente sur / et /logs",
  fn: async () => {
    setup();
    try {
      Deno.env.set("FGP_LOGS_ENABLED", "1");

      for (const path of ["/", "/logs"]) {
        const html = await (await app.request(path)).text();
        assertStringIncludes(html, 'rel="describedby"');
        assertStringIncludes(html, 'href="/llms.txt"');
        assertStringIncludes(html, 'type="text/markdown"');
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.14: le header Link est pose sur les reponses HTML de FGP",
  fn: async () => {
    setup();
    try {
      Deno.env.set("FGP_LOGS_ENABLED", "1");

      for (const path of ["/", "/logs"]) {
        const res = await app.request(path);
        await res.body?.cancel();
        assertEquals(
          res.headers.get("link"),
          '</llms.txt>; rel="describedby"; type="text/markdown"',
          `header Link absent ou incorrect sur ${path}`,
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
  name: "AC-40.15: aucun header Link n'est ajoute a une reponse forwardee",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      globalThis.fetch = (): Promise<Response> =>
        Promise.resolve(
          new Response("<html>upstream</html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
        );

      // Ajouter un header a une reponse upstream serait une transformation, interdite par
      // l'ADR-0006, meme quand la reponse est du HTML.
      const res = await app.request("/v2/page", {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
      });
      await res.body?.cancel();

      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_UPSTREAM);
      assertEquals(res.headers.get("link"), null);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.12: une requete /llms.txt en mode header est proxyfiee, pas servie localement",
  fn: async () => {
    setup();
    try {
      const blob = await makeBlob();
      globalThis.fetch = (): Promise<Response> =>
        Promise.resolve(
          new Response(JSON.stringify({ upstream: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );

      const res = await app.request("/llms.txt", {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-FGP-Blob": blob },
      });
      const body = await res.json();

      // Comportement attendu (specs 16.2), pas un bug : la route n'est pas exclue du mode
      // header, contrairement a /logs qui l'est (AC-41.15).
      assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_UPSTREAM);
      assertEquals(body.upstream, true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.17: /llms.txt porte les en-tetes de securite",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/llms.txt");
      await res.body?.cancel();

      assertEquals(res.headers.get("x-content-type-options"), "nosniff");
      assertEquals(res.headers.get("referrer-policy"), "no-referrer");
      assertEquals(res.headers.get("x-frame-options"), "DENY");
      assertEquals(res.headers.has("content-security-policy"), true);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-40.16 : comportement observe des paths a un seul segment ---

Deno.test({
  name: "AC-40.16: aucun second document n'est expose sous /llms-full.txt",
  fn: async () => {
    setup();
    try {
      const res = await app.request("/llms-full.txt");
      const body = await res.text();

      // Le non-goal qui compte : pas de second document. Le status, lui, est celui du
      // comportement observe et documente ci-dessous.
      assertEquals(body.includes("# Fine-Grained Proxy"), false);
      assertEquals(res.status === 200, false);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-40.16: comportement observe des paths a un seul segment inconnus",
  fn: async () => {
    setup();
    try {
      // Comportement reel, constate et non invente. Le pattern du proxy matche aussi un
      // path a un seul segment : proxyMiddleware compte les segments et refuse en amont,
      // comme le decrit la section 8.2 des specs.
      for (const path of ["/llms-full.txt", "/robots.txt", "/inexistant"]) {
        const res = await app.request(path);
        const body = await res.json();

        assertEquals(res.status, 400, `comportement divergent sur ${path}`);
        assertEquals(body.error, "invalid_request");
        assertEquals(body.message, "Invalid proxy path");
        assertEquals(res.headers.get(FGP_SOURCE_HEADER), FGP_SOURCE_PROXY);
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
