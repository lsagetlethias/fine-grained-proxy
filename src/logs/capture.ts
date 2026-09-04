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
  repeats: [string, number][];
  truncated: boolean;
}

// Les noms suffisent au diagnostic le plus courant (« per_page apparait, mon SDK de
// pagination l'a ajoute ») et ne fuitent aucun secret. Les valeurs, elles, contiennent
// regulierement des identifiants : les ecrire ici en ferait un vecteur de fuite a part
// entiere sur une surface que rien ne chiffre (§14.6, §19.8).
export function extractQueryParamNames(search: string): QueryParamNames | null {
  if (search.length === 0 || search === "?") return null;

  const names: string[] = [];
  const counts = new Map<string, number>();
  let truncated = false;

  for (const [rawName] of new URLSearchParams(search)) {
    let name = rawName;
    if (name.length > MAX_QUERY_PARAM_NAME_LENGTH) {
      name = name.slice(0, MAX_QUERY_PARAM_NAME_LENGTH);
      truncated = true;
    }
    const known = counts.get(name);
    if (known !== undefined) {
      counts.set(name, known + 1);
      continue;
    }
    // Au-dela du plafond on cesse de retenir de nouveaux noms, mais on continue de parcourir :
    // sortir de la boucle sous-compterait les occurrences d'un nom deja retenu qui reapparait
    // plus loin dans la query, et c'est justement ce compte qui porte le diagnostic.
    if (names.length >= MAX_QUERY_PARAM_NAMES) {
      truncated = true;
      continue;
    }
    counts.set(name, 1);
    names.push(name);
  }

  if (names.length === 0) return null;

  // Seuls les parametres repetes sont listes : un nom absent d'ici est apparu exactement une
  // fois. Le cas courant ne coute donc aucun octet dans le ring buffer.
  const repeats: [string, number][] = [];
  for (const name of names) {
    const count = counts.get(name) ?? 1;
    if (count > 1) repeats.push([name, count]);
  }

  return { names, repeats, truncated };
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
    if (ctx.queryParamNames.repeats.length > 0) {
      entry.queryParamRepeats = ctx.queryParamNames.repeats;
    }
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
