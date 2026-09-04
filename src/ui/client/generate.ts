import type {
  QueryFilterData,
  ScopeFiltersData,
  SerializedFilterValue,
  SerializedQueryFilter,
  SerializedScope,
} from "./types.ts";
import { assertElement } from "./elements.ts";
import type { Elements } from "./elements.ts";
import { getScopesWithFilters, getScopesWithQueryFilters, parseScope } from "./scopes.ts";
import { buildAuthPayload } from "./auth-mode.ts";
import type { AuthModeDeps } from "./auth-mode.ts";
import { markKeyOrigin } from "./byok.ts";
import type { ByokApi } from "./byok.ts";

// Une valeur de query est toujours une chaine : aucun sous-type a lire, a aucune
// profondeur d'imbrication (§19.3).
function serializeQueryValue(type: string, raw: string): SerializedFilterValue | null {
  if (type === "wildcard") return { type: "wildcard", value: "*" };
  const value = raw.trim();
  if (!value) return null;
  if (type === "regex") return { type: "regex", value };
  if (type === "stringwildcard") return { type: "stringwildcard", value };
  return { type: "any", value };
}

function serializeQueryFilter(filter: QueryFilterData): SerializedQueryFilter | null {
  const param = (filter.param || "").trim();
  if (!param) return null;

  const values: SerializedFilterValue[] = [];

  if (filter.filterType === "wildcard") {
    values.push({ type: "wildcard", value: "*" });
  } else if (filter.filterType === "not") {
    const inner = serializeQueryValue(filter.notInnerType || "any", filter.notInnerValue || "");
    if (inner) values.push({ type: "not", value: inner });
  } else if (filter.filterType === "and") {
    const subs: SerializedFilterValue[] = [];
    for (const cond of filter.andConditions || []) {
      if (cond.conditionType === "not") {
        const inner = serializeQueryValue(cond.notInnerType || "any", cond.notInnerValue || "");
        if (inner) subs.push({ type: "not", value: inner });
        continue;
      }
      const sub = serializeQueryValue(cond.conditionType, cond.value);
      if (sub) subs.push(sub);
    }
    if (subs.length === 1) values.push(subs[0]);
    else if (subs.length > 1) values.push({ type: "and", value: subs });
  } else {
    for (const raw of filter.values) {
      const value = serializeQueryValue(filter.filterType, raw);
      if (value) values.push(value);
    }
  }

  if (values.length === 0) return null;
  const serialized: SerializedQueryFilter = { param, values };
  if (filter.required) serialized.required = true;
  return serialized;
}

function serializeQueryFilters(
  scopeKey: string,
  queryFiltersData: Record<string, QueryFilterData[]>,
): SerializedQueryFilter[] {
  const result: SerializedQueryFilter[] = [];
  for (const filter of queryFiltersData[scopeKey] || []) {
    const serialized = serializeQueryFilter(filter);
    if (serialized) result.push(serialized);
  }
  return result;
}

