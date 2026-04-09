import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";
import type { Scope } from "../../src/middleware/scopes.ts";

const CLIENT_KEY = "body-filter-test-key";
const SERVER_SALT = "body-filter-test-salt";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  Deno.env.set("FGP_SALT", SERVER_SALT);
  Deno.env.set("SCALINGO_AUTH_URL", "https://auth.mock.local");
}

function teardown() {
  globalThis.fetch = originalFetch;
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("SCALINGO_AUTH_URL");
}

function mockFetch() {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.includes("auth.mock.local/v1/tokens/exchange")) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "mock-bearer-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (url.includes("api.mock.local")) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    return Promise.resolve(new Response("Not found", { status: 404 }));
  }) as typeof globalThis.fetch;
}

function createApp(): Hono {
  const app = new Hono();
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function makeBlob(
  scopes: Scope[],
  overrides?: {
    v?: number;
    ttl?: number;
    createdAt?: number;
    target?: string;
    auth?: string;
    token?: string;
  },
): Promise<string> {
  const hasStructured = scopes.some((s) => typeof s !== "string");
  return await encryptBlob(
    {
      v: overrides?.v ?? (hasStructured ? 3 : 2),
      token: overrides?.token ?? "tk-us-test-token",
      target: overrides?.target ?? "https://api.mock.local",
      auth: overrides?.auth ?? "scalingo-exchange",
      scopes,
      ttl: overrides?.ttl ?? 3600,
      createdAt: overrides?.createdAt ?? nowUnix(),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

// --- v2 backward compat ---

Deno.test({
  name: "integration body-filters: v2 string scopes still work",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"], { v: 2 });

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: v2 string scopes deny wrong method",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"], { v: 2 });

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: "test" }),
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- v3 ScopeEntry with bodyFilters ---

Deno.test({
  name: "AC-5.1: integration body-filters: POST with matching body filter returns 200",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [
              { type: "any", value: "main" },
              { type: "any", value: "master" },
            ],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "main" } }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-5.2: integration body-filters: POST with non-matching body filter returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [
              { type: "any", value: "main" },
              { type: "any", value: "master" },
            ],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "develop" } }),
    });
    const body = await res.json();

    assertEquals(res.status, 403);
    assertEquals(body.error, "scope_denied");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-5.15: integration body-filters: non-JSON body with bodyFilter scope returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "wildcard" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "text/plain",
      },
      body: "not json at all",
    });
    const body = await res.json();

    assertEquals(res.status, 403);
    assertEquals(body.error, "scope_denied");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-5.5+AC-5.6: integration body-filters: stringwildcard filter with glob pattern",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "stringwildcard", value: "release/*" }],
          },
        ],
      },
    ]);

    const resMatch = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "release/1.0" } }),
    });
    assertEquals(resMatch.status, 200);

    _resetStoreForTests();
    mockFetch();

    const resNoMatch = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "feature/xyz" } }),
    });
    assertEquals(resNoMatch.status, 403);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-4.4: integration body-filters: mixed string + ScopeEntry scopes in same blob",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      "GET:/v1/apps/*",
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const resGet = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resGet.status, 200);

    _resetStoreForTests();
    mockFetch();

    const resPost = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "main" } }),
    });
    assertEquals(resPost.status, 200);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-4.1: integration body-filters: ScopeEntry without bodyFilters allows any body",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      { methods: ["POST"], pattern: "/v1/apps/my-app/scale" },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ containers: [{ name: "web", amount: 2 }] }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- PUT / PATCH with body filters ---

Deno.test({
  name: "integration body-filters: PUT with matching body filter returns 200",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["PUT"],
        pattern: "/v1/apps/my-app/scale",
        bodyFilters: [
          {
            objectPath: "containers.0.name",
            objectValue: [{ type: "any", value: "web" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "PUT",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ containers: { "0": { name: "web" } } }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: PUT with non-matching body filter returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["PUT"],
        pattern: "/v1/apps/my-app/settings",
        bodyFilters: [
          {
            objectPath: "setting.key",
            objectValue: [{ type: "any", value: "allowed_key" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/settings`, {
      method: "PUT",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ setting: { key: "forbidden_key" } }),
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: PATCH with matching body filter returns 200",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["PATCH"],
        pattern: "/v1/apps/my-app/config",
        bodyFilters: [
          {
            objectPath: "config.feature",
            objectValue: [{ type: "stringwildcard", value: "enable_*" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/config`, {
      method: "PATCH",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config: { feature: "enable_cache" } }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: PATCH with non-matching body filter returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["PATCH"],
        pattern: "/v1/apps/my-app/config",
        bodyFilters: [
          {
            objectPath: "config.feature",
            objectValue: [{ type: "stringwildcard", value: "enable_*" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/config`, {
      method: "PATCH",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config: { feature: "disable_cache" } }),
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Content-Type edge cases ---

Deno.test({
  name: "integration body-filters: text/plain Content-Type with body filters returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["PUT"],
        pattern: "/v1/apps/my-app/data",
        bodyFilters: [
          {
            objectPath: "field",
            objectValue: [{ type: "wildcard" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/data`, {
      method: "PUT",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "text/plain",
      },
      body: "plain text body",
    });
    const body = await res.json();

    assertEquals(res.status, 403);
    assertEquals(body.error, "scope_denied");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: form-urlencoded Content-Type with body filters returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/data",
        bodyFilters: [
          {
            objectPath: "field",
            objectValue: [{ type: "wildcard" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/data`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "field=value",
    });
    const body = await res.json();

    assertEquals(res.status, 403);
    assertEquals(body.error, "scope_denied");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Empty / null body edge cases ---

Deno.test({
  name: "integration body-filters: POST with empty JSON object body and body filters returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: POST with JSON null body and body filters returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "wildcard" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(null),
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration body-filters: POST with JSON array body and body filters returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ deployment: { git_ref: "main" } }]),
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name:
    "integration body-filters: body with extra fields still matches if filter fields are correct",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deployment: { git_ref: "main", source_url: "https://example.com" },
        extra_field: "ignored",
        another: 42,
      }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Backward compat: v2 blob with body in request ---

Deno.test({
  name: "integration body-filters: v2 string scopes ignore body content entirely",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["POST:/v1/apps/*"], { v: 2 });

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "anything" } }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Mixed scopes: string match short-circuits body filter check ---

Deno.test({
  name:
    "AC-4.4: integration body-filters: string scope matches same route → body filter on ScopeEntry is irrelevant",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      "POST:/v1/apps/my-app/deployments",
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deployment: { git_ref: "develop" } }),
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-5.16: invalid JSON body with body filters returns 400 ---

Deno.test({
  name: "AC-5.16: integration body-filters: invalid JSON body with body filters returns 400",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "wildcard" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: {
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: "{not valid json",
    });
    const body = await res.json();

    assertEquals(res.status, 400);
    assertEquals(body.error, "invalid_body");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-5.20: GET with ScopeEntry POST + body filters ---

Deno.test({
  name:
    "AC-5.20: integration body-filters: GET request matches string scope, POST ScopeEntry irrelevant",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      "GET:/v1/apps/my-app/deployments",
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- AC-5.21: POST without body with body filters returns 403 ---

Deno.test({
  name: "AC-5.21: integration body-filters: POST without body and body filters returns 403",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([
      {
        methods: ["POST"],
        pattern: "/v1/apps/my-app/deployments",
        bodyFilters: [
          {
            objectPath: "deployment.git_ref",
            objectValue: [{ type: "any", value: "main" }],
          },
        ],
      },
    ]);

    const res = await app.request(`/${blob}/v1/apps/my-app/deployments`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
