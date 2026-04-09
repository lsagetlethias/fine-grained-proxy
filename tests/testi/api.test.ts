import { assertEquals } from "@std/assert";

import { decryptBlob } from "../../src/crypto/blob.ts";
import { app } from "../../src/main.ts";

const SERVER_SALT = "test-api-salt";
const originalFetch = globalThis.fetch;

function setup() {
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
  Deno.env.set("SCALINGO_API_URL", "https://api.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_AUTH_URL");
  Deno.env.delete("SCALINGO_API_URL");
}

function mockScalingoFetch() {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.includes("auth.mock.local/v1/tokens/exchange")) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "mock-bearer" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (url.includes("api.mock.local/v1/apps")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            apps: [
              { name: "app-alpha", id: "1" },
              { name: "app-beta", id: "2" },
              { name: "app-gamma", id: "3" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    return Promise.resolve(new Response("Not found", { status: 404 }));
  }) as typeof globalThis.fetch;
}

// --- POST /api/generate ---

Deno.test({
  name: "AC-13.1: POST /api/generate returns url and key (v2 blob)",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*"],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(typeof body.url, "string");
    assertEquals(typeof body.key, "string");
    assertEquals(body.url.endsWith("/"), true);

    const blobPart = body.url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
    const config = await decryptBlob(blobPart, body.key, SERVER_SALT);
    assertEquals(config.v, 2);
    assertEquals(config.token, "tk-us-test");
    assertEquals(config.target, "https://api.example.com");
    assertEquals(config.auth, "bearer");
    assertEquals(config.scopes, ["GET:/v1/apps/*"]);
    assertEquals(config.ttl, 3600);
    assertEquals(typeof config.createdAt, "number");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.2: POST /api/generate with invalid body returns 400",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "" }),
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.2: POST /api/generate with missing target returns 400",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        auth: "bearer",
        scopes: ["*:*"],
        ttl: 3600,
      }),
    });

    assertEquals(res.status, 400);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate with no JSON body returns 400",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      body: "not json",
    });

    assertEquals(res.status, 400);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate without FGP_SALT returns 500",
  fn: async () => {
    Deno.env.delete("FGP_SALT");

    const res = await app.request("/api/generate", {
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

    assertEquals(res.status, 500);
    assertEquals(body.error, "server_error");
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- POST /api/list-apps ---

Deno.test({
  name: "POST /api/list-apps returns sorted app names",
  fn: async () => {
    setup();
    mockScalingoFetch();

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tk-us-test" }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.apps, ["app-alpha", "app-beta", "app-gamma"]);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/list-apps with invalid token returns 401",
  fn: async () => {
    setup();
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(new Response("{}", { status: 401 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad-token" }),
    });
    const body = await res.json();

    assertEquals(res.status, 401);
    assertEquals(body.error, "token_exchange_failed");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/list-apps with no body returns 400",
  fn: async () => {
    setup();

    const res = await app.request("/api/list-apps", {
      method: "POST",
      body: "not json",
    });

    assertEquals(res.status, 400);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/list-apps with empty token returns 400",
  fn: async () => {
    setup();

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "" }),
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- X-Forwarded-* headers ---

Deno.test({
  name: "POST /api/generate respects X-Forwarded-Host and X-Forwarded-Proto",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Host": "ducmaxv2.ts.sagetlethias.tech",
        "X-Forwarded-Proto": "http",
      },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*"],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.url.startsWith("http://ducmaxv2.ts.sagetlethias.tech/"), true);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/generate defaults proto to https when only X-Forwarded-Host is set",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-Host": "fgp.example.com",
      },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*"],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    assertEquals(body.url.startsWith("https://fgp.example.com/"), true);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Zod validation ---

Deno.test({
  name: "POST /api/generate with wrong field types returns 400 (Zod validation)",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: "not-an-array",
        ttl: "not-a-number",
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "POST /api/list-apps with wrong field types returns 400 (Zod validation)",
  fn: async () => {
    setup();

    const res = await app.request("/api/list-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: 12345 }),
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Scope limits validation on /api/generate ---

Deno.test({
  name: "AC-13.6: POST /api/generate rejects not(wildcard) in body filter",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/test",
          bodyFilters: [{
            objectPath: "field",
            objectValue: [{ type: "not", value: { type: "wildcard" } }],
          }],
        }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.6: POST /api/generate rejects not(not(...)) in body filter",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/test",
          bodyFilters: [{
            objectPath: "field",
            objectValue: [{
              type: "not",
              value: { type: "not", value: { type: "any", value: "x" } },
            }],
          }],
        }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.4: POST /api/generate rejects more than 8 body filters per scope",
  fn: async () => {
    setup();
    const filters = [];
    for (let i = 0; i < 9; i++) {
      filters.push({ objectPath: "field" + i, objectValue: [{ type: "wildcard" }] });
    }
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{ methods: ["POST"], pattern: "/v1/test", bodyFilters: filters }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.4: POST /api/generate rejects more than 16 OR values per filter",
  fn: async () => {
    setup();
    const values = [];
    for (let i = 0; i < 17; i++) {
      values.push({ type: "any", value: "val" + i });
    }
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/test",
          bodyFilters: [{ objectPath: "field", objectValue: values }],
        }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.4: POST /api/generate rejects dot-path with more than 6 segments",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/test",
          bodyFilters: [{
            objectPath: "a.b.c.d.e.f.g",
            objectValue: [{ type: "wildcard" }],
          }],
        }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.4: POST /api/generate rejects more than 10 structured scopes",
  fn: async () => {
    setup();
    const scopes = [];
    for (let i = 0; i < 11; i++) {
      scopes.push({ methods: ["GET"], pattern: "/v1/test/" + i });
    }
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: scopes,
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.4: POST /api/generate accepts valid structured scopes within limits",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/apps/my-app/deployments",
          bodyFilters: [{
            objectPath: "deployment.git_ref",
            objectValue: [
              {
                type: "and",
                value: [
                  { type: "stringwildcard", value: "release/*" },
                  { type: "not", value: { type: "any", value: "release/broken" } },
                ],
              },
            ],
          }],
        }],
        ttl: 3600,
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

// --- AC-13.5: version automatique v2/v3 ---

Deno.test({
  name: "AC-13.5: POST /api/generate with string scopes only produces v2 blob",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: ["GET:/v1/apps/*", "POST:/v1/apps/my-app/scale"],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    const blobPart = body.url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
    const config = await decryptBlob(blobPart, body.key, SERVER_SALT);
    assertEquals(config.v, 2);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.5: POST /api/generate with ScopeEntry produces v3 blob",
  fn: async () => {
    setup();

    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{ methods: ["POST"], pattern: "/v1/apps/*" }],
        ttl: 3600,
      }),
    });
    const body = await res.json();

    assertEquals(res.status, 200);
    const blobPart = body.url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");
    const config = await decryptBlob(blobPart, body.key, SERVER_SALT);
    assertEquals(config.v, 3);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-13.6: and vide et and 1 element interdits a la generation ---

Deno.test({
  name: "AC-13.6: POST /api/generate rejects and with empty array",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/test",
          bodyFilters: [{
            objectPath: "field",
            objectValue: [{ type: "and", value: [] }],
          }],
        }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-13.6: POST /api/generate rejects and with single element",
  fn: async () => {
    setup();
    const res = await app.request("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "tk-us-test",
        target: "https://api.example.com",
        auth: "bearer",
        scopes: [{
          methods: ["POST"],
          pattern: "/v1/test",
          bodyFilters: [{
            objectPath: "field",
            objectValue: [{ type: "and", value: [{ type: "any", value: "x" }] }],
          }],
        }],
        ttl: 3600,
      }),
    });
    const body = await res.json();
    assertEquals(res.status, 400);
    assertEquals(body.error, "scope_limit_exceeded");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
