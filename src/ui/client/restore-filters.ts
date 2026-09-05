import type {
  AndCondition,
  FilterData,
  QueryAndCondition,
  QueryFilterData,
  ScopeFiltersData,
  SerializedFilterValue,
  SerializedQueryFilter,
} from "./types.ts";

let nextRestoreId = 9000;

// Les types de valeur que le formulaire sait afficher a plat, c'est-a-dire sans imbrication.
// Le modele de l'UI porte UN type par filtre et une liste de valeurs : tout ce qui sort de
// cette forme n'est pas representable, et le taire produirait un formulaire qui affirme une
// contrainte differente de celle du blob qu'on vient d'importer.
const PLAIN_QUERY_TYPES = ["any", "regex", "stringwildcard"];

function deserializeFilterValue(ov: SerializedFilterValue): Partial<FilterData> {
  if (ov.type === "wildcard") {
    return { filterType: "wildcard", values: [], valueSubTypes: [] };
  }
  if (ov.type === "not") {
    const inner = ov.value as SerializedFilterValue;
    return {
      filterType: "not",
      values: [],
      valueSubTypes: [],
      notInnerType: inner.type,
      notInnerSubType: typeof inner.value === "string" ? "text" : "text",
      notInnerValue: inner.value != null ? String(inner.value) : "",
    };
  }
  if (ov.type === "and") {
    const subs = ov.value as SerializedFilterValue[];
    const andConditions: AndCondition[] = subs.map((sub) => ({
      id: nextRestoreId++,
      conditionType: sub.type,
      value: sub.value != null ? String(sub.value) : "",
      valueSubType: "text",
      notInnerType: null,
      notInnerSubType: null,
      notInnerValue: null,
    }));
    return { filterType: "and", values: [], valueSubTypes: [], andConditions };
  }
  if (ov.type === "any") {
    const val = ov.value;
    let subType = "text";
    if (val === null) subType = "null";
    else if (typeof val === "boolean") subType = "boolean";
    else if (typeof val === "number") subType = "number";
    return {
      filterType: "any",
      values: [val != null ? String(val) : ""],
      valueSubTypes: [subType],
    };
  }
  return {
    filterType: ov.type === "regex" ? "regex" : "stringwildcard",
    values: [ov.value != null ? String(ov.value) : ""],
    valueSubTypes: ["text"],
  };
}

// Une valeur de query est toujours une chaine, y compris sous « not » et dans un « and » :
// la restauration n'a donc aucun sous-type a deduire (§19.3).
function deserializeQueryValue(ov: SerializedFilterValue): { type: string; value: string } {
  if (ov.type === "wildcard") return { type: "wildcard", value: "" };
  return { type: ov.type, value: ov.value != null ? String(ov.value) : "" };
}

function isSerializedValue(ov: unknown): ov is SerializedFilterValue {
  if (typeof ov !== "object" || ov === null) return false;
  return typeof (ov as { type?: unknown }).type === "string";
}

export type QueryFilterRestore =
  | { ok: true; filter: QueryFilterData }
  | { ok: false; reason: string };

function restoreAndConditions(
  subs: unknown,
): { ok: true; conditions: QueryAndCondition[] } | { ok: false; reason: string } {
  if (!Array.isArray(subs) || subs.length === 0) {
    return { ok: false, reason: "condition « ET » vide" };
  }
  const conditions: QueryAndCondition[] = [];
  for (const sub of subs) {
    if (!isSerializedValue(sub)) return { ok: false, reason: "condition « ET » illisible" };
    if (sub.type === "not") {
      const raw = sub.value;
      if (!isSerializedValue(raw) || PLAIN_QUERY_TYPES.indexOf(raw.type) === -1) {
        return { ok: false, reason: "exclusion imbriquee non representable" };
      }
      const inner = deserializeQueryValue(raw);
      conditions.push({
        id: nextRestoreId++,
        conditionType: "not",
        value: "",
        notInnerType: inner.type,
        notInnerValue: inner.value,
      });
      continue;
    }
    if (sub.type !== "wildcard" && PLAIN_QUERY_TYPES.indexOf(sub.type) === -1) {
      return { ok: false, reason: `condition « ${sub.type} » non representable dans un ET` };
    }
    const plain = deserializeQueryValue(sub);
    conditions.push({
      id: nextRestoreId++,
      conditionType: plain.type,
      value: plain.value,
      notInnerType: null,
      notInnerValue: null,
    });
  }
  return { ok: true, conditions };
}

