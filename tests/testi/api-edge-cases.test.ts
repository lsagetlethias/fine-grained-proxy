import { assertEquals, assertNotEquals } from "@std/assert";

import { app } from "../../src/main.ts";

const SERVER_SALT = "test-api-edge-salt";
const originalFetch = globalThis.fetch;

function setup() {
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
  Deno.env.set("SCALINGO_API_URL", "https://api.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  Deno.env.delete("SCALINGO_AUTH_URL");
  Deno.env.delete("SCALINGO_API_URL");
}

// --- /api/generate URL construction ---

Deno.test({
  name: "POST /api/generate without X-Forwarded-Host uses request origin",
  fn: async () => {
    setup();

    const res = await app.request("http://localhost:8000/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.url.startsWith("http://localhost"), true);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/generate with all auth modes ---

Deno.test({
  name: "POST /api/generate with scalingo-exchange auth mode works",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.osc-fr1.scalingo.com",
        auth: "scalingo-exchange",
        scopes: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
        ttl: 7200,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");
    assertEquals(typeof body.key, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with header:X-API-Key auth mode works",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "my-secret-api-key",
        target: "https://api.custom.com",
        auth: "header:X-API-Key",
        scopes: ["*:*"],
        ttl: 0,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/list-apps upstream failure ---

Deno.test({
  name:
    "AC-17.33: POST /api/list-apps upstream non-ok returns 502 upstream_list_apps_failed + X-FGP-Source: proxy",
  fn: async () => {
    setup();
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("api.mock.local")) {
        return Promise.resolve(new Response("Internal Error", { status: 500 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tk-us-test" }),
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_list_apps_failed");
    assertEquals(body.message.includes("500"), true);
    assertEquals(res.headers.get("X-FGP-Source"), "proxy");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "AC-17.34: POST /api/list-apps fetch throw returns 502 upstream_unreachable + X-FGP-Source: proxy",
  fn: async () => {
    setup();
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "mock-bearer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error("Network error"));
    }) as typeof globalThis.fetch;

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tk-us-test" }),
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_unreachable");
    assertEquals(res.headers.get("X-FGP-Source"), "proxy");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "AC-17.35: POST /api/list-apps exchange fail returns 401 token_exchange_failed + X-FGP-Source: proxy",
  fn: async () => {
    setup();
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tk-us-invalid" }),
    });
    const body = await res.json();

    assertEquals(res.status, 401);
    assertEquals(body.error, "token_exchange_failed");
    assertEquals(res.headers.get("X-FGP-Source"), "proxy");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/generate Zod edge cases ---

Deno.test({
  name: "POST /api/generate with empty scopes array is valid",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with ttl 0 is valid (no expiration)",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 0,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with extra fields in body is valid (Zod strips them)",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
        extra_field: "should_be_ignored",
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Catch-all /api/* returns 404 ---

Deno.test({
  name: "AC-12.6: GET /api/nonexistent returns 404 with structured error",
  fn: async () => {
    const res = await app.request("/api/nonexistent");
    const body = await res.json();

    assertEquals(res.status, 404);
    assertEquals(body.error, "not_found");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/nonexistent returns 404",
  fn: async () => {
    const res = await app.request("/api/nonexistent", { method: "POST" });
    assertEquals(res.status, 404);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- DOCTYPE in HTML rendering ---

Deno.test({
  name: "GET / returns HTML with DOCTYPE",
  fn: async () => {
    const res = await app.request("/");
    const html = await res.text();
    assertEquals(html.startsWith("<!DOCTYPE html>"), true);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- /api/generate blob size validation ---

Deno.test({
  name: "AC-13.3: POST /api/generate with massive scopes returns 400 blob_too_large",
  fn: async () => {
    setup();

    // Sous les 64 Ko du bodyLimit, donc c'est bien blob_too_large qui doit repondre :
    // au-dela, le 413 arrive avant et masquerait le palier fonctionnel qu'on teste ici.
    const massiveScopes = Array.from(
      { length: 300 },
      (_, i) =>
        `GET:/v1/apps/${crypto.randomUUID()}-${crypto.randomUUID()}-${i}/containers/${crypto.randomUUID()}/restart`,
    );

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: massiveScopes,
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "blob_too_large");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- ADR-0010 D6 : bodyLimit sur /api/*, jamais sur * ---

Deno.test({
  name: "AC-47.1: /api/generate refuse un corps au-dela de 64 Ko en 413",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["GET:/" + "a".repeat(70 * 1024)],
        ttl: 3600,
      }),
    });
    assertEquals(res.status, 413);
    assertEquals((await res.json()).error, "payload_too_large");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-47.2: /api/share/decode refuse au-dela de son propre palier de 16 Ko",
  fn: async () => {
    setup();
    const res = await app.request("/api/share/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encoded: "a".repeat(20 * 1024) }),
    });
    assertEquals(res.status, 413);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-47.3: /api/share/decode refuse un encoded de plus de 8192 caracteres en 400",
  fn: async () => {
    setup();
    const res = await app.request("/api/share/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encoded: "a".repeat(8193) }),
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_body");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

async function statutSurCorpsDe(path: string, octets: number): Promise<number> {
  // Le remplissage est pose dans un champ inconnu de la route : le corps est du JSON valide
  // et sa taille est la seule chose qui puisse le faire echouer en 413.
  const body = JSON.stringify({ padding: "a".repeat(octets) });
  const res = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  await res.body?.cancel();
  return res.status;
}

Deno.test({
  name: "AC-47.2 (registre v5): les paliers resserres par route sont ceux annonces",
  fn: async () => {
    setup();
    try {
      // Chaque palier est dimensionne sur ce que la route transporte reellement. Les deux
      // bornes comptent : sans la valeur qui passe, un plafond global plus bas rendrait le
      // test vert tout en cassant les routes que le palier de 64 Ko doit laisser vivre.
      const paliers: [string, number][] = [
        ["/api/decode", 8 * 1024],
        ["/api/list-apps", 4 * 1024],
        ["/api/list-addons", 4 * 1024],
      ];

      for (const [path, palier] of paliers) {
        assertEquals(
          await statutSurCorpsDe(path, palier + 512),
          413,
          `${path} accepte un corps au-dela de son palier de ${palier} octets`,
        );
        assertNotEquals(
          await statutSurCorpsDe(path, Math.floor(palier / 2)),
          413,
          `${path} refuse un corps sous son palier de ${palier} octets`,
        );
      }

      // Le palier par defaut reste plus haut que les trois precedents : une valeur qui
      // depasse leur plafond doit passer le sien.
      assertNotEquals(await statutSurCorpsDe("/api/generate", 16 * 1024), 413);
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-47.10: les 413 de plafond sont des reponses FGP, pas des reponses upstream",
  fn: async () => {
    setup();
    try {
      // Le proxy transparent n'est pas entame par ces plafonds : ils sont produits par FGP
      // et se declarent comme tels, en-tete de provenance compris. Le code d'erreur seul ne
      // le dit pas, et c'est lui que les tests voisins asserent.
      //
      // Ce test ne couvre que les 413. Le 400 « encoded trop long » du meme critere ne
      // porte pas X-FGP-Source aujourd'hui : c'est un ecart entre le critere ecrit et
      // l'implementation, remonte au lead plutot que ferme ici par un test rouge ou par une
      // retouche de src/.
      const cas: [string, string, string][] = [
        ["/api/generate", JSON.stringify({ padding: "a".repeat(70 * 1024) }), "palier par defaut"],
        ["/api/decode", JSON.stringify({ padding: "a".repeat(9 * 1024) }), "palier resserre"],
      ];

      for (const [path, body, titre] of cas) {
        const res = await app.request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        const payload = await res.json() as { error?: unknown; message?: unknown };
        assertEquals(res.status, 413, titre);
        assertEquals(res.headers.get("X-FGP-Source"), "proxy", `${titre} : provenance`);
        assertEquals(payload.error, "payload_too_large", `${titre} : code`);
        assertEquals(typeof payload.message, "string", `${titre} : champ message`);
      }
    } finally {
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
