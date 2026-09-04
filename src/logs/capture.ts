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

export const MAX_QUERY_PARAM_NAMES = 32;
export const MAX_QUERY_PARAM_NAME_LENGTH = 64;

export interface QueryParamNames {
  names: string[];
  truncated: boolean;
}

// Les noms suffisent au diagnostic le plus courant (« per_page apparait, mon SDK de
// pagination l'a ajoute ») et ne fuitent aucun secret. Les valeurs, elles, contiennent
// regulierement des identifiants : les ecrire ici en ferait un vecteur de fuite a part
// entiere sur une surface que rien ne chiffre (§14.6, §19.8).
export function extractQueryParamNames(search: string): QueryParamNames | null {
  if (search.length === 0 || search === "?") return null;

  const names: string[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const [rawName] of new URLSearchParams(search)) {
    let name = rawName;
    if (name.length > MAX_QUERY_PARAM_NAME_LENGTH) {
      name = name.slice(0, MAX_QUERY_PARAM_NAME_LENGTH);
      truncated = true;
    }
    if (seen.has(name)) continue;
    if (names.length >= MAX_QUERY_PARAM_NAMES) {
      truncated = true;
      break;
    }
    seen.add(name);
    names.push(name);
  }

  if (names.length === 0) return null;
  return { names, truncated };
}

export interface NetworkContext {
  blobId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ipPrefix: string;
  ts: number;
  queryParamNames: QueryParamNames | null;
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
  if (ctx.queryParamNames) {
    entry.queryParamNames = ctx.queryParamNames.names;
    if (ctx.queryParamNames.truncated) entry.queryParamNamesTruncated = true;
  }
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
