import {
  decodePublicConfig,
  encodePublicConfig,
  type PublicConfig,
} from "../../crypto/share.ts";
import { buildScopes } from "./generate.ts";
import type { AndCondition, FilterData, SerializedFilterValue } from "./types.ts";

let nextRestoreId = 9000;

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

function restoreBodyFilters(
  scopes: unknown[],
  bodyFiltersData: Record<string, FilterData[]>,
): void {
  for (const scope of scopes) {
    if (typeof scope === "string") continue;
    const entry = scope as {
      methods?: string[];
      pattern?: string;
      bodyFilters?: { objectPath: string; objectValue: SerializedFilterValue[] }[];
    };
    if (!entry.methods || !entry.pattern || !entry.bodyFilters?.length) continue;

    const scopeKey = `${entry.methods.join("|")}:${entry.pattern}`;
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
}

function readCurrentConfig(bodyFiltersData: Record<string, FilterData[]>): PublicConfig | null {
  const target = (document.getElementById("target") as HTMLInputElement | null)?.value ?? "";
  const authSelect = (document.getElementById("auth") as HTMLSelectElement | null)?.value ?? "";
  const authHeaderName =
    (document.getElementById("auth-header-name") as HTMLInputElement | null)?.value ?? "";
  const auth = authSelect === "header:" && authHeaderName
    ? `header:${authHeaderName}`
    : authSelect;

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  const rawLines = scopesTextarea?.value.split("\n").filter((l) => l.trim() !== "") ?? [];
  const scopes = scopesTextarea ? buildScopes(scopesTextarea, bodyFiltersData) : [];

  const ttlRadio = document.querySelector<HTMLInputElement>("input[name=ttl]:checked");
  let ttl = 86400;
  if (ttlRadio) {
    if (ttlRadio.value === "custom") {
      const customInput = document.getElementById("custom-ttl") as HTMLInputElement | null;
      ttl = customInput ? parseInt(customInput.value, 10) || 0 : 0;
    } else {
      ttl = parseInt(ttlRadio.value, 10) || 0;
    }
  }

  if (!target && rawLines.length === 0) return null;

  const name = (document.getElementById("config-name") as HTMLInputElement | null)?.value || undefined;
  const testMethod = (document.getElementById("test-method") as HTMLSelectElement | null)?.value;
  const testPath = (document.getElementById("test-path") as HTMLInputElement | null)?.value;
  const testBody = (document.getElementById("test-body") as HTMLTextAreaElement | null)?.value;

  const test = testPath
    ? { method: testMethod ?? "GET", path: testPath, body: testBody || undefined }
    : undefined;

  return { name, target, auth, scopes, ttl, test };
}

function scopeToLine(scope: unknown): string {
  if (typeof scope === "string") return scope;
  const entry = scope as { methods?: string[]; pattern?: string };
  if (entry.methods && entry.pattern) {
    return `${entry.methods.join("|")}:${entry.pattern}`;
  }
  return String(scope);
}

const DEFAULT_TITLE = "FGP \u2014 Fine-Grained Proxy";

function updateTitle(name?: string): void {
  document.title = name ? `${name} \u2014 ${DEFAULT_TITLE}` : DEFAULT_TITLE;
}

function applyConfig(config: PublicConfig): void {
  const nameInput = document.getElementById("config-name") as HTMLInputElement | null;
  if (nameInput && config.name) nameInput.value = config.name;
  updateTitle(config.name);

  const targetInput = document.getElementById("target") as HTMLInputElement | null;
  if (targetInput) targetInput.value = config.target;

  const authSelect = document.getElementById("auth") as HTMLSelectElement | null;
  const authHeaderName = document.getElementById("auth-header-name") as HTMLInputElement | null;
  if (authSelect) {
    if (config.auth.startsWith("header:") && config.auth.length > 7) {
      authSelect.value = "header:";
      if (authHeaderName) {
        authHeaderName.value = config.auth.slice(7);
        authHeaderName.classList.remove("hidden");
      }
    } else {
      authSelect.value = config.auth;
      if (authHeaderName) authHeaderName.classList.add("hidden");
    }
    authSelect.dispatchEvent(new Event("change"));
  }

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  if (scopesTextarea) {
    scopesTextarea.value = config.scopes.map(scopeToLine).join("\n");
    scopesTextarea.dispatchEvent(new Event("input"));
  }

  const ttlValue = String(config.ttl);
  const ttlRadios = document.querySelectorAll<HTMLInputElement>("input[name=ttl]");
  let matched = false;
  ttlRadios.forEach((radio) => {
    if (radio.value === ttlValue) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
      matched = true;
    }
  });
  if (!matched) {
    const customRadio = document.querySelector<HTMLInputElement>("input[name=ttl][value=custom]");
    if (customRadio) {
      customRadio.checked = true;
      customRadio.dispatchEvent(new Event("change"));
      const customInput = document.getElementById("custom-ttl") as HTMLInputElement | null;
      if (customInput) customInput.value = ttlValue;
    }
  }

  if (config.test) {
    const testMethod = document.getElementById("test-method") as HTMLSelectElement | null;
    const testPath = document.getElementById("test-path") as HTMLInputElement | null;
    const testBody = document.getElementById("test-body") as HTMLTextAreaElement | null;
    if (testMethod) testMethod.value = config.test.method;
    if (testPath) testPath.value = config.test.path;
    if (testBody && config.test.body) testBody.value = config.test.body;
  }
}