export function buildScopes(
  scopesTextarea: HTMLTextAreaElement,
  data: ScopeFiltersData,
): SerializedScope[] {
  const bodyFiltersData = data.bodyFiltersData;
  const queryFiltersData = data.queryFiltersData;
  const textareaScopes = scopesTextarea.value
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
  const result: SerializedScope[] = [];

  const withFilters = getScopesWithFilters(bodyFiltersData);
  for (const key of getScopesWithQueryFilters(queryFiltersData)) {
    if (withFilters.indexOf(key) === -1) withFilters.push(key);
  }

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
    const serializedQueryFilters = serializeQueryFilters(scopeKey, queryFiltersData);

    if (serializedFilters.length > 0 || serializedQueryFilters.length > 0) {
      const methods = parsed.method === "*"
        ? ["*"]
        : (parsed.method.includes("|") ? parsed.method.split("|") : [parsed.method]);
      const entry: SerializedScope = {
        methods: methods,
        pattern: parsed.path,
      };
      if (serializedFilters.length > 0) entry.bodyFilters = serializedFilters;
      if (serializedQueryFilters.length > 0) entry.queryFilters = serializedQueryFilters;
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

  return result;
}

export function setupGenerate(
  els: Elements,
  filtersData: ScopeFiltersData,
  showError: (msg: string) => void,
  hideError: () => void,
  getLogsConfig: (() => { enabled: boolean; detailed: boolean } | null) | undefined,
  authDeps: AuthModeDeps,
  byok: ByokApi,
): void {
  const fgpForm = assertElement("fgp-form", HTMLFormElement);
  fgpForm.addEventListener("submit", async function (e: Event) {
    e.preventDefault();
    hideError();

    const token = els.tokenInput.value.trim();
    const target = els.targetInput.value.trim();

    const authResult = buildAuthPayload(authDeps);
    if (!authResult.ok) {
      showError(authResult.message);
      return;
    }

    if (authResult.requiresToken && !token) {
      showError("Token manquant.");
      return;
    }
    if (!target) {
      showError("URL cible manquante.");
      return;
    }
    if (!byok.validate()) {
      showError("Cl\u00e9 client personnalis\u00e9e invalide.");
      return;
    }

    const scopes = buildScopes(els.scopesTextarea, filtersData);
    if (scopes.length === 0) {
      showError("Au moins un scope requis.");
      return;
    }

    const ttlRadio = document.querySelector<HTMLInputElement>("input[name=ttl]:checked");
    if (!ttlRadio) {
      showError("S\u00e9lectionnez une dur\u00e9e de validit\u00e9.");
      return;
    }
    let ttl = 0;
    if (ttlRadio.value === "custom") {
      const customTtl = assertElement("custom-ttl", HTMLInputElement);
      const customVal = customTtl.value;
      if (!customVal || Number(customVal) < 60) {
        showError("TTL personnalis\u00e9 invalide (minimum 60s).");
        return;
      }
      ttl = Number(customVal);
    } else {
      ttl = Number(ttlRadio.value);
    }

    const btn = assertElement("btn-generate", HTMLButtonElement);
    btn.disabled = true;
    btn.textContent = "G\u00e9n\u00e9ration\u2026";

    const nameInput = document.getElementById("config-name") as HTMLInputElement | null;
    const name = nameInput?.value.trim() || undefined;
    const logs = getLogsConfig ? getLogsConfig() : null;
    const customKey = byok.readKey();

    try {
      const payload: Record<string, unknown> = {
        target: target,
        auth: authResult.auth,
        scopes: scopes,
        ttl: ttl,
      };
      if (authResult.requiresToken) payload.token = token;
      if (customKey) payload.key = customKey;
      if (name) payload.name = name;
      if (logs) payload.logs = logs;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(function () {
          return {} as Record<string, string>;
        });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      const data = await res.json();

      const resultUrl = assertElement("result-url", HTMLInputElement);
      const resultKey = assertElement("result-key", HTMLInputElement);
      const resultBlob = assertElement("result-blob", HTMLInputElement);
      const resultCurl = assertElement("result-curl", HTMLElement);
      const resultCurlHeader = assertElement("result-curl-header", HTMLElement);
      resultUrl.value = data.url;
      resultKey.value = data.key;
      markKeyOrigin(customKey.length > 0);
      resultBlob.value = data.blob;
      resultCurl.textContent = 'curl -H "X-FGP-Key: ' + data.key + '" ' + data.url + "v1/apps";
      const origin = new URL(data.url).origin;
      resultCurlHeader.textContent = 'curl -H "X-FGP-Key: ' + data.key + '" \\\n  -H "X-FGP-Blob: ' +
        data.blob + '" \\\n  ' + origin + "/v1/apps";
      els.resultSection.classList.remove("hidden");
      resultUrl.focus();
    } catch (err) {
      showError("Erreur lors de la g\u00e9n\u00e9ration : " + (err as Error).message);
    } finally {
      btn.disabled = false;
      btn.textContent = "G\u00e9n\u00e9rer l'URL";
    }
  });
}
