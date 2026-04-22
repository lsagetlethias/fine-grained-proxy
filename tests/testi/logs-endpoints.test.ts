import { assertEquals } from "@std/assert";

import { app } from "../../src/main.ts";
import { encryptBlob } from "../../src/crypto/blob.ts";
import type { BlobConfig } from "../../src/crypto/blob.ts";
import { _resetStoreForTests, append, subscribe } from "../../src/logs/store.ts";
import { computeBlobId } from "../../src/logs/blob-id.ts";

const SALT = "test-logs-salt";
const CLIENT_KEY = "client-key-test";

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

async function makeBlob(overrides: Partial<BlobConfig> = {}): Promise<string> {
  const config: BlobConfig = {
    v: 3,
    token: "tk-test",
    target: "https://api.mock.local",
    auth: "bearer",
    scopes: ["GET:/v1/apps/*"],
    ttl: 3600,
    createdAt: nowUnix(),
    ...overrides,
  };
  return await encryptBlob(config, CLIENT_KEY, SALT);
}

function setEnv(): void {
  Deno.env.set("FGP_SALT", SALT);
}

function clearEnv(): void {
  Deno.env.delete("FGP_SALT");
  Deno.env.delete("FGP_LOGS_ENABLED");
}

Deno.test({
  name: "AC-30.1: GET /logs/health returns {enabled:true} when kill switch on",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const res = await app.request("/logs/health");
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.enabled, true);
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-30.2: GET /logs/health returns {enabled:false} when kill switch off",
  fn: async () => {
    setEnv();
    try {
      const res = await app.request("/logs/health");
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.enabled, false);
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-30.3: GET /logs/health requires no auth",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const res = await app.request("/logs/health");
      assertEquals(res.status, 200);
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-18.1: GET /logs returns 404 when kill switch off",
  fn: async () => {
    setEnv();
    try {
      const res = await app.request("/logs");
      assertEquals(res.status, 404);
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-18.2: GET /logs/stream returns 404 when kill switch off",
  fn: async () => {
    setEnv();
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 404);
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.1: GET /logs/stream without headers returns 401",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const res = await app.request("/logs/stream");
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "missing_key");
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.2: GET /logs/stream with wrong key returns 401 invalid_credentials",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": "wrong-key" },
      });
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.error, "invalid_credentials");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.14: GET /logs/stream with blob > 4KB returns 414 blob_too_large",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const oversized = "a".repeat(4097);
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": oversized, "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 414);
      const body = await res.json();
      assertEquals(body.error, "blob_too_large");
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-18.6: blob with logs.detailed:true but logs.enabled:false is treated as logs off",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const blob = await makeBlob({ logs: { enabled: false, detailed: true } });
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 403);
      const body = await res.json();
      assertEquals(body.error, "logs_not_enabled");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.3: GET /logs/stream on blob without logs.enabled returns 403",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const blob = await makeBlob();
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 403);
      const body = await res.json();
      assertEquals(body.error, "logs_not_enabled");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.5: GET /logs/stream on expired blob returns 410",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const blob = await makeBlob({
        logs: { enabled: true, detailed: false },
        createdAt: nowUnix() - 7200,
        ttl: 1,
      });
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 410);
      const body = await res.json();
      assertEquals(body.error, "token_expired");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-24.4: GET /logs/stream with malformed since returns 400 invalid_request",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const res = await app.request("/logs/stream?since=foo", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 400);
      const body = await res.json();
      assertEquals(body.error, "invalid_request");
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.6: second stream for same blob returns 409 logs_stream_conflict",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const blobId = await computeBlobId(blob);
      const unsub = subscribe(blobId, () => {});
      try {
        const res = await app.request("/logs/stream", {
          headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
        });
        assertEquals(res.status, 409);
        const body = await res.json();
        assertEquals(body.error, "logs_stream_conflict");
      } finally {
        unsub();
      }
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-23.8 + AC-24.2: stream flushes ring buffer on connect (without since)",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const blobId = await computeBlobId(blob);
      append(blobId, {
        type: "network",
        ts: 100,
        method: "GET",
        path: "/foo",
        status: 200,
        durationMs: 5,
        ipPrefix: "10.0.0.0/24",
      });
      append(blobId, {
        type: "network",
        ts: 200,
        method: "GET",
        path: "/bar",
        status: 200,
        durationMs: 7,
        ipPrefix: "10.0.0.0/24",
      });

      const controller = new AbortController();
      const res = await app.request("/logs/stream", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
        signal: controller.signal,
      });
      assertEquals(res.status, 200);
      assertEquals(res.headers.get("Content-Type"), "text/event-stream");
      assertEquals(res.headers.get("X-FGP-Source"), "proxy");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let got = "";
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        got += decoder.decode(value, { stream: true });
        if (got.includes("/bar")) break;
      }
      controller.abort();
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      assertEquals(got.includes('"path":"/foo"'), true);
      assertEquals(got.includes('"path":"/bar"'), true);
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-24.1: stream with ?since filters strictly by ts > since",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    try {
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const blobId = await computeBlobId(blob);
      for (const ts of [100, 200, 300, 400]) {
        append(blobId, {
          type: "network",
          ts,
          method: "GET",
          path: "/p" + ts,
          status: 200,
          durationMs: 1,
          ipPrefix: "10.0.0.0/24",
        });
      }

      const controller = new AbortController();
      const res = await app.request("/logs/stream?since=250", {
        headers: { "X-FGP-Blob": blob, "X-FGP-Key": CLIENT_KEY },
        signal: controller.signal,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let got = "";
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        got += decoder.decode(value, { stream: true });
        if (got.includes("/p400")) break;
      }
      controller.abort();
      try {
        await reader.cancel();
      } catch { /* ignore */ }
      assertEquals(got.includes("/p100"), false);
      assertEquals(got.includes("/p200"), false);
      assertEquals(got.includes("/p300"), true);
      assertEquals(got.includes("/p400"), true);
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-18.4: no capture when kill switch on but blob has no logs field",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch;
      const blob = await makeBlob();
      const blobId = await computeBlobId(blob);
      const res = await app.request("/" + blob + "/v1/apps/my-app", {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      await res.body?.cancel();
      const { _hasBlobForTests } = await import("../../src/logs/store.ts");
      assertEquals(_hasBlobForTests(blobId), false);
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-18.5 + AC-19.1: request on blob with logs.enabled creates network entry",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch;
      const blob = await makeBlob({ logs: { enabled: true, detailed: false } });
      const blobId = await computeBlobId(blob);
      const res = await app.request("/" + blob + "/v1/apps/my-app", {
        headers: { "X-FGP-Key": CLIENT_KEY, "X-Forwarded-For": "203.0.113.42" },
      });
      await res.body?.cancel();
      const { _getNetworkBufferForTests } = await import("../../src/logs/store.ts");
      const buf = _getNetworkBufferForTests(blobId);
      assertEquals(buf.length, 1);
      assertEquals(buf[0].method, "GET");
      assertEquals(buf[0].path, "/v1/apps/my-app");
      assertEquals(buf[0].status, 200);
      assertEquals(buf[0].ipPrefix, "203.0.113.0/24");
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-19.9: FGP-generated 403 scope_denied still produces network entry with status 403",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    try {
      const blob = await makeBlob({
        logs: { enabled: true, detailed: false },
        scopes: ["GET:/allowed/*"],
      });
      const blobId = await computeBlobId(blob);
      const res = await app.request("/" + blob + "/denied/path", {
        headers: { "X-FGP-Key": CLIENT_KEY },
      });
      assertEquals(res.status, 403);
      const { _getNetworkBufferForTests } = await import("../../src/logs/store.ts");
      const buf = _getNetworkBufferForTests(blobId);
      assertEquals(buf.length, 1);
      assertEquals(buf[0].status, 403);
    } finally {
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: "AC-20.7: multipart content-type does not produce detailed entry",
  fn: async () => {
    setEnv();
    Deno.env.set("FGP_LOGS_ENABLED", "1");
    _resetStoreForTests();
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch;
      const blob = await makeBlob({
        logs: { enabled: true, detailed: true },
        scopes: ["POST:/upload"],
      });
      const blobId = await computeBlobId(blob);
      const res = await app.request("/" + blob + "/upload", {
        method: "POST",
        headers: {
          "X-FGP-Key": CLIENT_KEY,
          "Content-Type": "multipart/form-data; boundary=xxx",
        },
        body: "--xxx\r\n",
      });
      await res.body?.cancel();
      const { _getNetworkBufferForTests, _getDetailedBufferForTests } = await import(
        "../../src/logs/store.ts"
      );
      assertEquals(_getNetworkBufferForTests(blobId).length, 1);
      assertEquals(_getDetailedBufferForTests(blobId).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      clearEnv();
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
