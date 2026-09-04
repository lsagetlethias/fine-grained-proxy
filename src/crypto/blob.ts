import { decodeBase64Url, encodeBase64Url } from "@std/encoding/base64url";
import { readBounded } from "./bounded.ts";

import type { Scope, ScopeEntry } from "../middleware/scopes.ts";
import { parseTargetUrl } from "../net/egress.ts";
import { checkRegexSource, regexIssueMessage } from "./regex-policy.ts";
import { fingerprint, getCachedKey, setCachedKey } from "./key-cache.ts";
import { type Auth, checkHeaderName, isValidAuthSpec } from "../auth/spec.ts";

const LEGACY_HEADER_PREFIX = "header:";

export interface BlobLogsConfig {
  enabled: boolean;
  detailed: boolean;
}

export interface BlobConfig {
  v: number;
  token?: string;
  target: string;
  auth: Auth;
  scopes: Scope[];
  ttl: number;
  createdAt: number;
  name?: string;
  logs?: BlobLogsConfig;
}

const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12;

export async function deriveKey(clientKey: string, serverSalt: string): Promise<CryptoKey> {
  const index = await fingerprint(clientKey, serverSalt);
  const cached = getCachedKey(index);
  if (cached) return cached;
  const derived = await deriveKeyUncached(clientKey, serverSalt);
  setCachedKey(index, derived);
  return derived;
}

async function deriveKeyUncached(clientKey: string, serverSalt: string): Promise<CryptoKey> {
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
  return new Uint8Array(await readBounded(stream));
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

// Un blob dont une regex sort du dialecte n'est pas un probleme de credentials : le
// signaler en 401 invalid_credentials enverrait son porteur verifier sa cle, ce qui est
// un diagnostic mensonger. Il lui faut un code propre (ADR-0010).
export class BlobPolicyError extends Error {
  readonly code = "unsupported_regex";
  constructor(message: string) {
    super(message);
    this.name = "BlobPolicyError";
  }
}

export const MAX_REGEX_VALUES_PER_BLOB = 4;
export const MAX_AND_WIDTH = 8;
export const MAX_OBJECT_VALUES_PER_BLOB = 256;

interface BlobBudget {
  regexes: number;
  total: number;
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean";
}

function isValidObjectValue(ov: unknown, budget: BlobBudget, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof ov !== "object" || ov === null) return false;
  const o = ov as Record<string, unknown>;
  if (typeof o.type !== "string") return false;

  budget.total++;
  if (budget.total > MAX_OBJECT_VALUES_PER_BLOB) return false;

  switch (o.type) {
    case "any":
      // La comparaison par JSON.stringify depend de l'ordre d'insertion des cles, qui
      // vient du serialiseur de l'appelant : sur un objet ce n'est pas un predicat de
      // permission, c'est un tirage (ADR-0010 D4).
      return "value" in o && isScalar(o.value);
    case "wildcard":
      return true;
    case "stringwildcard":
      return typeof o.value === "string";
    case "regex": {
      if (typeof o.value !== "string") return false;
      budget.regexes++;
      if (budget.regexes > MAX_REGEX_VALUES_PER_BLOB) return false;
      const issue = checkRegexSource(o.value);
      if (issue) throw new BlobPolicyError(regexIssueMessage(issue));
      return true;
    }
    case "and": {
      if (!Array.isArray(o.value)) return false;
      if (o.value.length < 2) return false;
      if (o.value.length > MAX_AND_WIDTH) return false;
      return o.value.every((sub: unknown) => isValidObjectValue(sub, budget, depth + 1));
    }
    case "not": {
      if (!isValidObjectValue(o.value, budget, depth + 1)) return false;
      const inner = o.value as Record<string, unknown>;
      if (inner.type === "wildcard") return false;
      if (inner.type === "not") return false;
      return true;
    }
    default:
      return false;
  }
}

function isValidBodyFilter(bf: unknown, budget: BlobBudget): boolean {
  if (typeof bf !== "object" || bf === null) return false;
  const f = bf as Record<string, unknown>;
  if (typeof f.objectPath !== "string" || f.objectPath.length === 0) return false;
  if (f.objectPath.split(".").length > 6) return false;
  if (!Array.isArray(f.objectValue) || f.objectValue.length === 0) return false;
  if (f.objectValue.length > 16) return false;
  return f.objectValue.every((ov: unknown) => isValidObjectValue(ov, budget));
}

function isValidScopeEntry(s: unknown, budget: BlobBudget): s is ScopeEntry {
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
    if (entry.bodyFilters.length > 8) return false;
    if (!entry.bodyFilters.every((bf: unknown) => isValidBodyFilter(bf, budget))) return false;
  }
  return true;
}

export interface DecryptedBlob {
  config: BlobConfig;
  derivedKey: CryptoKey;
}

export async function decryptBlob(
  blob: string,
  clientKey: string,
  serverSalt: string,
): Promise<BlobConfig> {
  return (await decryptBlobWithKey(blob, clientKey, serverSalt)).config;
}

// PBKDF2 coute 11,60 ms : la cle derivee ici redescend par le contexte au lieu d'etre
// recalculee vingt lignes plus loin pour chiffrer le body detailed (ADR-0010 D8).
export async function decryptBlobWithKey(
  blob: string,
  clientKey: string,
  serverSalt: string,
): Promise<DecryptedBlob> {
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
    (config.v !== 2 && config.v !== 3 && config.v !== 4) ||
    typeof config.target !== "string" || !config.target ||
    !Array.isArray(config.scopes) ||
    typeof config.ttl !== "number" ||
    typeof config.createdAt !== "number"
  ) {
    throw new Error("Invalid blob: malformed BlobConfig");
  }

  // Le salt etant public, un blob se forge hors ligne : la forme du target doit etre
  // verifiee ici et pas seulement a la generation (ADR-0009 §2, etape 1).
  if ("error" in parseTargetUrl(config.target)) {
    throw new Error("Invalid blob: malformed BlobConfig");
  }

  const auth: unknown = config.auth;
  let tokenRequired = true;
  if (typeof auth === "string") {
    if (auth.length === 0) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
    if (
      auth.startsWith(LEGACY_HEADER_PREFIX) &&
      checkHeaderName(auth.slice(LEGACY_HEADER_PREFIX.length)) !== null
    ) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
  } else {
    if (config.v !== 4 || !isValidAuthSpec(auth)) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
    tokenRequired = auth.type !== "headers";
  }

  if (tokenRequired) {
    if (typeof config.token !== "string" || config.token.length === 0) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
  } else {
    // Un secret orphelin ne casse pas un acces legitime, mais il ne doit jamais ressortir.
    delete config.token;
  }

  if (config.v === 2) {
    if (!config.scopes.every((s: unknown) => typeof s === "string")) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
  } else {
    // Budget global au blob, toutes portees et tous niveaux d'imbrication confondus :
    // un plafond par filtre laisserait la structure multiplicative intacte.
    const budget: BlobBudget = { regexes: 0, total: 0 };
    const structuredCount = config.scopes.filter((s: unknown) => typeof s !== "string").length;
    if (structuredCount > 10) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
    if (
      !config.scopes.every(
        (s: unknown) => typeof s === "string" || isValidScopeEntry(s, budget),
      )
    ) {
      throw new Error("Invalid blob: malformed BlobConfig");
    }
  }

  return { config, derivedKey: key };
}

export function isExpired(config: BlobConfig): boolean {
  if (config.ttl === 0) return false;
  return Date.now() / 1000 > config.createdAt + config.ttl;
}
