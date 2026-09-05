import type { FilterData, ParsedScope, QueryFilterData, ScopeFiltersData } from "./types.ts";

const ELIGIBLE_METHODS = ["POST", "PUT", "PATCH", "*"];

export function parseScope(line: string): ParsedScope | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(":");
  if (idx === -1) return null;
  return {
    method: trimmed.substring(0, idx),
    path: trimmed.substring(idx + 1),
    raw: trimmed,
  };
}

export function isEligible(parsed: ParsedScope | null): boolean {
  if (!parsed) return false;
  const methods = parsed.method.includes("|") ? parsed.method.split("|") : [parsed.method];
  for (let i = 0; i < methods.length; i++) {
    if (ELIGIBLE_METHODS.indexOf(methods[i].toUpperCase()) !== -1) return true;
  }
  return false;
}

export function getEligibleScopes(scopesText: string): string[] {
  const lines = scopesText.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const p = parseScope(lines[i]);
    if (isEligible(p)) result.push(p!.raw);
  }
  return result;
}

// Toute methode porte une query, GET compris, et c'est meme le cas d'usage principal de la
// v5 : le panneau liste donc tous les scopes, pas seulement ceux qui peuvent porter un corps.
export function getAllScopes(scopesText: string): string[] {
  const lines = scopesText.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const p = parseScope(lines[i]);
    if (p) result.push(p.raw);
  }
  return result;
}

// buildScopes emet un scope pour toute cle des deux maps de filtres, sans jamais consulter le
// textarea : une cle laissee derriere par une ligne supprimee ou par une app decochee accorde
// donc encore l'acces dans le blob, alors que son auteur ne la voit plus nulle part. La purge
// vaut pour les DEUX maps et pour tous les chemins d'edition, c'est la declaration qui fait foi.
export function pruneOrphanScopeFilters(declared: string[], data: ScopeFiltersData): void {
  for (const key of Object.keys(data.bodyFiltersData)) {
    if (declared.indexOf(key) === -1) delete data.bodyFiltersData[key];
  }
  for (const key of Object.keys(data.queryFiltersData)) {
    if (declared.indexOf(key) === -1) delete data.queryFiltersData[key];
  }
}

export function getScopesWithFilters(bodyFiltersData: Record<string, FilterData[]>): string[] {
  const keys = Object.keys(bodyFiltersData);
  const result: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (bodyFiltersData[keys[i]] && bodyFiltersData[keys[i]].length > 0) {
      result.push(keys[i]);
    }
  }
  return result;
}

export function getScopesWithQueryFilters(
  queryFiltersData: Record<string, QueryFilterData[]>,
): string[] {
  const keys = Object.keys(queryFiltersData);
  const result: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (queryFiltersData[keys[i]] && queryFiltersData[keys[i]].length > 0) {
      result.push(keys[i]);
    }
  }
  return result;
}

export function querySummary(
  scopeKey: string,
  queryFiltersData: Record<string, QueryFilterData[]>,
): string {
  const filters = queryFiltersData[scopeKey] || [];
  const parts: string[] = [];
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    // Le suffixe « * » marque « requis » dans le texte tronque ; le titre du chip porte la
    // mention complete, il transporte deja le texte non tronque (design §8).
    const field = (f.param || "?") + (f.required ? "*" : "");
    if (f.filterType === "wildcard") {
      parts.push(field + " exists");
    } else if (f.filterType === "not") {
      const innerVal = (f.notInnerValue || "").trim();
      parts.push(field + " ≠ " + (innerVal || "?"));
    } else if (f.filterType === "and") {
      const andParts: string[] = [];
      const conds = f.andConditions || [];
      for (let ai = 0; ai < conds.length; ai++) {
        const c = conds[ai];
        if (c.conditionType === "wildcard") {
          andParts.push("exists");
        } else if (c.conditionType === "not") {
          andParts.push("pas " + ((c.notInnerValue || "").trim() || "?"));
        } else {
          andParts.push((c.value || "").trim() || "?");
        }
      }
      parts.push(field + " = (" + (andParts.length > 0 ? andParts.join(" ET ") : "vide") + ")");
    } else {
      const vals: string[] = [];
      for (let j = 0; j < f.values.length; j++) {
        if (f.values[j].trim()) vals.push(f.values[j].trim());
      }
      parts.push(vals.length > 0 ? field + " = " + vals.join(" | ") : field);
    }
  }
  return parts.join(", ");
}

export function truncatePath(raw: string, maxLen: number): string {
  if (raw.length <= maxLen) return raw;
  const idx = raw.indexOf(":");
  if (idx === -1) return raw.substring(0, maxLen) + "\u2026";
  const method = raw.substring(0, idx + 1);
  const path = raw.substring(idx + 1);
  const budget = maxLen - method.length - 3;
  if (budget < 5) return raw.substring(0, maxLen) + "\u2026";
  return method + "\u2026" + path.substring(path.length - budget);
}

export function filterSummary(
  scopeKey: string,
  bodyFiltersData: Record<string, FilterData[]>,
): string {
  const filters = bodyFiltersData[scopeKey] || [];
  const parts: string[] = [];
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    const field = f.objectPath || "?";
    if (f.filterType === "wildcard") {
      parts.push(field + " exists");
    } else if (f.filterType === "not") {
      const innerSubType = f.notInnerSubType || "text";
      const innerVal = (f.notInnerValue || "").trim();
      let displayVal = "";
      if (innerSubType === "null") {
        displayVal = "null";
      } else if (innerSubType === "boolean") {
        displayVal = innerVal === "true" ? "true" : "false";
      } else if (innerVal) {
        displayVal = innerVal;
      }
      if (displayVal) {
        parts.push(field + " \u2260 " + displayVal);
      } else {
        parts.push(field + " \u2260 ?");
      }
    } else if (f.filterType === "and") {
      const andParts: string[] = [];
      const aConds = f.andConditions || [];
      for (let ai = 0; ai < aConds.length; ai++) {
        const ac = aConds[ai];
        if (ac.conditionType === "wildcard") {
          andParts.push("exists");
        } else if (ac.conditionType === "not") {
          const nv = (ac.notInnerValue || "").trim();
          andParts.push("pas " + (nv || "?"));
        } else {
          const cv = (ac.value || "").trim();
          andParts.push(cv || "?");
        }
      }
      if (andParts.length > 0) {
        parts.push(field + " = (" + andParts.join(" ET ") + ")");
      } else {
        parts.push(field + " = (vide)");
      }
    } else {
      const vals: string[] = [];
      const subTypes = f.valueSubTypes || [];
      for (let j = 0; j < f.values.length; j++) {
        const st = subTypes[j] || "text";
        if (st === "null") {
          vals.push("null");
        } else if (st === "boolean") {
          vals.push(f.values[j] === "true" ? "true" : "false");
        } else if (f.values[j].trim()) {
          vals.push(f.values[j].trim());
        }
      }
      if (vals.length > 0) {
        parts.push(field + " = " + vals.join(" | "));
      } else {
        parts.push(field);
      }
    }
  }
  return parts.join(", ");
}