// Ne lisait que values[0] et sortait sur « not » comme sur « and » : les valeurs suivantes
// disparaissaient sans un mot, et un filtre a plusieurs valeurs revenait plus permissif qu'il
// n'etait parti. Ce qui n'est pas representable est desormais nomme, jamais tronque.
export function restoreQueryFilter(sqf: SerializedQueryFilter): QueryFilterRestore {
  if (!sqf.param || !Array.isArray(sqf.values) || sqf.values.length === 0) {
    return { ok: false, reason: "filtre sans parametre ou sans valeur" };
  }
  if (!sqf.values.every(isSerializedValue)) {
    return { ok: false, reason: "valeur illisible" };
  }

  const filter: QueryFilterData = {
    id: nextRestoreId++,
    param: sqf.param,
    required: sqf.required === true,
    filterType: "any",
    values: [],
  };

  const first = sqf.values[0];

  if (first.type === "not" || first.type === "and" || first.type === "wildcard") {
    if (sqf.values.length > 1) {
      return {
        ok: false,
        reason: `« ${first.type} » combine a d'autres valeurs OR`,
      };
    }
    if (first.type === "wildcard") {
      filter.filterType = "wildcard";
      return { ok: true, filter };
    }
    if (first.type === "not") {
      const raw = first.value;
      if (!isSerializedValue(raw) || PLAIN_QUERY_TYPES.indexOf(raw.type) === -1) {
        return { ok: false, reason: "exclusion non representable" };
      }
      const inner = deserializeQueryValue(raw);
      filter.filterType = "not";
      filter.notInnerType = inner.type;
      filter.notInnerValue = inner.value;
      return { ok: true, filter };
    }
    const conditions = restoreAndConditions(first.value);
    if (!conditions.ok) return { ok: false, reason: conditions.reason };
    filter.filterType = "and";
    filter.andConditions = conditions.conditions;
    return { ok: true, filter };
  }

  if (PLAIN_QUERY_TYPES.indexOf(first.type) === -1) {
    return { ok: false, reason: `type « ${first.type} » inconnu` };
  }
  // Le formulaire porte UN type pour toute la liste OR : un melange de types se serait
  // reaffiche sous le type du premier, en changeant le sens de toutes les autres valeurs.
  for (const value of sqf.values) {
    if (value.type !== first.type) {
      return { ok: false, reason: "types melanges dans la liste OR" };
    }
    filter.values.push(value.value != null ? String(value.value) : "");
  }
  filter.filterType = first.type;
  return { ok: true, filter };
}

export interface RestoreReport {
  // Filtres que le formulaire ne sait pas afficher fidelement. Une restauration partielle
  // silencieuse est le meme fail-open qu'une perte totale silencieuse : elle produit un
  // formulaire qui ment sur le token qu'il va regenerer.
  unsupported: string[];
}

export function restoreScopeFilters(
  scopes: unknown[],
  data: ScopeFiltersData,
): RestoreReport {
  const bodyFiltersData = data.bodyFiltersData;
  const unsupported: string[] = [];

  for (const scope of scopes) {
    if (typeof scope === "string") continue;
    const entry = scope as {
      methods?: string[];
      pattern?: string;
      bodyFilters?: { objectPath: string; objectValue: SerializedFilterValue[] }[];
      queryFilters?: SerializedQueryFilter[];
    };
    if (!entry.methods || !entry.pattern) continue;
    const scopeKeyBase = `${entry.methods.join("|")}:${entry.pattern}`;

    if (entry.queryFilters?.length) {
      const restored: QueryFilterData[] = [];
      for (const sqf of entry.queryFilters) {
        const result = restoreQueryFilter(sqf);
        if (result.ok) {
          restored.push(result.filter);
          continue;
        }
        const named = sqf && typeof sqf.param === "string" ? sqf.param : "?";
        unsupported.push(`${scopeKeyBase} : filtre query « ${named} » (${result.reason})`);
      }
      if (restored.length > 0) data.queryFiltersData[scopeKeyBase] = restored;
    }

    if (!entry.bodyFilters?.length) continue;

    const scopeKey = scopeKeyBase;
    const filters: FilterData[] = [];

    for (const bf of entry.bodyFilters) {
      if (bf.objectValue.length === 0) continue;
      const first = bf.objectValue[0];
      const partial = deserializeFilterValue(first);
      const filter: FilterData = {
        id: nextRestoreId++,
        objectPath: bf.objectPath,
        filterType: partial.filterType ?? "any",
        values: partial.values ?? [],
        valueSubTypes: partial.valueSubTypes ?? [],
        notInnerType: partial.notInnerType,
        notInnerSubType: partial.notInnerSubType,
        notInnerValue: partial.notInnerValue,
        andConditions: partial.andConditions,
      };

      if (bf.objectValue.length > 1 && filter.filterType === "any") {
        for (let i = 1; i < bf.objectValue.length; i++) {
          const extra = deserializeFilterValue(bf.objectValue[i]);
          if (extra.values) filter.values.push(...extra.values);
          if (extra.valueSubTypes) filter.valueSubTypes.push(...extra.valueSubTypes);
        }
      }

      filters.push(filter);
    }

    if (filters.length > 0) {
      bodyFiltersData[scopeKey] = filters;
    }
  }

  return { unsupported };
}