async function updateShareUrl(bodyFiltersData: Record<string, FilterData[]>): Promise<void> {
  const config = readCurrentConfig(bodyFiltersData);
  if (!config) {
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    history.replaceState(null, "", url.toString());
    return;
  }

  const encoded = await encodePublicConfig(config);
  const url = new URL(window.location.href);
  url.searchParams.set("c", encoded);
  history.replaceState(null, "", url.toString());
}

export function setupShareConfig(bodyFiltersData: Record<string, FilterData[]>): void {
  let initializing = false;

  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("c");
  if (encoded) {
    initializing = true;
    decodePublicConfig(encoded).then((config) => {
      applyConfig(config);
      restoreBodyFilters(config.scopes, bodyFiltersData);
      const scopesTa = document.getElementById("scopes");
      if (scopesTa) scopesTa.dispatchEvent(new Event("input"));
      const testMethod = document.getElementById("test-method");
      if (testMethod) testMethod.dispatchEvent(new Event("change"));
      if (config.test?.path) {
        const details = document.querySelector("details:has(#test-scope-results)") as HTMLDetailsElement | null;
        if (details) details.open = true;
      }
      setTimeout(() => { initializing = false; }, 600);
    }).catch(() => {
      initializing = false;
    });
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleUpdate(): void {
    if (initializing) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateShareUrl(bodyFiltersData);
    }, 500);
  }

  const fields = [
    "config-name", "target", "auth", "auth-header-name", "scopes", "custom-ttl",
    "test-method", "test-path", "test-body",
  ];

  const nameInput = document.getElementById("config-name") as HTMLInputElement | null;
  if (nameInput) {
    nameInput.addEventListener("input", () => updateTitle(nameInput.value || undefined));
  }
  for (const id of fields) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", scheduleUpdate);
      el.addEventListener("change", scheduleUpdate);
    }
  }

  document.querySelectorAll<HTMLInputElement>("input[name=ttl]").forEach((radio) => {
    radio.addEventListener("change", scheduleUpdate);
  });

  const bodyFiltersPanel = document.getElementById("body-filters-list");
  if (bodyFiltersPanel) {
    bodyFiltersPanel.addEventListener("input", scheduleUpdate);
    bodyFiltersPanel.addEventListener("change", scheduleUpdate);
  }
}
