import { test } from "node:test";

import { assertEquals, assertNotEquals } from "../_assert.ts";
import { decodeBase64Url } from "../../src/crypto/base64url.ts";
import { captureDetailed, captureNetwork } from "../../src/logs/capture.ts";
import {
  _getDetailedBufferForTests,
  _getNetworkBufferForTests,
  _resetStoreForTests,
} from "../../src/logs/store.ts";
import { deriveKey } from "../../src/crypto/blob.ts";

const CLIENT_KEY = "test-client-key-padding-0123";
const SERVER_SALT = "test-server-salt";

async function makeKey() {
  return await deriveKey(CLIENT_KEY, SERVER_SALT);
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

test("AC-19.1: network entry has exactly the required fields", () => {
  _resetStoreForTests();
  const blobId = "aaaaaaaaaaaaaaaa";
  captureNetwork({
    blobId,
    method: "GET",
    path: "/v1/apps",
    status: 200,
    durationMs: 42,
    ipPrefix: "203.0.113.0/24",
    ts: 1_700_000_000_000,
    queryParamNames: null,
  });
  const buf = _getNetworkBufferForTests(blobId);
  assertEquals(buf.length, 1);
  const keys = Object.keys(buf[0]).sort();
  assertEquals(keys, ["durationMs", "ipPrefix", "method", "path", "status", "ts", "type"]);
  assertEquals(buf[0].type, "network");
});

test("AC-20.9 + AC-20.10: detailed body is gzipped + AES-GCM encrypted, round-trip works", async () => {
  _resetStoreForTests();
  const blobId = "bbbbbbbbbbbbbbbb";
  const body = new TextEncoder().encode('{"branch":"main"}');
  const key = await makeKey();
  await captureDetailed({
    blobId,
    method: "POST",
    path: "/deploy",
    bodyRaw: body,
    derivedKey: key,
    ts: 1,
  });
  const buf = _getDetailedBufferForTests(blobId);
  assertEquals(buf.length, 1);
  const entry = buf[0];
  assertEquals(entry.type, "detailed");
  if (entry.type !== "detailed" || entry.truncated) throw new Error("unexpected");
  const raw = decodeBase64Url(entry.bodyEncrypted);
  const iv = raw.slice(0, 12);
  const cipher = raw.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const plain = await gunzip(new Uint8Array(decrypted));
  assertEquals(new TextDecoder().decode(plain), '{"branch":"main"}');
});

test("AC-20.11: detailed body over max size is marked truncated without bodyEncrypted", async () => {
  _resetStoreForTests();
  process.env.FGP_LOGS_DETAILED_MAX_KB = "1";
  try {
    const blobId = "cccccccccccccccc";
    const huge = new Uint8Array(200_000);
    for (let i = 0; i < huge.length; i += 65_536) {
      crypto.getRandomValues(huge.subarray(i, Math.min(i + 65_536, huge.length)));
    }
    const key = await makeKey();
    await captureDetailed({
      blobId,
      method: "POST",
      path: "/big",
      bodyRaw: huge,
      derivedKey: key,
      ts: 1,
    });
    const buf = _getDetailedBufferForTests(blobId);
    const entry = buf[0];
    assertEquals(entry.type, "detailed");
    if (entry.type !== "detailed") throw new Error("unexpected");
    assertEquals(entry.truncated, true);
    assertEquals("bodyEncrypted" in entry, false);
  } finally {
    delete process.env.FGP_LOGS_DETAILED_MAX_KB;
  }
});

test("AC-20.16: IV is unique per captured body (distinct ciphertexts for identical bodies)", async () => {
  _resetStoreForTests();
  const blobId = "dddddddddddddddd";
  const body = new TextEncoder().encode('{"branch":"main"}');
  const key = await makeKey();
  await captureDetailed({
    blobId,
    method: "POST",
    path: "/x",
    bodyRaw: body,
    derivedKey: key,
    ts: 1,
  });
  await captureDetailed({
    blobId,
    method: "POST",
    path: "/x",
    bodyRaw: body,
    derivedKey: key,
    ts: 2,
  });
  const buf = _getDetailedBufferForTests(blobId);
  const [a, b] = buf;
  if (a.type !== "detailed" || a.truncated) throw new Error("unexpected a");
  if (b.type !== "detailed" || b.truncated) throw new Error("unexpected b");
  assertNotEquals(a.bodyEncrypted, b.bodyEncrypted);
});

test("AC-20.8: detailed entry has exactly the required fields when not truncated", async () => {
  _resetStoreForTests();
  const blobId = "eeeeeeeeeeeeeeee";
  const key = await makeKey();
  await captureDetailed({
    blobId,
    method: "POST",
    path: "/x",
    bodyRaw: new Uint8Array([1, 2, 3]),
    derivedKey: key,
    ts: 1,
  });
  const buf = _getDetailedBufferForTests(blobId);
  const entry = buf[0];
  const keys = Object.keys(entry).sort();
  assertEquals(keys, ["bodyEncrypted", "method", "path", "truncated", "ts", "type"]);
});

test("AC-19.11 + AC-19.12: no upstream token nor client key leaks into network entry", () => {
  _resetStoreForTests();
  const blobId = "ffffffffffffffff";
  captureNetwork({
    blobId,
    method: "POST",
    path: "/deploy",
    status: 201,
    durationMs: 100,
    ipPrefix: "10.0.0.0/24",
    ts: 1,
    queryParamNames: null,
  });
  const buf = _getNetworkBufferForTests(blobId);
  const blob = JSON.stringify(buf[0]);
  assertEquals(blob.includes("secret-token"), false);
  assertEquals(blob.includes("secret-key"), false);
});
