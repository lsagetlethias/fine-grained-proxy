import { test } from "node:test";

import { assertEquals, assertNotEquals } from "../_assert.ts";
import { computeBlobId } from "../../src/logs/blob-id.ts";

test("AC-18.1: blobId is 16 hex chars lowercase", async () => {
  const id = await computeBlobId("some-blob-value");
  assertEquals(id.length, 16);
  assertEquals(/^[0-9a-f]{16}$/.test(id), true);
});

test("AC-18.1: blobId is deterministic for same input", async () => {
  const id1 = await computeBlobId("same-blob");
  const id2 = await computeBlobId("same-blob");
  assertEquals(id1, id2);
});

test("AC-18.1: blobId differs for distinct inputs", async () => {
  const a = await computeBlobId("blob-a");
  const b = await computeBlobId("blob-b");
  assertNotEquals(a, b);
});

test("Assumption AC-crypto.2: blobId is SHA-256 prefix, not reversible container", async () => {
  const id = await computeBlobId("test");
  assertEquals(id, "9f86d081884c7d65");
});
