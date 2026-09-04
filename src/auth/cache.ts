const CACHE_TTL_MS = 55 * 60 * 1000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export interface TokenCache {
  get(key: string): string | null;
  set(key: string, value: string): void;
  getInflight(key: string): Promise<string> | undefined;
  setInflight(key: string, promise: Promise<string>): void;
  deleteInflight(key: string): void;
  clearExpired(): void;
  reset(): void;
}

export function createTokenCache(ttlMs: number = CACHE_TTL_MS): TokenCache {
  const store = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<string>>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    getInflight(key) {
      return inflight.get(key);
    },
    setInflight(key, promise) {
      inflight.set(key, promise);
    },
    deleteInflight(key) {
      inflight.delete(key);
    },
    clearExpired() {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.expiresAt < now) {
          store.delete(key);
        }
      }
    },
    reset() {
      store.clear();
      inflight.clear();
    },
  };
}

// Separateur impossible dans un token, un nom d'app ou un identifiant d'addon : deux
// decoupages differents ne peuvent pas produire la meme cle de cache.
const KEY_PART_SEPARATOR = "\u0000";

export async function hashToken(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join(KEY_PART_SEPARATOR));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const bearerCache = createTokenCache();
export const addonTokenCache = createTokenCache();

export function cachedSingleflight(
  cache: TokenCache,
  key: string,
  produce: () => Promise<string>,
): Promise<string> {
  cache.clearExpired();

  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = cache.getInflight(key);
  if (pending) return pending;

  const promise = produce().then((value) => {
    cache.set(key, value);
    cache.deleteInflight(key);
    return value;
  }).catch((err) => {
    cache.deleteInflight(key);
    throw err;
  });

  cache.setInflight(key, promise);
  return promise;
}

export function _resetStoreForTests(): void {
  bearerCache.reset();
  addonTokenCache.reset();
}
