import type {
  QueryFilterData,
  ScopeFiltersData,
  SerializedFilterValue,
  SerializedQueryFilter,
  SerializedScope,
} from "./types.ts";
import { getScopesWithFilters, getScopesWithQueryFilters, parseScope } from "./scopes.ts";

// Une saisie incomplete n'est pas un filtre absent : traduite en « rien a serialiser », elle
// faisait retomber le scope en simple chaine, donc en blob SANS aucune contrainte de query,
// pendant que le panneau affichait l'alerte de deni par defaut et une chip qui affirmaient le
// contraire. Le cas invalide remonte donc jusqu'a l'appelant, qui bloque la generation.
export type QueryValueResult =
  | { ok: true; value: SerializedFilterValue }
  | { ok: false; reason: string };

export interface BuiltScopes {
  scopes: SerializedScope[];
  errors: string[];
}

// Une valeur de query est toujours une chaine : aucun sous-type a lire, a aucune
// profondeur d'imbrication (§19.3).
export function serializeQueryValue(type: string, raw: string): QueryValueResult {
  if (type === "wildcard") return { ok: true, value: { type: "wildcard", value: "*" } };
  const value = raw.trim();
  if (!value) return { ok: false, reason: "valeur manquante" };
  if (type === "regex") return { ok: true, value: { type: "regex", value } };
  if (type === "stringwildcard") return { ok: true, value: { type: "stringwildcard", value } };
  return { ok: true, value: { type: "any", value } };
}

export type QueryFilterResult =
  | { ok: true; filter: SerializedQueryFilter }
  | { ok: false; reason: string };

export function serializeQueryFilter(filter: QueryFilterData): QueryFilterResult {
  const param = (filter.param || "").trim();
  if (!param) return { ok: false, reason: "nom du parametre manquant" };

  const values: SerializedFilterValue[] = [];

  if (filter.filterType === "wildcard") {
    values.push({ type: "wildcard", value: "*" });
  } else if (filter.filterType === "not") {
    const inner = serializeQueryValue(filter.notInnerType || "any", filter.notInnerValue || "");
    if (!inner.ok) return { ok: false, reason: "valeur manquante dans l'exclusion" };
    values.push({ type: "not", value: inner.value });
  } else if (filter.filterType === "and") {
    const conditions = filter.andConditions || [];
    if (conditions.length === 0) return { ok: false, reason: "aucune condition" };
    const subs: SerializedFilterValue[] = [];
    for (const cond of conditions) {
      if (cond.conditionType === "not") {
        const inner = serializeQueryValue(cond.notInnerType || "any", cond.notInnerValue || "");
        if (!inner.ok) return { ok: false, reason: "condition incomplete" };
        subs.push({ type: "not", value: inner.value });
        continue;
      }
      const sub = serializeQueryValue(cond.conditionType, cond.value);
      // Une condition vide etait ecartee et le « ET » restant aplati en sa seule condition
      // survivante : la contrainte se RELACHAIT au lieu de disparaitre, ce qui est pire que
      // les deux. L'aplatissement ne vaut donc que pour un « ET » a une seule condition
      // reellement ecrite par l'auteur, jamais pour un reste de saisie.
      if (!sub.ok) return { ok: false, reason: "condition incomplete" };
      subs.push(sub.value);
    }
    if (subs.length === 1) values.push(subs[0]);
    else values.push({ type: "and", value: subs });
  } else {
    for (const raw of filter.values) {
      const value = serializeQueryValue(filter.filterType, raw);
      if (!value.ok) return { ok: false, reason: value.reason };
      values.push(value.value);
    }
  }

  if (values.length === 0) return { ok: false, reason: "valeur manquante" };
  const serialized: SerializedQueryFilter = { param, values };
  if (filter.required) serialized.required = true;
  return { ok: true, filter: serialized };
}

interface QueryFiltersResult {
  filters: SerializedQueryFilter[];
  errors: string[];
}

