import { encodeBase64Url } from "@std/encoding/base64url";

import { readLogsConfig } from "./config.ts";
import type { DetailedEntry, NetworkEntry } from "./events.ts";
import { append } from "./store.ts";

const IV_LENGTH = 12;

async function gzip(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface NetworkContext {
  blobId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ipPrefix: string;
  ts: number;
}

export function captureNetwork(ctx: NetworkContext): void {
  const entry: NetworkEntry = {
    type: "network",
    ts: ctx.ts,
    method: ctx.method,
    path: ctx.path,
    status: ctx.status,
    durationMs: ctx.durationMs,
    ipPrefix: ctx.ipPrefix,
  };
  append(ctx.blobId, entry);
}

export interface DetailedContext {
  blobId: string;
  method: string;
  path: string;
  bodyRaw: Uint8Array;
  derivedKey: CryptoKey;
  ts: number;
}

export async function captureDetailed(ctx: DetailedContext): Promise<void> {
  const cfg = readLogsConfig();
  const maxBytes = cfg.detailedMaxKb * 1024;

  const compressed = await gzip(ctx.bodyRaw);

  let entry: DetailedEntry;
  if (compressed.length > maxBytes) {
    entry = {
      type: "detailed",
      ts: ctx.ts,
      method: ctx.method,
      path: ctx.path,
      truncated: true,
    };
  } else {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, ctx.derivedKey, compressed),
    );
    const combined = new Uint8Array(IV_LENGTH + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, IV_LENGTH);

    entry = {
      type: "detailed",
      ts: ctx.ts,
      method: ctx.method,
      path: ctx.path,
      truncated: false,
      bodyEncrypted: encodeBase64Url(combined),
    };
  }

  append(ctx.blobId, entry);
}
