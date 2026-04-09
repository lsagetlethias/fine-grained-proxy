import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url";

export interface BlobConfig {
  v: number;
  token: string;
  target: string;
  auth: string;
  scopes: string[];
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
    config.v !== 2 ||
    typeof config.token !== "string" || config.token.length === 0 ||
    typeof config.target !== "string" || !config.target ||
    typeof config.auth !== "string" || !config.auth ||
    !Array.isArray(config.scopes) ||
    !config.scopes.every((s: unknown) => typeof s === "string") ||
    typeof config.ttl !== "number" ||
    typeof config.createdAt !== "number"
  ) {
    throw new Error("Invalid blob: malformed BlobConfig");
  }

  return config;
}

export function isExpired(config: BlobConfig): boolean {
  if (config.ttl === 0) return false;
  return Date.now() / 1000 > config.createdAt + config.ttl;
}
