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
