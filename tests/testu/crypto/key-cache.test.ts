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
import { decryptBlob, deriveKey, encryptBlob } from "../../../src/crypto/blob.ts";

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

Deno.test("AC-50.5 (registre v5): le cache n'est jamais une dependance de correction", async () => {
  const clientKey = "cle-pour-la-correction-0123456789";
  const salt = "salt-correction";
  const blob = await encryptBlob(
    {
      v: 2,
      token: "tok",
      target: "https://api.example.com",
      auth: "bearer",
      scopes: ["GET:/v1/items"],
      ttl: 3600,
      createdAt: 1_700_000_000,
    },
    clientKey,
    salt,
  );

  // Cache vide, cache chaud, cache purge entre deux lectures : les trois rendent exactement
  // la meme configuration. Sur Deno Deploy le cache est par isolate et ephemere, un produit
  // dont la correction en dependrait serait faux une requete sur deux.
  _resetKeyCacheForTests();
  const froid = await decryptBlob(blob, clientKey, salt);

  // Un voisin dans la table avant la relecture : sans lui, un index de cache degenere
  // (constante, collision) rendrait quand meme la bonne cle et le test ne verrait rien.
  await deriveKey("cle-voisine-dans-la-table-0123456", salt);
  const chaud = await decryptBlob(blob, clientKey, salt);
  assertEquals(_keyCacheSizeForTests() > 1, true, "le cache doit porter les deux entrees");

  _resetKeyCacheForTests();
  const apresPurge = await decryptBlob(blob, clientKey, salt);

  assertEquals(chaud, froid);
  assertEquals(apresPurge, froid);
});

Deno.test("AC-50.6: le trafic legitime rate le cache une fois, le trafic a cles aleatoires a 100 %", async () => {
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
    const tours = 6;

    calls = 0;
    for (let i = 0; i < tours; i++) await deriveKey("cle-legitime-reutilisee-0123456789", SALT);
    assertEquals(calls, 1, "le trafic legitime ne doit deriver qu'une fois");

    // Le cache ne deplace pas le plafond de l'attaquant. Ce critere existe pour qu'on ne le
    // vende jamais comme une limitation de debit.
    calls = 0;
    for (let i = 0; i < tours; i++) {
      await deriveKey(`cle-aleatoire-${String(i).padStart(20, "0")}`, SALT);
    }
    assertEquals(calls, tours, "des cles toutes differentes doivent rater le cache a 100 %");
  } finally {
    // deno-lint-ignore no-explicit-any
    (crypto.subtle as any).deriveKey = original;
    _resetKeyCacheForTests();
  }
});

Deno.test("AC-50.11: le nombre d'iterations PBKDF2 vaut toujours 100 000", async () => {
  _resetKeyCacheForTests();
  const original = crypto.subtle.deriveKey.bind(crypto.subtle);
  const parametres: { name?: string; iterations?: number; hash?: string }[] = [];
  // deno-lint-ignore no-explicit-any
  (crypto.subtle as any).deriveKey = (...args: unknown[]) => {
    parametres.push(args[0] as { name?: string; iterations?: number; hash?: string });
    // deno-lint-ignore no-explicit-any
    return (original as any)(...args);
  };
  try {
    await deriveKey("cle-pour-lire-les-parametres-0123", SALT);
    assertEquals(parametres.length, 1, "aucune derivation observee, le test ne verifie rien");
    // Le parametre n'est pas porte par le blob : le baisser invalide tous les blobs en
    // circulation, et l'argument « la cle est a haute entropie » ne tient plus depuis le
    // BYOK, qui accepte des cles de 24 caracteres.
    assertEquals(parametres[0].name, "PBKDF2");
    assertEquals(parametres[0].iterations, 100_000);
    assertEquals(parametres[0].hash, "SHA-256");
  } finally {
    // deno-lint-ignore no-explicit-any
    (crypto.subtle as any).deriveKey = original;
    _resetKeyCacheForTests();
  }
});
