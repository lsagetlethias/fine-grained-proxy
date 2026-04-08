import { assertEquals } from "@std/assert";
import { Hono } from "hono";

import { encryptBlob } from "../../src/crypto/blob.ts";
import { proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "integration-test-key";
const SERVER_SALT = "integration-test-salt";

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

function mockFetch(overrides?: { apiStatus?: number; authStatus?: number }) {
  const apiStatus = overrides?.apiStatus ?? 200;
  const authStatus = overrides?.authStatus ?? 200;

  globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.includes("auth.mock.local/v1/tokens/exchange")) {
      if (authStatus !== 200) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "unauthorized" }), { status: authStatus }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ token: "mock-bearer-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (url.includes("api.mock.local")) {
      if (apiStatus === 429) {
        return Promise.resolve(
          new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
        );
      }
      if (apiStatus >= 500) {
        return Promise.resolve(new Response("Internal Server Error", { status: apiStatus }));
      }
      if (apiStatus === 401) {
        return Promise.resolve(new Response("{}", { status: 401 }));
      }
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
  scopes: string[],
  overrides?: {
    ttl?: number;
    createdAt?: number;
    target?: string;
    auth?: string;
    token?: string;
  },
): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
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

// --- Core proxy flow ---

Deno.test({
  name: "integration: full proxy flow returns 200 (scalingo-exchange)",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

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
  name: "integration: missing X-FGP-Key returns 401 missing_key",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`);
    const body = await res.json();

    assertEquals(res.status, 401);
    assertEquals(body.error, "missing_key");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: wrong key returns 401 invalid_credentials",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": "wrong-key" },
    });
    const body = await res.json();

    assertEquals(res.status, 401);
    assertEquals(body.error, "invalid_credentials");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: expired token returns 410 token_expired",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"], { ttl: 1, createdAt: nowUnix() - 60 });

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 410);
    assertEquals(body.error, "token_expired");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: ttl 0 never expires",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"], { ttl: 0, createdAt: 0 });

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
  name: "integration: blob > 4096 chars returns 414 blob_too_large",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const fakeBlob = "A".repeat(4097);

    const res = await app.request(`/${fakeBlob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 414);
    assertEquals(body.error, "blob_too_large");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Scope checks (METHOD:PATH) ---

Deno.test({
  name: "integration: GET allowed, POST denied with GET-only scope",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const resGet = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resGet.status, 200);

    _resetStoreForTests();
    mockFetch();
    const resPost = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await resPost.json();
    assertEquals(resPost.status, 403);
    assertEquals(body.error, "scope_denied");

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: exact path scope matches only that path",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["POST:/v1/apps/my-app/scale"]);

    const res = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);

    _resetStoreForTests();
    mockFetch();
    const resDenied = await app.request(`/${blob}/v1/apps/my-app/restart`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resDenied.status, 403);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: wildcard method allows any method",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["*:/v1/apps/*"]);

    const resGet = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resGet.status, 200);

    _resetStoreForTests();
    mockFetch();
    const resPost = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resPost.status, 200);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: full wildcard scope allows everything",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/anything/at/all`, {
      method: "PUT",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: multi-method scope works",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob(["GET|POST:/v1/apps/*"]);

    const resGet = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resGet.status, 200);

    _resetStoreForTests();
    mockFetch();
    const resPost = await app.request(`/${blob}/v1/apps/my-app/scale`, {
      method: "POST",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resPost.status, 200);

    _resetStoreForTests();
    mockFetch();
    const resPut = await app.request(`/${blob}/v1/apps/my-app/variables`, {
      method: "PUT",
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(resPut.status, 403);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: empty scopes deny everything",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();
    const blob = await makeBlob([]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 403);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Auth modes ---

Deno.test({
  name: "integration: bearer auth sends Authorization: Bearer header",
  fn: async () => {
    setup();
    let capturedAuth = "";
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        capturedAuth = (init?.headers as Headers)?.get("Authorization") ?? "";
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "bearer", token: "my-api-token" });

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedAuth, "Bearer my-api-token");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: basic auth sends Authorization: Basic header",
  fn: async () => {
    setup();
    let capturedAuth = "";
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        capturedAuth = (init?.headers as Headers)?.get("Authorization") ?? "";
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "basic", token: "my-api-token" });

    const res = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedAuth, `Basic ${btoa(":my-api-token")}`);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: header:X-API-Key auth sends custom header",
  fn: async () => {
    setup();
    let capturedHeader = "";
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        capturedHeader = (init?.headers as Headers)?.get("X-API-Key") ?? "";
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "header:X-API-Key", token: "secret-key" });

    const res = await app.request(`/${blob}/v1/data`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedHeader, "secret-key");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: scalingo-exchange does token exchange and caches bearer",
  fn: async () => {
    setup();
    let exchangeCount = 0;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        exchangeCount++;
        return Promise.resolve(
          new Response(JSON.stringify({ token: "bearer-from-exchange" }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], { auth: "scalingo-exchange" });

    const res1 = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res1.status, 200);
    assertEquals(exchangeCount, 1);

    const res2 = await app.request(`/${blob}/v1/apps`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res2.status, 200);
    assertEquals(exchangeCount, 1);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Upstream error handling ---

Deno.test({
  name: "integration: upstream 401 returns 502 upstream_auth_failed",
  fn: async () => {
    setup();
    mockFetch({ apiStatus: 401 });
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_auth_failed");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: upstream 429 returns 429 rate_limited with Retry-After",
  fn: async () => {
    setup();
    mockFetch({ apiStatus: 429 });
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 429);
    assertEquals(body.error, "rate_limited");
    assertEquals(res.headers.get("Retry-After"), "30");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: upstream 500 returns 502 upstream_error",
  fn: async () => {
    setup();
    mockFetch({ apiStatus: 500 });
    const app = createApp();
    const blob = await makeBlob(["GET:/v1/apps/*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const body = await res.json();

    assertEquals(res.status, 502);
    assertEquals(body.error, "upstream_error");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Target forwarding ---

Deno.test({
  name: "integration: request is forwarded to config.target",
  fn: async () => {
    setup();
    let capturedUrl = "";
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("custom-api.example.com")) {
        capturedUrl = url;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"], {
      auth: "bearer",
      target: "https://custom-api.example.com",
    });

    const res = await app.request(`/${blob}/v1/resources/123`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    assertEquals(res.status, 200);
    assertEquals(capturedUrl, "https://custom-api.example.com/v1/resources/123");
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: Set-Cookie from upstream is stripped",
  fn: async () => {
    setup();
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "bearer" }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response("{}", {
          status: 200,
          headers: { "Set-Cookie": "session=abc; Path=/", "Content-Type": "application/json" },
        }),
      );
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Set-Cookie"), null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "integration: X-FGP-Key is not forwarded to target",
  fn: async () => {
    setup();
    let forwardedFgpKey: string | null = "not-checked";
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "bearer" }), { status: 200 }),
        );
      }
      forwardedFgpKey = (init?.headers as Headers)?.get("X-FGP-Key");
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(forwardedFgpKey, null);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Singleflight ---

Deno.test({
  name: "integration: singleflight deduplicates concurrent exchanges",
  fn: async () => {
    setup();
    let exchangeCount = 0;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.mock.local")) {
        exchangeCount++;
        return new Promise<Response>((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify({ token: "bearer-sf" }), { status: 200 }),
              ),
            50,
          )
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob(["*:*"]);

    const [r1, r2, r3] = await Promise.all([
      app.request(`/${blob}/v1/apps/my-app`, { headers: { "X-FGP-Key": CLIENT_KEY } }),
      app.request(`/${blob}/v1/apps/my-app`, { headers: { "X-FGP-Key": CLIENT_KEY } }),
      app.request(`/${blob}/v1/apps/my-app`, { headers: { "X-FGP-Key": CLIENT_KEY } }),
    ]);

    assertEquals(r1.status, 200);
    assertEquals(r2.status, 200);
    assertEquals(r3.status, 200);
    assertEquals(exchangeCount, 1);
    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

// --- Token not leaked in errors ---

Deno.test({
  name: "integration: token never appears in error response bodies",
  fn: async () => {
    setup();
    mockFetch();
    const app = createApp();

    const blob = await makeBlob(["GET:/v1/apps/*"], { ttl: 1, createdAt: nowUnix() - 60 });
    const expiredRes = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const expiredBody = await expiredRes.text();
    assertEquals(expiredBody.includes("tk-us-test-token"), false);

    const blob2 = await makeBlob([]);
    const forbiddenRes = await app.request(`/${blob2}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });
    const forbiddenBody = await forbiddenRes.text();
    assertEquals(forbiddenBody.includes("tk-us-test-token"), false);

    teardown();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
