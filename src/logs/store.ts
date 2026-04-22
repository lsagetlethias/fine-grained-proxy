import { readLogsConfig } from "./config.ts";
import type { LogEntry, NetworkEntry } from "./events.ts";

interface BlobSlot {
  networkBuffer: LogEntry[];
  detailedBuffer: LogEntry[];
  topic: EventTarget;
  streamCount: number;
  lastActivity: number;
}

const store = new Map<string, BlobSlot>();

const ENTRY_EVENT = "entry";

function getOrCreateSlot(blobId: string): BlobSlot {
  let slot = store.get(blobId);
  if (!slot) {
    slot = {
      networkBuffer: [],
      detailedBuffer: [],
      topic: new EventTarget(),
      streamCount: 0,
      lastActivity: Date.now(),
    };
    store.set(blobId, slot);
  }
  return slot;
}

export function append(blobId: string, entry: LogEntry): void {
  const cfg = readLogsConfig();
  const slot = getOrCreateSlot(blobId);
  const buffer = entry.type === "network" ? slot.networkBuffer : slot.detailedBuffer;
  const cap = entry.type === "network" ? cfg.bufferNetwork : cfg.bufferDetailed;

  buffer.push(entry);
  while (buffer.length > cap) buffer.shift();

  slot.lastActivity = Date.now();
  slot.topic.dispatchEvent(new CustomEvent(ENTRY_EVENT, { detail: entry }));
}

export function subscribe(
  blobId: string,
  onEntry: (entry: LogEntry) => void,
): () => void {
  const slot = getOrCreateSlot(blobId);
  slot.streamCount++;

  const listener = (e: Event) => {
    const ce = e as CustomEvent<LogEntry>;
    onEntry(ce.detail);
  };
  slot.topic.addEventListener(ENTRY_EVENT, listener);

  return () => {
    slot.topic.removeEventListener(ENTRY_EVENT, listener);
    slot.streamCount = Math.max(0, slot.streamCount - 1);
  };
}

export function getStreamCount(blobId: string): number {
  return store.get(blobId)?.streamCount ?? 0;
}

export function flushSince(blobId: string, since?: number): LogEntry[] {
  const slot = store.get(blobId);
  if (!slot) return [];
  const all = [...slot.networkBuffer, ...slot.detailedBuffer];
  const filtered = since !== undefined ? all.filter((e) => e.ts > since) : all;
  return filtered.sort((a, b) => a.ts - b.ts);
}

export function purge(now: number = Date.now()): number {
  const cfg = readLogsConfig();
  const maxIdleMs = cfg.inactivityMin * 60_000;
  let removed = 0;
  for (const [blobId, slot] of store.entries()) {
    if (slot.streamCount > 0) continue;
    if (now - slot.lastActivity > maxIdleMs) {
      store.delete(blobId);
      removed++;
    }
  }
  return removed;
}

export function _resetStoreForTests(): void {
  store.clear();
}

export function _sizeForTests(): number {
  return store.size;
}

export function _hasBlobForTests(blobId: string): boolean {
  return store.has(blobId);
}

export function _getNetworkBufferForTests(blobId: string): NetworkEntry[] {
  const slot = store.get(blobId);
  if (!slot) return [];
  return slot.networkBuffer.filter((e): e is NetworkEntry => e.type === "network");
}

export function _getDetailedBufferForTests(blobId: string): LogEntry[] {
  return store.get(blobId)?.detailedBuffer ?? [];
}

export function _setLastActivityForTests(blobId: string, ts: number): void {
  const slot = store.get(blobId);
  if (slot) slot.lastActivity = ts;
}
