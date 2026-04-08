import { assertEquals } from "@std/assert";
import {
  _resetStoreForTests,
  clearExpired,
  getCachedBearer,
  hashToken,
  setCachedBearer,
} from "../../../src/auth/cache.ts";

function setup() {
  _resetStoreForTests();
}

Deno.test("hashToken returns consistent hex string", async () => {
  const h1 = await hashToken("tk-us-test");
  const h2 = await hashToken("tk-us-test");
  assertEquals(h1, h2);
  assertEquals(h1.length, 64);
});

Deno.test("hashToken returns different hashes for different inputs", async () => {
  const h1 = await hashToken("tk-us-aaa");
  const h2 = await hashToken("tk-us-bbb");
  assertEquals(h1 !== h2, true);
});

Deno.test("set and get cached bearer", () => {
  setup();
  setCachedBearer("hash-1", "bearer-abc");
  const result = getCachedBearer("hash-1");
  assertEquals(result, "bearer-abc");
});

Deno.test("getCachedBearer returns null for missing key", () => {
  setup();
  assertEquals(getCachedBearer("nonexistent"), null);
});

Deno.test("getCachedBearer returns null for expired entry", () => {
  setup();
  setCachedBearer("hash-exp", "bearer-value");

  const origNow = Date.now;
  Date.now = () => origNow() + 56 * 60 * 1000;

  assertEquals(getCachedBearer("hash-exp"), null);

  Date.now = origNow;
});

Deno.test("clearExpired removes only expired entries", () => {
  setup();
  setCachedBearer("hash-fresh", "bearer-fresh");
  setCachedBearer("hash-old", "bearer-old");

  const origNow = Date.now;
  const baseTime = origNow();
  Date.now = () => baseTime + 56 * 60 * 1000;

  clearExpired();

  assertEquals(getCachedBearer("hash-fresh"), null);
  assertEquals(getCachedBearer("hash-old"), null);

  Date.now = origNow;

  setup();
  setCachedBearer("hash-a", "bearer-a");

  assertEquals(getCachedBearer("hash-a"), "bearer-a");
  clearExpired();
  assertEquals(getCachedBearer("hash-a"), "bearer-a");
});
