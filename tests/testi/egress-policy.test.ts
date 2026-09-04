import { assertEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import { _setResolverForTests } from "../../src/net/egress.ts";

const originalFetch = globalThis.fetch;
let fetchCount = 0;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", "egress-policy-salt");
  Deno.env.delete("FGP_EGRESS_ALLOW_PRIVATE");
  fetchCount = 0;
  _setResolverForTests((_h, kind) => Promise.resolve(kind === "A" ? ["93.184.216.34"] : []));
  globalThis.fetch = (() => {
    fetchCount++;
    return Promise.resolve(new Response(JSON.stringify({ apps: [] }), { status: 200 }));
  }) as typeof globalThis.fetch;
}

function teardown() {
  globalThis.fetch = originalFetch;
  _setResolverForTests(null);
  Deno.env.delete("FGP_SALT");
}

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "AC-43.13: POST /api/generate refuse une cible sur le service de metadonnees",
  fn: async () => {
    setup();
    const res = await post("/api/generate", {
      token: "t",
      target: "http://169.254.169.254",
      auth: "bearer",
      scopes: ["*:*"],
      ttl: 3600,
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_target");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-43.13 bis: POST /api/generate refuse file: et un target avec fragment",
  fn: async () => {
    setup();
    for (
      const target of [
        "file:///etc/passwd",
        "https://api.example.com/#",
        "https://u:p@api.example.com",
      ]
    ) {
      const res = await post("/api/generate", {
        token: "t",
        target,
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
      });
      assertEquals(res.status, 400, target);
      assertEquals((await res.json()).error, "invalid_target", target);
    }
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-43.14: POST /api/test-proxy sur une cible privee n'emet aucune requete sortante",
  fn: async () => {
    setup();
    const res = await post("/api/test-proxy", {
      method: "GET",
      path: "/v1/items",
      token: "t",
      target: "http://10.0.0.1",
      auth: "bearer",
      scopes: ["*:*"],
    });
    assertEquals(res.status, 200);
    assertEquals((await res.json()).reason, "target_forbidden");
    assertEquals(fetchCount, 0);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-43.15: POST /api/list-addons refuse un hote non Scalingo",
  fn: async () => {
    setup();
    const res = await post("/api/list-addons", {
      token: "tk-us-x",
      app: "my-app",
      target: "https://collecteur.example",
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_target");
    assertEquals(fetchCount, 0);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-43.15 bis: POST /api/list-apps refuse aussi un hote non Scalingo",
  fn: async () => {
    setup();
    const res = await post("/api/list-apps", {
      token: "tk-us-x",
      target: "https://collecteur.example",
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_target");
    assertEquals(fetchCount, 0);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-46.4: POST /api/generate refuse un scope portant une query",
  fn: async () => {
    setup();
    const res = await post("/api/generate", {
      token: "t",
      target: "https://api.example.com",
      auth: "bearer",
      scopes: ["GET:/v1/items?safe=1"],
      ttl: 3600,
    });
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_scope");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- ADR-0010 D1 et D8 ---

Deno.test({
  name: "AC-49.3: /api/test-proxy refuse un motif catastrophique sans l'evaluer",
  fn: async () => {
    setup();
    const started = performance.now();
    const res = await post("/api/test-proxy", {
      method: "POST",
      path: "/v1/items",
      token: "t",
      target: "https://api.example.com",
      auth: "bearer",
      scopes: [{
        methods: ["POST"],
        pattern: "/v1/items",
        bodyFilters: [{ objectPath: "a", objectValue: [{ type: "regex", value: "^(a+)+$" }] }],
      }],
      body: { a: "a".repeat(40) },
    });
    const elapsed = performance.now() - started;
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_body");
    // Sans la validation prealable, ce motif coutait 37,9 secondes.
    assertEquals(elapsed < 100, true);
    assertEquals(fetchCount, 0);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-50.5: une requete proxy avec logs detailed ne derive la cle qu'une fois",
  fn: async () => {
    setup();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    Deno.env.set("FGP_EGRESS_ALLOW_PRIVATE", "1");
    const { _resetKeyCacheForTests } = await import("../../src/crypto/key-cache.ts");
    _resetKeyCacheForTests();

    const original = crypto.subtle.deriveKey.bind(crypto.subtle);
    let calls = 0;
    // deno-lint-ignore no-explicit-any
    (crypto.subtle as any).deriveKey = (...args: unknown[]) => {
      calls++;
      // deno-lint-ignore no-explicit-any
      return (original as any)(...args);
    };
    try {
      const { encryptBlob } = await import("../../src/crypto/blob.ts");
      const key = "cle-pour-derivation-unique-01";
      const blob = await encryptBlob(
        {
          v: 2,
          token: "tok",
          target: "https://api.example.com",
          auth: "bearer",
          scopes: ["*:*"],
          ttl: 3600,
          createdAt: Math.floor(Date.now() / 1000),
          logs: { enabled: true, detailed: true },
        },
        key,
        "egress-policy-salt",
      );
      calls = 0;
      _resetKeyCacheForTests();

      const res = await app.request(`/${blob}/v1/items`, {
        method: "POST",
        headers: { "X-FGP-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ a: 1 }),
      });
      await res.body?.cancel();
      // Une seule derivation : la cle descend par le contexte au lieu d'etre recalculee.
      assertEquals(calls, 1);
    } finally {
      // deno-lint-ignore no-explicit-any
      (crypto.subtle as any).deriveKey = original;
      Deno.env.delete("FGP_LOGS_ENABLED");
      teardown();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
