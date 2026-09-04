export interface AuthHeaderEntry {
  name: string;
  value: string;
}

export type AuthHeadersSpec = { type: "headers"; headers: AuthHeaderEntry[] };
export type ScalingoAddonSpec = {
  type: "scalingo-addon";
  app: string;
  addonId: string;
  apiUrl?: string;
};

export type AuthSpec = AuthHeadersSpec | ScalingoAddonSpec;

export type Auth = string | AuthSpec;

export const MAX_AUTH_HEADERS = 8;
export const MAX_HEADER_NAME_LENGTH = 64;
export const MAX_HEADER_VALUE_LENGTH = 1024;
export const MAX_ADDON_FIELD_LENGTH = 64;

// Token RFC 7230 : seule definition qui garantit qu'aucun runtime ne rejette le nom au forward.
const HEADER_NAME_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

// Headers qui gouvernent le transport ou l'identification FGP : les laisser surcharger
// permettrait de detourner le routage ou de neutraliser l'auth posee par le blob.
const FORBIDDEN_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-authorization",
  "x-fgp-key",
  "x-fgp-blob",
  "x-fgp-source",
]);

export function isAuthSpec(auth: Auth): auth is AuthSpec {
  return typeof auth !== "string";
}

export function isHeadersSpec(auth: Auth): auth is AuthHeadersSpec {
  return isAuthSpec(auth) && auth.type === "headers";
}

export function isScalingoAddonSpec(auth: Auth): auth is ScalingoAddonSpec {
  return isAuthSpec(auth) && auth.type === "scalingo-addon";
}

export type HeaderNameIssue = "empty" | "too-long" | "invalid" | "reserved";

export function checkHeaderName(name: string): HeaderNameIssue | null {
  if (name.length === 0) return "empty";
  if (name.length > MAX_HEADER_NAME_LENGTH) return "too-long";
  if (!HEADER_NAME_TOKEN.test(name)) return "invalid";
  if (FORBIDDEN_HEADER_NAMES.has(name.toLowerCase())) return "reserved";
  return null;
}

export function validateHeaderName(name: string): string | null {
  switch (checkHeaderName(name)) {
    case "empty":
      return "Header name is required";
    case "too-long":
      return `Header name exceeds ${MAX_HEADER_NAME_LENGTH} characters`;
    case "invalid":
      return `Invalid header name: ${name}`;
    case "reserved":
      return `Header ${name} cannot be overridden`;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function validateAuthSpecShape(spec: unknown): string | null {
  if (!isRecord(spec)) return "Auth spec must be an object";

  if (spec.type === "headers") {
    const headers = spec.headers;
    if (!Array.isArray(headers) || headers.length === 0) {
      return "Auth spec headers must be a non-empty array";
    }
    const seen = new Set<string>();
    for (const entry of headers) {
      if (!isRecord(entry)) return "Each auth header must be an object";
      if (!isNonEmptyString(entry.name)) return "Header name is required";
      if (!isNonEmptyString(entry.value)) return `Header ${entry.name} has an empty value`;
      const nameError = validateHeaderName(entry.name);
      if (nameError) return nameError;
      // Un CR, un LF ou un caractere de controle fait throw Headers.set() au forward :
      // sans ce garde, un blob crafte declenche un 500 a la place d'un rejet propre.
      if (CONTROL_CHARS.test(entry.value)) {
        return `Header ${entry.name} value cannot contain control characters`;
      }
      const key = entry.name.toLowerCase();
      if (seen.has(key)) return `Duplicate header name: ${entry.name}`;
      seen.add(key);
    }
    return null;
  }

  if (spec.type === "scalingo-addon") {
    if (!isNonEmptyString(spec.app)) return "Addon app is required";
    if (!isNonEmptyString(spec.addonId)) return "Addon id is required";
    if (spec.apiUrl !== undefined) {
      if (!isNonEmptyString(spec.apiUrl)) return "Addon apiUrl must be a non-empty string";
      if (!spec.apiUrl.startsWith("https://")) return "Addon apiUrl must be an absolute https URL";
    }
    return null;
  }

  return `Unsupported auth spec type: ${String(spec.type)}`;
}

export function validateAuthSpecLimits(spec: AuthSpec): string | null {
  if (spec.type === "headers") {
    if (spec.headers.length > MAX_AUTH_HEADERS) {
      return `Maximum ${MAX_AUTH_HEADERS} auth headers allowed, got ${spec.headers.length}`;
    }
    for (const entry of spec.headers) {
      if (entry.name.length > MAX_HEADER_NAME_LENGTH) {
        return `Header name '${entry.name}' exceeds ${MAX_HEADER_NAME_LENGTH} characters`;
      }
      if (entry.value.length > MAX_HEADER_VALUE_LENGTH) {
        return `Value of header '${entry.name}' exceeds ${MAX_HEADER_VALUE_LENGTH} characters`;
      }
    }
    return null;
  }

  if (spec.app.length > MAX_ADDON_FIELD_LENGTH) {
    return `Addon app '${spec.app}' exceeds ${MAX_ADDON_FIELD_LENGTH} characters`;
  }
  if (spec.addonId.length > MAX_ADDON_FIELD_LENGTH) {
    return `Addon id exceeds ${MAX_ADDON_FIELD_LENGTH} characters`;
  }
  return null;
}

export function isValidAuthSpec(spec: unknown): spec is AuthSpec {
  if (validateAuthSpecShape(spec) !== null) return false;
  return validateAuthSpecLimits(spec as AuthSpec) === null;
}
