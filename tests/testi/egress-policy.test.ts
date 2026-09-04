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
