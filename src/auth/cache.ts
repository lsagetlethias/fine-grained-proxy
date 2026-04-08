const CACHE_TTL_MS = 55 * 60 * 1000;

interface CacheEntry {
  bearer: string;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getCachedBearer(tokenHash: string): string | null {
  const entry = store.get(tokenHash);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(tokenHash);
    return null;
  }
  return entry.bearer;
}

export function setCachedBearer(tokenHash: string, bearer: string): void {
  store.set(tokenHash, {
    bearer,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function getInflight(tokenHash: string): Promise<string> | undefined {
  return inflight.get(tokenHash);
}

export function setInflight(tokenHash: string, promise: Promise<string>): void {
  inflight.set(tokenHash, promise);
}

export function deleteInflight(tokenHash: string): void {
  inflight.delete(tokenHash);
}

export function clearExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) {
      store.delete(key);
    }
  }
}

export function _resetStoreForTests(): void {
  store.clear();
  inflight.clear();
}
