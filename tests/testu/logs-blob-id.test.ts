import { assertEquals, assertNotEquals } from "@std/assert";

import { computeBlobId } from "../../src/logs/blob-id.ts";

Deno.test({
  name: "AC-18.1: blobId is 16 hex chars lowercase",
  fn: async () => {
    const id = await computeBlobId("some-blob-value");
    assertEquals(id.length, 16);
    assertEquals(/^[0-9a-f]{16}$/.test(id), true);
  },
});

Deno.test({
  name: "AC-18.1: blobId is deterministic for same input",
  fn: async () => {
    const id1 = await computeBlobId("same-blob");
    const id2 = await computeBlobId("same-blob");
    assertEquals(id1, id2);
  },
});

Deno.test({
  name: "AC-18.1: blobId differs for distinct inputs",
  fn: async () => {
    const a = await computeBlobId("blob-a");
    const b = await computeBlobId("blob-b");
    assertNotEquals(a, b);
  },
});

Deno.test({
  name: "Assumption AC-crypto.2: blobId is SHA-256 prefix, not reversible container",
  fn: async () => {
    const id = await computeBlobId("test");
    assertEquals(id, "9f86d081884c7d65");
  },
});
