export type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue;
};

export type ObjectValue =
  | { type: "any"; value: JsonValue }
  | { type: "wildcard" }
  | { type: "stringwildcard"; value: string }
  | { type: "regex"; value: string }
  | { type: "and"; value: ObjectValue[] }
  | { type: "not"; value: ObjectValue };

export interface BodyFilter {
  objectPath: string;
  objectValue: ObjectValue[];
}

export interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: BodyFilter[];
}

export type Scope = string | ScopeEntry;

interface ParsedScope {
  methods: string[];
  pattern: string;
}

export function parseScope(scope: string): ParsedScope {
  const colonIdx = scope.indexOf(":");
  if (colonIdx === -1) {
    return { methods: ["*"], pattern: scope };
  }
  const methodPart = scope.slice(0, colonIdx);
  const pattern = scope.slice(colonIdx + 1);
  const methods = (methodPart.includes("|") ? methodPart.split("|") : [methodPart]).map((m) =>
    m.toUpperCase()
  );
  return { methods, pattern };
}

export function matchPath(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === path;

  const segments = pattern.split("*");
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (i === 0) {
      if (!path.startsWith(seg)) return false;
      cursor = seg.length;
      continue;
    }

    const remaining = path.slice(cursor);
    if (remaining.length === 0) return false;

    if (i === segments.length - 1 && seg === "") {
      return true;
    }

    const idx = remaining.indexOf(seg);
    if (idx < 1) return false;

    cursor += idx + seg.length;
  }

  if (segments[segments.length - 1] !== "") {
    return cursor === path.length;
  }

  return true;
}

function resolveObjectPath(body: unknown, dotPath: string): { found: boolean; value: unknown } {
  const keys = dotPath.split(".");
  let current: unknown = body;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return { found: false, value: undefined };
    }
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[key];
  }

  return { found: true, value: current };
}

function matchObjectValue(ov: ObjectValue, bodyValue: unknown): boolean {
  switch (ov.type) {
    case "any":
      return JSON.stringify(ov.value) === JSON.stringify(bodyValue);
    case "wildcard":
      return true;
    case "stringwildcard":
      return typeof bodyValue === "string" && matchPath(ov.value, bodyValue);
    case "regex":
      if (typeof bodyValue !== "string") return false;
      if (bodyValue.length > 1000) return false;
      try {
        return new RegExp(ov.value).test(bodyValue);
      } catch {
        return false;
      }
    case "and":
      return ov.value.every((sub) => matchObjectValue(sub, bodyValue));
    case "not":
      return !matchObjectValue(ov.value, bodyValue);
    default:
      return false;
  }
}

export function matchBodyFilter(filter: BodyFilter, body: unknown): boolean {
  const { found, value } = resolveObjectPath(body, filter.objectPath);
  if (!found) return false;
  return filter.objectValue.some((ov) => matchObjectValue(ov, value));
}

export function checkAccess(
  scopes: Scope[],
  method: string,
  path: string,
  body?: unknown,
): boolean {
  const upperMethod = method.toUpperCase();

  for (const scope of scopes) {
    if (typeof scope === "string") {
      const parsed = parseScope(scope);
      const methodMatch = parsed.methods.includes("*") || parsed.methods.includes(upperMethod);
      if (methodMatch && matchPath(parsed.pattern, path)) return true;
    } else {
      const methodMatch = scope.methods.some((m) => m === "*" || m.toUpperCase() === upperMethod);
      if (!methodMatch) continue;
      if (!matchPath(scope.pattern, path)) continue;

      if (!scope.bodyFilters || scope.bodyFilters.length === 0) {
        return true;
      }

      if (body === undefined) return false;

      if (scope.bodyFilters.every((f) => matchBodyFilter(f, body))) {
        return true;
      }
    }
  }

  return false;
}

// --- ADR-0009 §3 et §4 : forme unique d'autorisation ---
// Ce fichier est bundle cote navigateur : aucune API Deno ici.

export function splitPathAndQuery(rawPathWithQuery: string): [string, string] {
  const i = rawPathWithQuery.indexOf("?");
  if (i === -1) return [rawPathWithQuery, ""];
  return [rawPathWithQuery.slice(0, i), rawPathWithQuery.slice(i)];
}

// deno-lint-ignore no-control-regex
const CONTROL_OR_NUL = /[\x00-\x1F\x7F]/;

export function canonicalizePath(rawPath: string): string {
  let path = rawPath;
  // Decodage repete jusqu'au point fixe : %252f devient %2f puis /, sinon un double
  // encodage suffirait a echapper au controle. Trois tours suffisent en pratique.
  for (let i = 0; i < 3; i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      break;
    }
    if (decoded === path) break;
    path = decoded;
  }
  path = path.replace(/\\/g, "/");
  path = path.replace(/\/{2,}/g, "/");

  const segments = path.split("/");
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  let result = out.join("/");
  if (!result.startsWith("/")) result = "/" + result;
  return result.replace(/\/{2,}/g, "/");
}

export interface AccessVerdict {
  allowed: boolean;
  denialReason?: "method" | "path" | "path_encoded" | "body" | "query" | "invalid_path";
  // Toujours false tant que queryFilters n'est pas livre : l'outillage doit pouvoir dire
  // que la query passe sans contrainte plutot que d'affirmer un refus que le proxy n'applique pas.
  queryConstrained: boolean;
}

export function checkRequestAccess(
  scopes: Scope[],
  method: string,
  rawPathWithQuery: string,
  body?: unknown,
): AccessVerdict {
  const [rawPath] = splitPathAndQuery(rawPathWithQuery);
  const canonical = canonicalizePath(rawPath);

  if (CONTROL_OR_NUL.test(canonical)) {
    return { allowed: false, denialReason: "invalid_path", queryConstrained: false };
  }

  const rawAllowed = checkAccess(scopes, method, rawPath, body);
  if (!rawAllowed) {
    return { allowed: false, denialReason: "path", queryConstrained: false };
  }
  // Le controle porte sur toutes les formes plausibles, l'emission sur la forme brute :
  // ajouter une forme ne peut que reduire l'ensemble autorise (ADR-0009 §3).
  if (canonical !== rawPath && !checkAccess(scopes, method, canonical, body)) {
    return { allowed: false, denialReason: "path_encoded", queryConstrained: false };
  }
  return { allowed: true, queryConstrained: false };
}
