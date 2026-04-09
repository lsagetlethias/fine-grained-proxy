import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url";

import type { Scope, ScopeEntry } from "../middleware/scopes.ts";

export interface BlobConfig {
  v: number;
  token: string;
  target: string;
  auth: string;
  scopes: Scope[];
  ttl: number;
  createdAt: number;
}

const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12;

export async function deriveKey(clientKey: string, serverSalt: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(clientKey + serverSalt),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(serverSalt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function compress(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encryptBlob(
  config: BlobConfig,
  clientKey: string,
  serverSalt: string,
): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(config));
  const compressed = await compress(json);
  const key = await deriveKey(clientKey, serverSalt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, compressed),
  );

  const result = new Uint8Array(IV_LENGTH + encrypted.length);
  result.set(iv, 0);
  result.set(encrypted, IV_LENGTH);

  return encodeBase64Url(result);
}

function isValidObjectValue(ov: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (typeof ov !== "object" || ov === null) return false;
  const o = ov as Record<string, unknown>;
  if (typeof o.type !== "string") return false;
  switch (o.type) {
    case "any":
      return "value" in o;
    case "wildcard":
      return true;
    case "stringwildcard":
      return typeof o.value === "string";
    case "and":
      return Array.isArray(o.value) &&
        o.value.every((sub: unknown) => isValidObjectValue(sub, depth + 1));
    default:
      return false;
  }
}

function isValidBodyFilter(bf: unknown): boolean {
  if (typeof bf !== "object" || bf === null) return false;
  const f = bf as Record<string, unknown>;
  if (typeof f.objectPath !== "string" || f.objectPath.length === 0) return false;
  if (!Array.isArray(f.objectValue) || f.objectValue.length === 0) return false;
  return f.objectValue.every((ov: unknown) => isValidObjectValue(ov));
}

function isValidScopeEntry(s: unknown): s is ScopeEntry {
  if (typeof s !== "object" || s === null) return false;
  const entry = s as Record<string, unknown>;
  if (
    !Array.isArray(entry.methods) || !entry.methods.every((m: unknown) => typeof m === "string")
  ) {
    return false;
  }
  if (typeof entry.pattern !== "string") return false;
  if (entry.bodyFilters !== undefined) {
    if (!Array.isArray(entry.bodyFilters)) return false;
    if (!entry.bodyFilters.every((bf: unknown) => isValidBodyFilter(bf))) return false;
  }
  return true;
}

export async function decryptBlob(
  blob: string,
  clientKey: string,
  serverSalt: string,
): Promise<BlobConfig> {
  let raw: Uint8Array;
  try {
    raw = decodeBase64Url(blob);
  } catch {
    throw new Error("Invalid blob: base64url decode failed");
  }

  if (raw.length <= IV_LENGTH) {
    throw new Error("Invalid blob: too short");
  }

  const iv = raw.slice(0, IV_LENGTH);
  const ciphertext = raw.slice(IV_LENGTH);
  const key = await deriveKey(clientKey, serverSalt);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("Decryption failed: invalid key or corrupted blob");
  }

  let decompressed: Uint8Array;
  try {
    decompressed = await decompress(new Uint8Array(decrypted));
  } catch {
    throw new Error("Decompression failed: corrupted data");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decompressed));
  } catch {
    throw new Error("Invalid blob: JSON parse failed");
  }

  const config = parsed as BlobConfig;
  if (
    typeof config.v !== "number" ||
    (config.v !== 2 && config.v !== 3) ||
    typeof config.token !== "string" || config.token.length === 0 ||
    typeof config.target !== "string" || !config.target ||
    typeof config.auth !== "string" || !config.auth ||
    !Array.isArray(config.scopes) ||
    typeof config.ttl !== "number" ||
    typeof config.createdAt !== "number"
  ) {
    throw new Error("Invalid blob: malformed BlobConfig");
  }

  if (config.v === 2) {
    if (!config.scopes.every((s: unknown) => typeof s === "string")) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
  } else {
    if (
      !config.scopes.every(
        (s: unknown) => typeof s === "string" || isValidScopeEntry(s),
      )
    ) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
  }

  return config;
}

export function isExpired(config: BlobConfig): boolean {
  if (config.ttl === 0) return false;
  return Date.now() / 1000 > config.createdAt + config.ttl;
}
