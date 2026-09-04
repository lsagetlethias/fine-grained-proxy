import { assertEquals } from "@std/assert";
import {
  _resetStoreForTests,
  addonTokenCache,
  bearerCache,
  cachedSingleflight,
  createTokenCache,
  hashToken,
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

Deno.test("hashToken composes multiple parts into a single key", async () => {
  const single = await hashToken("tk-us-aaa");
  const composed = await hashToken("tk-us-aaa", "my-app", "ad-1111");
  const other = await hashToken("tk-us-aaa", "my-app", "ad-2222");
  assertEquals(single !== composed, true);
  assertEquals(composed !== other, true);
});

Deno.test("AC-8.1: set and get cached bearer", () => {
  setup();
  bearerCache.set("hash-1", "bearer-abc");
  assertEquals(bearerCache.get("hash-1"), "bearer-abc");
});

Deno.test("cache get returns null for missing key", () => {
  setup();
  assertEquals(bearerCache.get("nonexistent"), null);
});

Deno.test("AC-8.2: cache get returns null for expired entry (56min > 55min TTL)", () => {
  setup();
  bearerCache.set("hash-exp", "bearer-value");

  const origNow = Date.now;
  Date.now = () => origNow() + 56 * 60 * 1000;

  assertEquals(bearerCache.get("hash-exp"), null);

  Date.now = origNow;
});

Deno.test("clearExpired removes only expired entries", () => {
  setup();
  bearerCache.set("hash-fresh", "bearer-fresh");
  bearerCache.set("hash-old", "bearer-old");

  const origNow = Date.now;
  const baseTime = origNow();
  Date.now = () => baseTime + 56 * 60 * 1000;

  bearerCache.clearExpired();

  assertEquals(bearerCache.get("hash-fresh"), null);
  assertEquals(bearerCache.get("hash-old"), null);

  Date.now = origNow;

  setup();
  bearerCache.set("hash-a", "bearer-a");

  assertEquals(bearerCache.get("hash-a"), "bearer-a");
  bearerCache.clearExpired();
  assertEquals(bearerCache.get("hash-a"), "bearer-a");
});

Deno.test("bearer and addon caches are independent", () => {
  setup();
  bearerCache.set("same-key", "bearer-value");
  addonTokenCache.set("same-key", "addon-value");

  assertEquals(bearerCache.get("same-key"), "bearer-value");
  assertEquals(addonTokenCache.get("same-key"), "addon-value");
});

Deno.test("cachedSingleflight runs the producer once for concurrent callers", async () => {
  const cache = createTokenCache();
  let calls = 0;
  const produce = () =>
    new Promise<string>((resolve) => {
      calls++;
      setTimeout(() => resolve("value"), 20);
    });

  const [a, b, c] = await Promise.all([
    cachedSingleflight(cache, "k", produce),
    cachedSingleflight(cache, "k", produce),
    cachedSingleflight(cache, "k", produce),
  ]);

  assertEquals(calls, 1);
  assertEquals([a, b, c], ["value", "value", "value"]);
  assertEquals(cache.get("k"), "value");
});

Deno.test("cachedSingleflight propagates the failure to every waiter and caches nothing", async () => {
  const cache = createTokenCache();
  let calls = 0;
  const produce = () =>
    new Promise<string>((_resolve, reject) => {
      calls++;
      setTimeout(() => reject(new Error("boom")), 20);
    });

  const results = await Promise.allSettled([
    cachedSingleflight(cache, "k", produce),
    cachedSingleflight(cache, "k", produce),
  ]);

  assertEquals(calls, 1);
  assertEquals(results.map((r) => r.status), ["rejected", "rejected"]);
  assertEquals(cache.get("k"), null);
  assertEquals(cache.getInflight("k"), undefined);
});
