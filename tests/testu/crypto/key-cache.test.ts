import { assertEquals } from "@std/assert";
import {
  _keyCacheSizeForTests,
  _resetKeyCacheForTests,
  fingerprint,
  getCachedKey,
  KEY_CACHE_CAPACITY,
  purgeExpiredKeys,
  setCachedKey,
} from "../../../src/crypto/key-cache.ts";
import { deriveKey } from "../../../src/crypto/blob.ts";

const SALT = "key-cache-test-salt";

Deno.test("AC-50.1: deux derivations avec la meme cle n'appellent deriveKey qu'une fois", async () => {
  _resetKeyCacheForTests();
  const original = crypto.subtle.deriveKey.bind(crypto.subtle);
  let calls = 0;
  // deno-lint-ignore no-explicit-any
  (crypto.subtle as any).deriveKey = (...args: unknown[]) => {
    calls++;
    // deno-lint-ignore no-explicit-any
    return (original as any)(...args);
  };
  try {
    const k1 = await deriveKey("cle-de-test-partagee-0123456789", SALT);
    const k2 = await deriveKey("cle-de-test-partagee-0123456789", SALT);
    assertEquals(calls, 1);
    assertEquals(k1, k2);
  } finally {
    // deno-lint-ignore no-explicit-any
    (crypto.subtle as any).deriveKey = original;
    _resetKeyCacheForTests();
  }
});

Deno.test("AC-50.2: la table ne contient jamais la cle client en clair", async () => {
  _resetKeyCacheForTests();
  const clientKey = "cle-client-tres-reconnaissable-42";
  const index = await fingerprint(clientKey, SALT);
  assertEquals(index.includes(clientKey), false);
  assertEquals(index.length, 64);
  assertEquals(/^[0-9a-f]+$/.test(index), true);
  // deux sels differents produisent deux index differents
  assertEquals(index === await fingerprint(clientKey, "autre-sel"), false);
});

Deno.test("AC-50.3: l'entree 513 evince la plus ancienne", async () => {
  _resetKeyCacheForTests();
  const key = await deriveKey("cle-de-base-pour-le-test-01234", SALT);
  for (let i = 0; i < KEY_CACHE_CAPACITY; i++) setCachedKey(`index-${i}`, key);
  assertEquals(_keyCacheSizeForTests(), KEY_CACHE_CAPACITY);
  assertEquals(getCachedKey("index-0") !== null, true);

  setCachedKey("index-nouveau", key);
  assertEquals(_keyCacheSizeForTests(), KEY_CACHE_CAPACITY);
  // index-0 vient d'etre relu, donc ce n'est plus lui le plus ancien : c'est index-1
  assertEquals(getCachedKey("index-1"), null);
  assertEquals(getCachedKey("index-nouveau") !== null, true);
  _resetKeyCacheForTests();
});

Deno.test("AC-50.4: une entree expiree est purgee et redérivee", async () => {
  _resetKeyCacheForTests();
  const key = await deriveKey("cle-pour-expiration-0123456789", SALT);
  setCachedKey("index-expirable", key);
  assertEquals(getCachedKey("index-expirable") !== null, true);

  const origNow = Date.now;
  Date.now = () => origNow() + 11 * 60 * 1000;
  try {
    assertEquals(getCachedKey("index-expirable"), null);
    setCachedKey("index-expirable", key);
    Date.now = () => origNow() + 30 * 60 * 1000;
    purgeExpiredKeys();
    assertEquals(_keyCacheSizeForTests(), 0);
  } finally {
    Date.now = origNow;
    _resetKeyCacheForTests();
  }
});
