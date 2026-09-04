import type { ObjectValue, Scope, ScopeEntry } from "./scopes.ts";
import {
  MAX_AND_WIDTH,
  MAX_OBJECT_VALUES_PER_BLOB,
  MAX_REGEX_VALUES_PER_BLOB,
} from "../crypto/blob.ts";
import { checkRegexSource, regexIssueMessage } from "../crypto/regex-policy.ts";

// Limites verifiees a la generation. Elles doublent celles appliquees au dechiffrement
// dans crypto/blob.ts : ici pour un message actionnable, la-bas pour refuser un blob crafte.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Le schema Zod de /api/generate type not.value et les elements de and.value en unknown :
// sans ces gardes, une valeur scalaire ou nulle fait throw ici et remonte en 500.
function validateObjectValue(ov: unknown, depth: number): string | null {
  if (!isRecord(ov)) return "Object value must be an object";
  if (depth > 4) return "Object value nesting exceeds maximum depth of 4";
  if (ov.type === "not") {
    if (!isRecord(ov.value)) return "not(...) requires an object condition";
    const inner = ov.value;
    if (inner.type === "wildcard") return "not(wildcard) is forbidden";
    if (inner.type === "not") return "not(not(...)) is forbidden";
    return validateObjectValue(inner, depth + 1);
  }
  if (ov.type === "and") {
    if (!Array.isArray(ov.value)) return "and(...) requires an array of conditions";
    const subs = ov.value;
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

interface Budget {
  regexes: number;
  total: number;
}

// Miroir des plafonds de crypto/blob.ts. Ici pour un message actionnable a la generation,
// la-bas pour refuser un blob crafte : le salt etant public, seul le second protege.
function validateObjectValueBudget(ov: ObjectValue, budget: Budget): string | null {
  budget.total++;
  if (budget.total > MAX_OBJECT_VALUES_PER_BLOB) {
    return `Maximum ${MAX_OBJECT_VALUES_PER_BLOB} object values allowed per blob`;
  }
  if (ov.type === "any") {
    const v = ov.value;
    const scalar = v === null || typeof v === "string" || typeof v === "number" ||
      typeof v === "boolean";
    if (!scalar) {
      return "An 'any' filter only accepts a string, number, boolean or null: comparing " +
        "objects depends on the caller's key order, which makes the result non deterministic";
    }
  }
  if (ov.type === "regex") {
    budget.regexes++;
    if (budget.regexes > MAX_REGEX_VALUES_PER_BLOB) {
      return `Maximum ${MAX_REGEX_VALUES_PER_BLOB} regex values allowed per blob`;
    }
    const issue = checkRegexSource(ov.value);
    if (issue) return regexIssueMessage(issue);
  }
  if (ov.type === "and") {
    if (ov.value.length > MAX_AND_WIDTH) {
      return `An 'and' filter accepts at most ${MAX_AND_WIDTH} conditions`;
    }
    for (const sub of ov.value) {
      const err = validateObjectValueBudget(sub, budget);
      if (err) return err;
    }
  }
  if (ov.type === "not") {
    return validateObjectValueBudget(ov.value, budget);
  }
  return null;
}

export function validateScopeLimits(scopes: Scope[]): string | null {
  const budget: Budget = { regexes: 0, total: 0 };
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
        const err = validateObjectValue(ov, 0);
        if (err) return err + " (field: " + bf.objectPath + ")";
        const budgetErr = validateObjectValueBudget(ov, budget);
        if (budgetErr) return budgetErr + " (field: " + bf.objectPath + ")";
      }
    }
  }
  return null;
}

// Un scope portant un « ? » est syntaxiquement mort : le pattern ne porte jamais la query,
// donc il ne peut rien contraindre. Refuse a la generation seulement : au dechiffrement il
// reste accepte et jamais matche, casser un blob vivant pour un pattern sans effet serait
// un cout sans gain (ADR-0009 §4).
export function validateScopePatterns(scopes: Scope[]): string | null {
  for (const scope of scopes) {
    const pattern = typeof scope === "string" ? scope : scope.pattern;
    if (pattern.includes("?")) {
      return "A scope pattern cannot carry a query string: " + pattern +
        ". Query parameters are not constrained by scopes, they are forwarded as sent.";
    }
  }
  return null;
}
