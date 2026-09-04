// Cache LRU de derivation PBKDF2 (ADR-0010 D8).
//
// Ce que ce cache fait et ne fait pas, sans arrondi : le trafic legitime reutilise une
// cle, il passe de 11,60 ms a environ 0,01 ms par requete. Le trafic d'attaque utilise
// des cles aleatoires, il rate le cache a 100 % et SON COUT NE BOUGE PAS. Le cache
// n'abaisse pas le plafond de l'attaquant, il rend le trafic legitime quasi gratuit,
// donc il augmente la charge utile qu'une instance sous attaque peut encore absorber.
//
// Canal auxiliaire : un hit est mesurablement plus rapide qu'un miss, ce qui constitue
// un oracle indiquant si une cle a ete vue recemment par cet isolate. Severite faible,
// l'oracle revele une recence et pas une valeur, mais c'est la raison du TTL court.

export const KEY_CACHE_CAPACITY = 512;
export const KEY_CACHE_TTL_MS = 10 * 60 * 1000;

interface Entry {
  key: CryptoKey;
  expiresAt: number;
}

const store = new Map<string, Entry>();

// La table ne contient jamais la cle client : une empreinte salee en index, une CryptoKey
// non extractible en valeur. Le separateur ne peut apparaitre dans aucune des deux parts.
const INDEX_SEPARATOR = "\u0000";

export async function fingerprint(clientKey: string, serverSalt: string): Promise<string> {
  const material = new TextEncoder().encode(clientKey + INDEX_SEPARATOR + serverSalt);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getCachedKey(index: string): CryptoKey | null {
  const entry = store.get(index);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(index);
    return null;
  }
  // Reinsertion : la Map conserve l'ordre d'insertion, c'est ce qui fait le LRU.
  store.delete(index);
  store.set(index, entry);
  return entry.key;
}

export function setCachedKey(index: string, key: CryptoKey): void {
  store.delete(index);
  store.set(index, { key, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
  // Borne dure : le cache convertit une pression CPU en pression memoire.
  while (store.size > KEY_CACHE_CAPACITY) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function purgeExpiredKeys(): void {
  const now = Date.now();
  for (const [index, entry] of store) {
    if (entry.expiresAt < now) store.delete(index);
  }
}

export function _keyCacheSizeForTests(): number {
  return store.size;
}

export function _resetKeyCacheForTests(): void {
  store.clear();
}
