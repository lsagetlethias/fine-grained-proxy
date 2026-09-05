import {
  MAX_QUERY_FILTERS_PER_SCOPE,
  MAX_QUERY_VALUES_PER_FILTER,
  type ObjectValue,
  type Scope,
  type ScopeEntry,
} from "./scopes.ts";
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
// sans ces gardes, une valeur scalaire ou nulle fait throw ici et remonte en 500. Il ne
// contraint pas non plus le discriminant en profondeur, alors que crypto/blob.ts le refuse
// au dechiffrement : sans la meme fermeture ici, un « type » inconnu imbrique traverse la
// generation, est chiffre, et n'echoue qu'a l'usage. L'auteur repart avec un blob mort sans
// que rien ne le lui ait dit. La fermeture appartient a la generation, jamais au
// dechiffrement, qui est le seul rempart contre un blob forge (le salt est public).
function validateObjectValue(ov: unknown, depth: number): string | null {
  if (!isRecord(ov)) return "Object value must be an object";
  if (depth > 4) return "Object value nesting exceeds maximum depth of 4";
  switch (ov.type) {
    case "any":
      if (!("value" in ov)) return "An 'any' filter requires a value";
      return null;
    case "wildcard":
      return null;
    case "stringwildcard":
    case "regex":
      if (typeof ov.value !== "string") {
        return `A '${ov.type}' filter requires a string value`;
      }
      return null;
    case "not": {
      if (!isRecord(ov.value)) return "not(...) requires an object condition";
      const inner = ov.value;
      if (inner.type === "wildcard") return "not(wildcard) is forbidden";
      if (inner.type === "not") return "not(not(...)) is forbidden";
      return validateObjectValue(inner, depth + 1);
    }
    case "and": {
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
      return null;
    }
    default:
      return "Unknown object value type, expected one of: any, wildcard, stringwildcard, " +
        "regex, and, not";
  }
}

interface Budget {
  regexes: number;
  total: number;
}

// Renseigne quand la valeur appartient a un query filter. La restriction du type « any » aux
// chaines ne vaut que sur cet axe, et elle doit descendre a toute profondeur d'un « and » ou
// d'un « not » : sous « not », un « any » non-string ne produit pas un filtre mort mais un
// filtre permissif, l'auteur ecrit « exclure la page 1 » et obtient « accepter tout » (§19.3).
interface QueryScope {
  param: string;
}

function validateObjectValueBudget(
  ov: ObjectValue,
  budget: Budget,
  queryScope: QueryScope | null,
): string | null {
  budget.total++;
  if (budget.total > MAX_OBJECT_VALUES_PER_BLOB) {
    return `Maximum ${MAX_OBJECT_VALUES_PER_BLOB} object values allowed per blob`;
  }
  if (ov.type === "any") {
    const v = ov.value;
    if (queryScope) {
      if (typeof v !== "string") {
        return `Type "any" on a query filter only accepts a string value (param: '${queryScope.param}')`;
      }
    } else {
      const scalar = v === null || typeof v === "string" || typeof v === "number" ||
        typeof v === "boolean";
      if (!scalar) {
        return "An 'any' filter only accepts a string, number, boolean or null: comparing " +
          "objects depends on the caller's key order, which makes the result non deterministic";
      }
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
      const err = validateObjectValueBudget(sub, budget, queryScope);
      if (err) return err;
    }
  }
  if (ov.type === "not") {
    return validateObjectValueBudget(ov.value, budget, queryScope);
  }
  return null;
}

function validateBodyFilters(entry: ScopeEntry, budget: Budget): string | null {
  const filters = entry.bodyFilters;
  if (!filters) return null;
  if (filters.length > 8) {
    return "Maximum 8 body filters per scope, got " + filters.length + " on " + entry.pattern;
  }
  for (const bf of filters) {
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
      const budgetErr = validateObjectValueBudget(ov, budget, null);
      if (budgetErr) return budgetErr + " (field: " + bf.objectPath + ")";
    }
  }
  return null;
}

function validateQueryFilters(entry: ScopeEntry, budget: Budget): string | null {
  const filters = entry.queryFilters;
  if (!filters) return null;
  if (filters.length > MAX_QUERY_FILTERS_PER_SCOPE) {
    return `Maximum ${MAX_QUERY_FILTERS_PER_SCOPE} query filters per scope, got ${filters.length}`;
  }

  const seen = new Set<string>();
  for (const qf of filters) {
    if (typeof qf.param !== "string" || qf.param.trim().length === 0) {
      return "A query filter requires a non-empty param name";
    }
    if (seen.has(qf.param)) {
      return `Duplicate query filter for param '${qf.param}'`;
    }
    seen.add(qf.param);
    if (!Array.isArray(qf.values) || qf.values.length === 0) {
      return `A query filter requires at least one value (param: '${qf.param}')`;
    }
    if (qf.values.length > MAX_QUERY_VALUES_PER_FILTER) {
      return `Maximum ${MAX_QUERY_VALUES_PER_FILTER} OR values per query filter, got ` +
        `${qf.values.length} on param '${qf.param}'`;
    }
    const queryScope: QueryScope = { param: qf.param };
    for (const ov of qf.values) {
      const err = validateObjectValue(ov, 0);
      if (err) return err + " (param: '" + qf.param + "')";
      const budgetErr = validateObjectValueBudget(ov, budget, queryScope);
      if (budgetErr) return budgetErr;
    }
  }
  return null;
}

export function validateScopeLimits(scopes: Scope[]): string | null {
  const budget: Budget = { regexes: 0, total: 0 };
  const structured = scopes.filter((s): s is ScopeEntry => typeof s !== "string");
  if (structured.length > 10) {
    return "Maximum 10 structured scopes allowed, got " + structured.length;
  }
  // Aucun filtre d'aucune sorte ne saute la validation : un ScopeEntry GET qui ne porte que
  // des queryFilters est le cas le plus courant de la v5, sortir de la boucle sur l'absence
  // de bodyFilters le laissait passer sans le moindre controle (§19.5).
  for (const entry of structured) {
    const bodyError = validateBodyFilters(entry, budget);
    if (bodyError) return bodyError;
    const queryError = validateQueryFilters(entry, budget);
    if (queryError) return queryError;
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
        ". Use the queryFilters field on this scope to constrain query parameters, " +
        "not the pattern.";
    }
  }
  return null;
}