function serializeQueryFilters(
  scopeKey: string,
  queryFiltersData: Record<string, QueryFilterData[]>,
): QueryFiltersResult {
  const filters: SerializedQueryFilter[] = [];
  const errors: string[] = [];
  const declared = queryFiltersData[scopeKey] || [];
  for (let i = 0; i < declared.length; i++) {
    const result = serializeQueryFilter(declared[i]);
    if (result.ok) {
      filters.push(result.filter);
      continue;
    }
    const named = (declared[i].param || "").trim();
    const label = named ? `« ${named} »` : `n° ${i + 1}`;
    errors.push(
      `Filtre query ${label} incomplet sur ${scopeKey} (${result.reason}) : ` +
        "renseignez-le ou supprimez-le.",
    );
  }
  return { filters, errors };
}

export function buildScopes(scopesText: string, data: ScopeFiltersData): BuiltScopes {
  const bodyFiltersData = data.bodyFiltersData;
  const queryFiltersData = data.queryFiltersData;
  const textareaScopes = scopesText
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
  const result: SerializedScope[] = [];
  const errors: string[] = [];

  // Le textarea est la liste des scopes qui fait foi. La purge des cles orphelines tient deja
  // les deux maps a jour, mais elle depend du moment ou l'interface se rafraichit : l'endroit
  // qui produit reellement le blob ne doit dependre d'aucun rafraichissement, sans quoi un
  // scope que son auteur a retire continue d'accorder l'acces.
  const declared = getScopesWithFilters(bodyFiltersData);
  for (const key of getScopesWithQueryFilters(queryFiltersData)) {
    if (declared.indexOf(key) === -1) declared.push(key);
  }
  const withFilters = declared.filter((key) => textareaScopes.indexOf(key) !== -1);

  for (let i = 0; i < withFilters.length; i++) {
    const scopeKey = withFilters[i];
    const parsed = parseScope(scopeKey);
    if (!parsed) continue;
    const filters = bodyFiltersData[scopeKey] || [];
    const serializedFilters: { objectPath: string; objectValue: SerializedFilterValue[] }[] = [];
    for (let fi = 0; fi < filters.length; fi++) {
      const f = filters[fi];
      if (!f.objectPath || !f.objectPath.trim()) continue;
      const objValues: SerializedFilterValue[] = [];
      if (f.filterType === "wildcard") {
        objValues.push({ type: "wildcard", value: "*" });
      } else if (f.filterType === "not") {
        const notInner = f.notInnerType || "any";
        const notSub = f.notInnerSubType || "text";
        const notVal = (f.notInnerValue || "").trim();
        let innerValue: unknown;
        if (notInner === "any") {
          if (notSub === "null") {
            innerValue = null;
          } else if (notSub === "boolean") {
            innerValue = notVal === "true";
          } else if (notSub === "number") {
            const notNum = Number(notVal);
            if (notVal && !isNaN(notNum)) innerValue = notNum;
            else innerValue = undefined;
          } else {
            innerValue = notVal || undefined;
          }
        } else {
          innerValue = notVal || undefined;
        }
        if (innerValue !== undefined) {
          objValues.push({
            type: "not",
            value: { type: notInner, value: innerValue },
          });
        }
      } else if (f.filterType === "and") {
        const andSubs: SerializedFilterValue[] = [];
        const aConds = f.andConditions || [];
        for (let ai = 0; ai < aConds.length; ai++) {
          const ac = aConds[ai];
          if (ac.conditionType === "any") {
            const acSub = ac.valueSubType || "text";
            const acVal = (ac.value || "").trim();
            if (acSub === "null") {
              andSubs.push({ type: "any", value: null });
            } else if (acSub === "boolean") {
              andSubs.push({ type: "any", value: acVal === "true" });
            } else if (acSub === "number") {
              const acNum = Number(acVal);
              if (acVal && !isNaN(acNum)) {
                andSubs.push({ type: "any", value: acNum });
              }
            } else {
              if (acVal) andSubs.push({ type: "any", value: acVal });
            }
          } else if (ac.conditionType === "stringwildcard") {
            const swVal = (ac.value || "").trim();
            if (swVal) {
              andSubs.push({ type: "stringwildcard", value: swVal });
            }
          } else if (ac.conditionType === "regex") {
            const rxVal = (ac.value || "").trim();
            if (rxVal) {
              andSubs.push({ type: "regex", value: rxVal });
            }
          } else if (ac.conditionType === "wildcard") {
            andSubs.push({ type: "wildcard", value: "*" });
          } else if (ac.conditionType === "not") {
            const acNotInner = ac.notInnerType || "any";
            const acNotSub = ac.notInnerSubType || "text";
            const acNotVal = (ac.notInnerValue || "").trim();
            let acInnerValue: unknown;
            if (acNotInner === "any") {
              if (acNotSub === "null") acInnerValue = null;
              else if (acNotSub === "boolean") {
                acInnerValue = acNotVal === "true";
              } else if (acNotSub === "number") {
                const acNotNum = Number(acNotVal);
                if (acNotVal && !isNaN(acNotNum)) acInnerValue = acNotNum;
              } else {
                if (acNotVal) acInnerValue = acNotVal;
              }
            } else {
              if (acNotVal) acInnerValue = acNotVal;
            }
            if (acInnerValue !== undefined) {
              andSubs.push({
                type: "not",
                value: { type: acNotInner, value: acInnerValue },
              });
            }
          }
        }
        if (andSubs.length === 1) {
          objValues.push(andSubs[0]);
        } else if (andSubs.length > 1) {
          objValues.push({ type: "and", value: andSubs });
        }
      } else {
        const subTypes = f.valueSubTypes || [];
        for (let vi = 0; vi < f.values.length; vi++) {
          const v = f.values[vi].trim();
          const st = subTypes[vi] || "text";
          if (f.filterType === "any") {
            if (st === "null") {
              objValues.push({ type: "any", value: null });
            } else if (st === "boolean") {
              objValues.push({ type: "any", value: v === "true" });
            } else if (st === "number") {
              const num = Number(v);
              if (v && !isNaN(num)) {
                objValues.push({ type: "any", value: num });
              }
            } else {
              if (v) objValues.push({ type: "any", value: v });
            }
          } else if (f.filterType === "regex") {
            if (v) {
              objValues.push({ type: "regex", value: v });
            }
          } else {
            if (v) {
              objValues.push({ type: "stringwildcard", value: v });
            }
          }
        }
      }
      if (objValues.length > 0) {
        serializedFilters.push({
          objectPath: f.objectPath.trim(),
          objectValue: objValues,
        });
      }
    }
    const query = serializeQueryFilters(scopeKey, queryFiltersData);
    // Invariant : un scope qui porte au moins un query filter ne ressort JAMAIS en chaine.
    // Tant qu'un de ses filtres est incomplet, le scope entier sort du jeu : la generation
    // est de toute facon bloquee, et un scope amoindri vaut mieux qu'un scope elargi.
    if (query.errors.length > 0) {
      for (const error of query.errors) errors.push(error);
      continue;
    }

    if (serializedFilters.length > 0 || query.filters.length > 0) {
      const methods = parsed.method === "*"
        ? ["*"]
        : (parsed.method.includes("|") ? parsed.method.split("|") : [parsed.method]);
      const entry: SerializedScope = {
        methods: methods,
        pattern: parsed.path,
      };
      if (serializedFilters.length > 0) entry.bodyFilters = serializedFilters;
      if (query.filters.length > 0) entry.queryFilters = query.filters;
      result.push(entry);
    } else {
      result.push(scopeKey);
    }
  }

  for (let j = 0; j < textareaScopes.length; j++) {
    if (withFilters.indexOf(textareaScopes[j]) === -1) {
      result.push(textareaScopes[j]);
    }
  }

  return { scopes: result, errors };
}
