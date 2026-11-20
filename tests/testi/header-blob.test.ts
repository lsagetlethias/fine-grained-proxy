import { test } from "node:test";
import { Hono } from "hono";

import { assertEquals } from "../_assert.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import { blobHeaderProxy, proxyMiddleware } from "../../src/middleware/proxy.ts";
import { _resetStoreForTests } from "../../src/auth/cache.ts";

const CLIENT_KEY = "header-blob-test-key-padding";
const SERVER_SALT = "header-blob-test-salt";

const originalFetch = globalThis.fetch;

function setup() {
  _resetStoreForTests();
  process.env.FGP_SALT = SERVER_SALT;
  process.env.FGP_EGRESS_ALLOW_PRIVATE = "1";
  process.env.SCALINGO_AUTH_URL = "https://auth.mock.local";
}

function teardown() {
  globalThis.fetch = originalFetch;
  delete process.env.FGP_SALT;
  delete process.env.FGP_EGRESS_ALLOW_PRIVATE;
  delete process.env.SCALINGO_AUTH_URL;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

async function makeBlob(
  overrides?: Partial<{
    scopes: string[];
    auth: string;
    ttl: number;
    token: string;
    target: string;
    createdAt: number;
  }>,
): Promise<string> {
  return await encryptBlob(
    {
      v: 2,
      token: overrides?.token ?? "tk-us-test-token",
      target: overrides?.target ?? "https://api.mock.local",
      auth: overrides?.auth ?? "bearer",
      scopes: overrides?.scopes ?? ["GET:/v1/apps/*"],
      ttl: overrides?.ttl ?? 3600,
      createdAt: overrides?.createdAt ?? nowUnix(),
    },
    CLIENT_KEY,
    SERVER_SALT,
  );
}

function createApp(): Hono {
  const app = new Hono();
  app.use("*", blobHeaderProxy());
  app.use("/:blob{.+}/*", proxyMiddleware());
  return app;
}

test("AC-14.1: Header blob mode, requête basique GET forward 200", async () => {
  setup();
  try {
    globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
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

    const app = createApp();
    const blob = await makeBlob();

    const res = await app.request("/v1/apps/my-app", {
      headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
  } finally {
    teardown();
  }
});

test("AC-14.2: Header blob mode, X-FGP-Blob et X-FGP-Key strippés avant forward", async () => {
  setup();
  try {
    let capturedHeaders: Headers | null = null;

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        capturedHeaders = new Headers(init?.headers as HeadersInit);
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob();

    await app.request("/v1/apps/my-app", {
      headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(capturedHeaders!.get("X-FGP-Blob"), null);
    assertEquals(capturedHeaders!.get("X-FGP-Key"), null);
  } finally {
    teardown();
  }
});

test("AC-14.3: Fallback URL mode, sans header X-FGP-Blob, le mode URL fonctionne", async () => {
  setup();
  try {
    let capturedUrl = "";

    globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob();

    const res = await app.request(`/${blob}/v1/apps/my-app`, {
      headers: { "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    assertEquals(capturedUrl, "https://api.mock.local/v1/apps/my-app");
  } finally {
    teardown();
  }
});

test("AC-14.4: Header blob mode, missing X-FGP-Key returns 401 missing_key", async () => {
  setup();
  try {
    const app = createApp();
    const blob = await makeBlob();

    const res = await app.request("/v1/apps/my-app", {
      headers: { "X-FGP-Blob": blob },
    });

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "missing_key");
  } finally {
    teardown();
  }
});

test("AC-14.5: Header blob mode, invalid blob returns 401 invalid_credentials", async () => {
  setup();
  try {
    const app = createApp();

    const res = await app.request("/v1/apps/my-app", {
      headers: { "X-FGP-Blob": "invalid-garbage", "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "invalid_credentials");
  } finally {
    teardown();
  }
});

test("AC-14.6: Header blob mode, expired token returns 410 token_expired", async () => {
  setup();
  try {
    const app = createApp();
    const blob = await makeBlob({
      ttl: 1,
      createdAt: nowUnix() - 3600,
    });

    const res = await app.request("/v1/apps/my-app", {
      headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 410);
    const body = await res.json();
    assertEquals(body.error, "token_expired");
  } finally {
    teardown();
  }
});

test("AC-14.7: Header blob mode, scope denied returns 403 scope_denied", async () => {
  setup();
  try {
    const app = createApp();
    const blob = await makeBlob({ scopes: ["GET:/v1/apps/*"] });

    const res = await app.request("/v1/apps/my-app/scale", {
      method: "POST",
      headers: {
        "X-FGP-Blob": blob,
        "X-FGP-Key": CLIENT_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 2 }),
    });

    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "scope_denied");
  } finally {
    teardown();
  }
});

test("AC-14.8: Header blob mode, query string preserved dans l'URL target", async () => {
  setup();
  try {
    let capturedUrl = "";

    globalThis.fetch = ((input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("api.mock.local")) {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("Not found", { status: 404 }));
    }) as typeof globalThis.fetch;

    const app = createApp();
    const blob = await makeBlob({ scopes: ["GET:/v1/*"] });

    const res = await app.request("/v1/apps?page=2&per_page=10", {
      headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
    });

    assertEquals(res.status, 200);
    assertEquals(capturedUrl, "https://api.mock.local/v1/apps?page=2&per_page=10");
  } finally {
    teardown();
  }
});
