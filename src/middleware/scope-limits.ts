import type { Scope, ScopeEntry } from "./scopes.ts";

// Limites verifiees a la generation. Elles doublent celles appliquees au dechiffrement
// dans crypto/blob.ts : ici pour un message actionnable, la-bas pour refuser un blob crafte.
export function validateObjectValue(ov: Record<string, unknown>, depth: number): string | null {
  if (depth > 4) return "Object value nesting exceeds maximum depth of 4";
  if (ov.type === "not") {
    const inner = ov.value as Record<string, unknown>;
    if (inner.type === "wildcard") return "not(wildcard) is forbidden";
    if (inner.type === "not") return "not(not(...)) is forbidden";
    return validateObjectValue(inner, depth + 1);
  }
  if (ov.type === "and") {
    const subs = ov.value as Record<string, unknown>[];
    if (subs.length === 0) return "and() with empty conditions is forbidden";
    if (subs.length === 1) {
      return "and() with a single condition is forbidden, use the condition directly";
    }
    for (const sub of subs) {
      const err = validateObjectValue(sub, depth + 1);
      if (err) return err;
    }
  }
  return null;
}

export function validateScopeLimits(scopes: Scope[]): string | null {
  const structured = scopes.filter((s): s is ScopeEntry => typeof s !== "string");
  if (structured.length > 10) {
    return "Maximum 10 structured scopes allowed, got " + structured.length;
  }
  for (const entry of structured) {
    if (!entry.bodyFilters) continue;
    if (entry.bodyFilters.length > 8) {
      return "Maximum 8 body filters per scope, got " + entry.bodyFilters.length + " on " +
        entry.pattern;
    }
    for (const bf of entry.bodyFilters) {
      if (bf.objectPath.split(".").length > 6) {
        return "Dot-path '" + bf.objectPath + "' exceeds maximum of 6 segments";
      }
      if (bf.objectValue.length > 16) {
        return "Maximum 16 OR values per filter, got " + bf.objectValue.length + " on " +
          bf.objectPath;
      }
      for (const ov of bf.objectValue) {
        const err = validateObjectValue(ov as unknown as Record<string, unknown>, 0);
        if (err) return err + " (field: " + bf.objectPath + ")";
      }
    }
  }
  return null;
}
