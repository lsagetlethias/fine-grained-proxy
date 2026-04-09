interface ParsedScope {
  method: string;
  path: string;
  raw: string;
}

interface AndCondition {
  id: number;
  conditionType: string;
  value: string;
  valueSubType: string;
  notInnerType: string | null;
  notInnerSubType: string | null;
  notInnerValue: string | null;
}

interface FilterData {
  id: number;
  objectPath: string;
  filterType: string;
  values: string[];
  valueSubTypes: string[];
  notInnerType?: string;
  notInnerSubType?: string;
  notInnerValue?: string;
  andConditions?: AndCondition[];
}

interface SerializedFilterValue {
  type: string;
  value: unknown;
}

interface SerializedFilter {
  objectPath: string;
  objectValue: SerializedFilterValue[];
}

interface ScopeWithFilters {
  methods: string[];
  pattern: string;
  bodyFilters: SerializedFilter[];
}

type SerializedScope = string | ScopeWithFilters;

interface SelectOption {
  value: string;
  label: string;
}

function assertElement<T extends HTMLElement>(
  id: string,
  ctor: new (...args: never[]) => T,
): T {
  const el = document.getElementById(id);
  if (!el || !(el instanceof ctor)) {
    throw new Error(`Element #${id} not found or wrong type`);
  }
  return el;
}

(function () {
  "use strict";

  const targetInput = assertElement("target", HTMLInputElement);
  const authSelect = assertElement("auth", HTMLSelectElement);
  const authHeaderName = assertElement("auth-header-name", HTMLInputElement);
  const tokenInput = assertElement("token", HTMLInputElement);
  const btnLoadApps = assertElement("btn-load-apps", HTMLButtonElement);
  const appsSection = assertElement("apps-section", HTMLElement);
  const appsList = assertElement("apps-list", HTMLElement);
  const scopesTextarea = assertElement("scopes", HTMLTextAreaElement);
  const resultSection = assertElement("result-section", HTMLElement);
  const errorBanner = assertElement("error-banner", HTMLElement);
  const customTtlWrapper = assertElement("custom-ttl-wrapper", HTMLElement);
  const ttlWarning = assertElement("ttl-warning", HTMLElement);
  const scopeChips = assertElement("scope-chips", HTMLElement);
  const btnAddBodyFilters = assertElement("btn-add-body-filters", HTMLButtonElement);
  const bodyFiltersPanel = assertElement("body-filters-panel", HTMLElement);
  const bodyFiltersList = assertElement("body-filters-list", HTMLElement);
  const btnCloseBodyFilters = assertElement("btn-close-body-filters", HTMLButtonElement);

  const ELIGIBLE_METHODS = ["POST", "PUT", "PATCH", "*"];
  let bodyFiltersData: Record<string, FilterData[]> = {};
  let nextFilterId = 1;

  function showError(msg: string): void {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
    setTimeout(function () {
      errorBanner.classList.add("hidden");
    }, 8000);
  }

  function hideError(): void {
    errorBanner.classList.add("hidden");
  }

  // --- Body Filters: helpers ---

  function parseScope(line: string): ParsedScope | null {
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

  function isEligible(parsed: ParsedScope | null): boolean {
    if (!parsed) return false;
    return ELIGIBLE_METHODS.indexOf(parsed.method) !== -1;
  }

  function getEligibleScopes(): string[] {
    const lines = scopesTextarea.value.split("\n");
    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const p = parseScope(lines[i]);
      if (isEligible(p)) result.push(p!.raw);
    }
    return result;
  }

  function getScopesWithFilters(): string[] {
    const keys = Object.keys(bodyFiltersData);
    const result: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      if (bodyFiltersData[keys[i]] && bodyFiltersData[keys[i]].length > 0) {
        result.push(keys[i]);
      }
    }
    return result;
  }

  function truncatePath(raw: string, maxLen: number): string {
    if (raw.length <= maxLen) return raw;
    const idx = raw.indexOf(":");
    if (idx === -1) return raw.substring(0, maxLen) + "\u2026";
    const method = raw.substring(0, idx + 1);
    const path = raw.substring(idx + 1);
    const budget = maxLen - method.length - 3;
    if (budget < 5) return raw.substring(0, maxLen) + "\u2026";
    return method + "\u2026" + path.substring(path.length - budget);
  }

  function filterSummary(scopeKey: string): string {
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

  // --- Body Filters: Phase 1 - detection ---

  function updateBodyFiltersVisibility(): void {
    const eligible = getEligibleScopes();
    const allFromTextarea = [...eligible];
    const withFilters = getScopesWithFilters();

    for (let i = 0; i < withFilters.length; i++) {
      if (allFromTextarea.indexOf(withFilters[i]) === -1) {
        allFromTextarea.push(withFilters[i]);
      }
    }

    let hasEligibleWithoutFilters = false;
    for (let j = 0; j < eligible.length; j++) {
      if (withFilters.indexOf(eligible[j]) === -1) {
        hasEligibleWithoutFilters = true;
        break;
      }
    }

    btnAddBodyFilters.classList.toggle("hidden", !hasEligibleWithoutFilters);
    renderChips();
    if (bodyFiltersPanel.classList.contains("hidden")) return;
    renderBodyFiltersPanel();
  }

  scopesTextarea.addEventListener("input", updateBodyFiltersVisibility);

  // --- Body Filters: Phase 3 - chips ---

  function renderChips(): void {
    const withFilters = getScopesWithFilters();
    scopeChips.textContent = "";
    if (withFilters.length === 0) {
      scopeChips.classList.add("hidden");
      return;
    }
    scopeChips.classList.remove("hidden");
    for (let i = 0; i < withFilters.length; i++) {
      (function (scopeKey: string) {
        const chip = document.createElement("div");
        chip.className =
          "flex items-center gap-2 rounded-md border border-fgp-200 bg-fgp-50 px-3 py-2 text-sm font-mono dark:bg-fgp-900/50 dark:border-fgp-700";

        const textSpan = document.createElement("span");
        textSpan.className = "flex-1 truncate text-gray-800 dark:text-gray-200";
        const summary = filterSummary(scopeKey);
        textSpan.textContent = truncatePath(scopeKey, 50) +
          (summary ? " \u2192 " + summary : "");
        textSpan.title = scopeKey + (summary ? " \u2192 " + summary : "");

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className =
          "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-fgp-600 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:text-fgp-400 dark:hover:bg-fgp-800";
        btnEdit.textContent = "\u00e9diter";
        btnEdit.setAttribute("aria-label", "\u00c9diter les filtres de " + scopeKey);
        btnEdit.addEventListener("click", function () {
          bodyFiltersPanel.classList.remove("hidden");
          renderBodyFiltersPanel();
          const target = document.getElementById(
            "bf-scope-" + scopeKey.replace(/[^a-zA-Z0-9]/g, "_"),
          );
          if (target) {
            expandScope(scopeKey);
            target.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });

        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className =
          "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/30";
        btnRemove.textContent = "\u00d7";
        btnRemove.setAttribute(
          "aria-label",
          "Supprimer le scope " + scopeKey + " et ses filtres",
        );
        btnRemove.addEventListener("click", function () {
          delete bodyFiltersData[scopeKey];
          const lines = scopesTextarea.value.split("\n");
          const kept: string[] = [];
          for (let k = 0; k < lines.length; k++) {
            if (lines[k].trim() !== scopeKey) kept.push(lines[k]);
          }
          scopesTextarea.value = kept.join("\n");
          updateBodyFiltersVisibility();
        });

        chip.appendChild(textSpan);
        chip.appendChild(btnEdit);
        chip.appendChild(btnRemove);
        scopeChips.appendChild(chip);
      })(withFilters[i]);
    }
  }

  // --- Body Filters: Phase 2 - panel ---

  let expandedScopes: Record<string, boolean> = {};

  function expandScope(scopeKey: string): void {
    expandedScopes[scopeKey] = true;
    renderBodyFiltersPanel();
  }

  function collapseScope(scopeKey: string): void {
    expandedScopes[scopeKey] = false;
    renderBodyFiltersPanel();
  }

  btnAddBodyFilters.addEventListener("click", function () {
    bodyFiltersPanel.classList.remove("hidden");
    renderBodyFiltersPanel();
    bodyFiltersPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  btnCloseBodyFilters.addEventListener("click", function () {
    bodyFiltersPanel.classList.add("hidden");
  });

  function createOption(value: string, label: string, selected: boolean): HTMLOptionElement {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (selected) opt.selected = true;
    return opt;
  }

  function populateSelect(
    select: HTMLSelectElement,
    options: SelectOption[],
    currentValue: string,
  ): void {
    for (let i = 0; i < options.length; i++) {
      select.appendChild(
        createOption(options[i].value, options[i].label, currentValue === options[i].value),
      );
    }
  }

  function renderConditionNotBlock(
    cond: AndCondition,
    parent: HTMLElement,
  ): void {
    if (!cond.notInnerType) cond.notInnerType = "any";
    if (!cond.notInnerSubType) cond.notInnerSubType = "text";
    if (cond.notInnerValue === undefined || cond.notInnerValue === null) cond.notInnerValue = "";

    const condNotWrapper = document.createElement("div");
    condNotWrapper.className =
      "mt-1 ml-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:bg-amber-900/10 dark:border-amber-700/50";
    const condNotTitle = document.createElement("span");
    condNotTitle.className = "block text-xs font-medium text-amber-700 dark:text-amber-400";
    condNotTitle.textContent = "Exclure :";
    condNotWrapper.appendChild(condNotTitle);

    const condNotTypeSelect = document.createElement("select");
    condNotTypeSelect.className =
      "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
    populateSelect(condNotTypeSelect, [
      { value: "any", label: "Valeur exacte" },
      { value: "stringwildcard", label: "Pattern (wildcard)" },
    ], cond.notInnerType);
    condNotTypeSelect.addEventListener("change", function () {
      cond.notInnerType = condNotTypeSelect.value;
      if (condNotTypeSelect.value === "any") {
        if (!cond.notInnerSubType) cond.notInnerSubType = "text";
      } else {
        cond.notInnerSubType = "text";
      }
      cond.notInnerValue = "";
      renderBodyFiltersPanel();
      renderChips();
    });
    condNotWrapper.appendChild(condNotTypeSelect);

    const condNotValRow = document.createElement("div");
    condNotValRow.className = "flex gap-1 mt-1";
    if (cond.notInnerType === "any") {
      const cnSubType = cond.notInnerSubType || "text";
      const cnSubSelect = document.createElement("select");
      cnSubSelect.className =
        "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
      populateSelect(cnSubSelect, [
        { value: "text", label: "Texte" },
        { value: "number", label: "Nombre" },
        { value: "boolean", label: "Bool\u00e9en" },
        { value: "null", label: "Null" },
      ], cnSubType);
      cnSubSelect.addEventListener("change", function () {
        cond.notInnerSubType = cnSubSelect.value;
        if (cnSubSelect.value === "boolean") {
          cond.notInnerValue = "true";
        } else if (cnSubSelect.value === "null") {
          cond.notInnerValue = "";
        }
        renderBodyFiltersPanel();
        renderChips();
      });
      condNotValRow.appendChild(cnSubSelect);
      if (cnSubType === "boolean") {
        const cnBoolSel = document.createElement("select");
        cnBoolSel.className =
          "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
        cnBoolSel.appendChild(createOption("true", "true", cond.notInnerValue === "true"));
        cnBoolSel.appendChild(createOption("false", "false", cond.notInnerValue === "false"));
        cnBoolSel.addEventListener("change", function () {
          cond.notInnerValue = cnBoolSel.value;
          renderChips();
        });
        condNotValRow.appendChild(cnBoolSel);
      } else if (cnSubType === "null") {
        const cnNullSpan = document.createElement("span");
        cnNullSpan.className =
          "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
        cnNullSpan.textContent = "null";
        condNotValRow.appendChild(cnNullSpan);
      } else {
        const cnValInput = document.createElement("input");
        cnValInput.value = cond.notInnerValue || "";
        if (cnSubType === "number") {
          cnValInput.type = "number";
          cnValInput.step = "any";
          cnValInput.placeholder = "42";
        } else {
          cnValInput.type = "text";
          cnValInput.placeholder = "develop";
        }
        cnValInput.className =
          "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
        cnValInput.addEventListener("input", function () {
          cond.notInnerValue = cnValInput.value;
          renderChips();
        });
        condNotValRow.appendChild(cnValInput);
      }
    } else {
      const cnPatInput = document.createElement("input");
      cnPatInput.type = "text";
      cnPatInput.value = cond.notInnerValue || "";
      cnPatInput.placeholder = "release/broken*";
      cnPatInput.className =
        "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
      cnPatInput.addEventListener("input", function () {
        cond.notInnerValue = cnPatInput.value;
        renderChips();
      });
      condNotValRow.appendChild(cnPatInput);
    }
    condNotWrapper.appendChild(condNotValRow);
    parent.appendChild(condNotWrapper);
  }

  function renderAndBlock(
    filterData: FilterData,
    parent: HTMLElement,
  ): void {
    if (!filterData.andConditions) filterData.andConditions = [];
    const andConditions = filterData.andConditions;

    const andWrapper = document.createElement("div");
    andWrapper.className =
      "mt-2 ml-3 rounded-md border border-sky-200 bg-sky-50/50 p-3 space-y-2 dark:bg-sky-900/10 dark:border-sky-700/50";
    andWrapper.setAttribute("role", "group");
    andWrapper.setAttribute("aria-label", "Groupe de conditions ET");

    const andTitle = document.createElement("span");
    andTitle.className = "block text-xs font-medium text-sky-700 dark:text-sky-400";
    andTitle.textContent = "ET";
    andWrapper.appendChild(andTitle);

    if (andConditions.length === 0) {
      const emptyMsg = document.createElement("p");
      emptyMsg.className = "text-xs text-gray-400 dark:text-gray-500 py-1";
      emptyMsg.textContent = "(aucune condition)";
      andWrapper.appendChild(emptyMsg);
    }

    for (let ci = 0; ci < andConditions.length; ci++) {
      (function (condIndex: number) {
        const cond = andConditions[condIndex];

        if (condIndex > 0) {
          const etLabel = document.createElement("div");
          etLabel.className =
            "text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center py-1";
          etLabel.textContent = "ET";
          etLabel.setAttribute("aria-hidden", "true");
          andWrapper.appendChild(etLabel);
        }

        const condBlock = document.createElement("div");
        condBlock.className = "space-y-1";
        condBlock.setAttribute(
          "aria-label",
          "Condition " + (condIndex + 1) + " sur " + andConditions.length,
        );

        const condHeader = document.createElement("div");
        condHeader.className =
          "flex items-center justify-between text-xs text-gray-600 dark:text-gray-400";
        const condTitle = document.createElement("span");
        condTitle.textContent = "Condition " + (condIndex + 1);
        const btnRemoveCond = document.createElement("button");
        btnRemoveCond.type = "button";
        btnRemoveCond.className =
          "text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 text-xs";
        btnRemoveCond.textContent = "\u00d7";
        btnRemoveCond.setAttribute("aria-label", "Supprimer la condition " + (condIndex + 1));
        btnRemoveCond.addEventListener("click", function () {
          andConditions.splice(condIndex, 1);
          renderBodyFiltersPanel();
          renderChips();
        });
        condHeader.appendChild(condTitle);
        condHeader.appendChild(btnRemoveCond);
        condBlock.appendChild(condHeader);

        const condTypeSelect = document.createElement("select");
        condTypeSelect.className =
          "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
        populateSelect(condTypeSelect, [
          { value: "any", label: "Valeur exacte" },
          { value: "stringwildcard", label: "Pattern (wildcard)" },
          { value: "wildcard", label: "Existe (toute valeur)" },
          { value: "not", label: "Exclure (not)" },
        ], cond.conditionType);
        condTypeSelect.addEventListener("change", function () {
          cond.conditionType = condTypeSelect.value;
          cond.value = "";
          cond.valueSubType = "text";
          if (cond.conditionType === "not") {
            cond.notInnerType = "any";
            cond.notInnerSubType = "text";
            cond.notInnerValue = "";
          }
          renderBodyFiltersPanel();
          renderChips();
        });
        condBlock.appendChild(condTypeSelect);

        if (cond.conditionType === "any") {
          const condSubType = cond.valueSubType || "text";
          const condValRow = document.createElement("div");
          condValRow.className = "flex gap-1";
          const condSubSelect = document.createElement("select");
          condSubSelect.className =
            "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
          populateSelect(condSubSelect, [
            { value: "text", label: "Texte" },
            { value: "number", label: "Nombre" },
            { value: "boolean", label: "Bool\u00e9en" },
            { value: "null", label: "Null" },
          ], condSubType);
          condSubSelect.addEventListener("change", function () {
            cond.valueSubType = condSubSelect.value;
            if (condSubSelect.value === "boolean") {
              cond.value = "true";
            } else if (condSubSelect.value === "null") {
              cond.value = "";
            } else if (condSubSelect.value === "number") {
              const pn = Number(cond.value);
              if (isNaN(pn)) cond.value = "";
            }
            renderBodyFiltersPanel();
            renderChips();
          });
          condValRow.appendChild(condSubSelect);

          if (condSubType === "boolean") {
            const condBoolSel = document.createElement("select");
            condBoolSel.className =
              "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
            condBoolSel.appendChild(createOption("true", "true", cond.value === "true"));
            condBoolSel.appendChild(createOption("false", "false", cond.value === "false"));
            condBoolSel.addEventListener("change", function () {
              cond.value = condBoolSel.value;
              renderChips();
            });
            condValRow.appendChild(condBoolSel);
          } else if (condSubType === "null") {
            const condNullSpan = document.createElement("span");
            condNullSpan.className =
              "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
            condNullSpan.textContent = "null";
            condValRow.appendChild(condNullSpan);
          } else {
            const condValInput = document.createElement("input");
            condValInput.value = cond.value || "";
            if (condSubType === "number") {
              condValInput.type = "number";
              condValInput.step = "any";
              condValInput.placeholder = "42";
            } else {
              condValInput.type = "text";
              condValInput.placeholder = "master";
            }
            condValInput.className =
              "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
            condValInput.addEventListener("input", function () {
              cond.value = condValInput.value;
              renderChips();
            });
            condValRow.appendChild(condValInput);
          }
          condBlock.appendChild(condValRow);
        } else if (cond.conditionType === "stringwildcard") {
          const condSwInput = document.createElement("input");
          condSwInput.type = "text";
          condSwInput.value = cond.value || "";
          condSwInput.placeholder = "release/*";
          condSwInput.className =
            "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
          condSwInput.addEventListener("input", function () {
            cond.value = condSwInput.value;
            renderChips();
          });
          condBlock.appendChild(condSwInput);
        } else if (cond.conditionType === "not") {
          renderConditionNotBlock(cond, condBlock);
        }

        andWrapper.appendChild(condBlock);
      })(ci);
    }

    const btnAddCond = document.createElement("button");
    btnAddCond.type = "button";
    btnAddCond.className =
      "text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200";
    btnAddCond.textContent = "+ Ajouter une condition";
    btnAddCond.setAttribute("aria-label", "Ajouter une condition au groupe ET");
    btnAddCond.addEventListener("click", function () {
      andConditions.push({
        id: nextFilterId++,
        conditionType: "any",
        value: "",
        valueSubType: "text",
        notInnerType: null,
        notInnerSubType: null,
        notInnerValue: null,
      });
      renderBodyFiltersPanel();
      renderChips();
    });
    andWrapper.appendChild(btnAddCond);
    parent.appendChild(andWrapper);
  }

  function renderNotBlock(
    filterData: FilterData,
    parent: HTMLElement,
  ): void {
    if (!filterData.notInnerType) filterData.notInnerType = "any";
    if (!filterData.notInnerSubType) filterData.notInnerSubType = "text";
    if (filterData.notInnerValue === undefined) filterData.notInnerValue = "";

    const notWrapper = document.createElement("div");
    notWrapper.className =
      "mt-2 ml-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:bg-amber-900/10 dark:border-amber-700/50";

    const notTitle = document.createElement("span");
    notTitle.className = "block text-xs font-medium text-amber-700 dark:text-amber-400";
    notTitle.textContent = "Exclure :";
    notWrapper.appendChild(notTitle);

    const notTypeId = "bf-not-type-" + filterData.id;
    const notTypeLabel = document.createElement("label");
    notTypeLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400";
    notTypeLabel.setAttribute("for", notTypeId);
    notTypeLabel.textContent = "Type";
    const notTypeSelect = document.createElement("select");
    notTypeSelect.id = notTypeId;
    notTypeSelect.className =
      "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
    populateSelect(notTypeSelect, [
      { value: "any", label: "Valeur exacte" },
      { value: "stringwildcard", label: "Pattern (wildcard)" },
    ], filterData.notInnerType);
    notTypeSelect.addEventListener("change", function () {
      filterData.notInnerType = notTypeSelect.value;
      if (notTypeSelect.value === "any") {
        if (!filterData.notInnerSubType) filterData.notInnerSubType = "text";
      } else {
        filterData.notInnerSubType = "text";
      }
      filterData.notInnerValue = "";
      renderBodyFiltersPanel();
      renderChips();
    });
    notWrapper.appendChild(notTypeLabel);
    notWrapper.appendChild(notTypeSelect);

    const notIsExact = filterData.notInnerType === "any";

    const notValLabel = document.createElement("div");
    notValLabel.className = "text-xs text-gray-500 dark:text-gray-400 mt-2";
    notValLabel.textContent = "Valeurs :";
    notWrapper.appendChild(notValLabel);

    const notValRow = document.createElement("div");
    notValRow.className = "flex gap-1 mt-1";

    const notValInputId = "bf-not-val-" + filterData.id;

    if (notIsExact) {
      const notSubType = filterData.notInnerSubType || "text";
      const notSubTypeSelect = document.createElement("select");
      notSubTypeSelect.className =
        "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
      notSubTypeSelect.setAttribute("aria-label", "Type de la valeur exclue");
      populateSelect(notSubTypeSelect, [
        { value: "text", label: "Texte" },
        { value: "number", label: "Nombre" },
        { value: "boolean", label: "Bool\u00e9en" },
        { value: "null", label: "Null" },
      ], notSubType);
      notSubTypeSelect.addEventListener("change", function () {
        filterData.notInnerSubType = notSubTypeSelect.value;
        if (notSubTypeSelect.value === "boolean") {
          filterData.notInnerValue = "true";
        } else if (notSubTypeSelect.value === "null") {
          filterData.notInnerValue = "";
        } else if (notSubTypeSelect.value === "number") {
          const parsedN = Number(filterData.notInnerValue);
          if (isNaN(parsedN)) filterData.notInnerValue = "";
        }
        renderBodyFiltersPanel();
        renderChips();
      });
      notValRow.appendChild(notSubTypeSelect);

      if (notSubType === "boolean") {
        const notBoolSelect = document.createElement("select");
        notBoolSelect.id = notValInputId;
        notBoolSelect.className =
          "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
        notBoolSelect.setAttribute("aria-label", "Valeur bool\u00e9enne exclue");
        notBoolSelect.appendChild(
          createOption("true", "true", filterData.notInnerValue === "true"),
        );
        notBoolSelect.appendChild(
          createOption("false", "false", filterData.notInnerValue === "false"),
        );
        notBoolSelect.addEventListener("change", function () {
          filterData.notInnerValue = notBoolSelect.value;
          renderChips();
        });
        notValRow.appendChild(notBoolSelect);
      } else if (notSubType === "null") {
        const notNullSpan = document.createElement("span");
        notNullSpan.className =
          "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
        notNullSpan.textContent = "null";
        notValRow.appendChild(notNullSpan);
      } else {
        const notValInput = document.createElement("input");
        notValInput.id = notValInputId;
        notValInput.value = filterData.notInnerValue || "";
        if (notSubType === "number") {
          notValInput.type = "number";
          notValInput.step = "any";
          notValInput.placeholder = "42";
        } else {
          notValInput.type = "text";
          notValInput.placeholder = "develop";
        }
        notValInput.className =
          "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
        notValInput.setAttribute("aria-label", "Valeur exclue");
        notValInput.addEventListener("input", function () {
          filterData.notInnerValue = notValInput.value;
          renderChips();
        });
        notValRow.appendChild(notValInput);
      }
    } else {
      const notPatInput = document.createElement("input");
      notPatInput.id = notValInputId;
      notPatInput.type = "text";
      notPatInput.value = filterData.notInnerValue || "";
      notPatInput.placeholder = "release/broken*";
      notPatInput.className =
        "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
      notPatInput.setAttribute("aria-label", "Pattern exclu");
      notPatInput.addEventListener("input", function () {
        filterData.notInnerValue = notPatInput.value;
        renderChips();
      });
      notValRow.appendChild(notPatInput);
    }

    notWrapper.appendChild(notValRow);
    parent.appendChild(notWrapper);
  }

  function renderValuesBlock(
    filterData: FilterData,
    filterIndex: number,
    parent: HTMLElement,
  ): void {
    if (!filterData.valueSubTypes) filterData.valueSubTypes = [];

    const valuesLabel = document.createElement("div");
    valuesLabel.className = "text-xs text-gray-500 dark:text-gray-400 mt-2";
    valuesLabel.textContent = "Valeurs (une des suivantes) :";
    parent.appendChild(valuesLabel);

    const valuesContainer = document.createElement("div");
    valuesContainer.className = "space-y-1 mt-1";

    const isExactType = filterData.filterType === "any";

    for (let vi = 0; vi < filterData.values.length; vi++) {
      (function (valIndex: number) {
        const subType = filterData.valueSubTypes[valIndex] || "text";
        const valRow = document.createElement("div");
        valRow.className = "flex gap-1";
        const valInputId = "bf-val-" + filterData.id + "-" + valIndex;

        if (isExactType) {
          const subTypeSelectId = "bf-subtype-" + filterData.id + "-" + valIndex;
          const subTypeSelect = document.createElement("select");
          subTypeSelect.id = subTypeSelectId;
          subTypeSelect.className =
            "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
          subTypeSelect.setAttribute("aria-label", "Type de la valeur " + (valIndex + 1));
          populateSelect(subTypeSelect, [
            { value: "text", label: "Texte" },
            { value: "number", label: "Nombre" },
            { value: "boolean", label: "Bool\u00e9en" },
            { value: "null", label: "Null" },
          ], subType);
          subTypeSelect.addEventListener("change", function () {
            filterData.valueSubTypes[valIndex] = subTypeSelect.value;
            if (subTypeSelect.value === "boolean") {
              filterData.values[valIndex] = "true";
            } else if (subTypeSelect.value === "null") {
              filterData.values[valIndex] = "";
            } else if (subTypeSelect.value === "number") {
              const parsed = Number(filterData.values[valIndex]);
              if (isNaN(parsed)) filterData.values[valIndex] = "";
            }
            renderBodyFiltersPanel();
            renderChips();
          });
          valRow.appendChild(subTypeSelect);
        }

        if (isExactType && subType === "boolean") {
          const boolSelect = document.createElement("select");
          boolSelect.id = valInputId;
          boolSelect.className =
            "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
          boolSelect.setAttribute(
            "aria-label",
            "Valeur " + (valIndex + 1) + " du filtre " + (filterIndex + 1),
          );
          boolSelect.appendChild(
            createOption("true", "true", filterData.values[valIndex] === "true"),
          );
          boolSelect.appendChild(
            createOption("false", "false", filterData.values[valIndex] === "false"),
          );
          boolSelect.addEventListener("change", function () {
            filterData.values[valIndex] = boolSelect.value;
            renderChips();
          });
          valRow.appendChild(boolSelect);
        } else if (isExactType && subType === "null") {
          const nullSpan = document.createElement("span");
          nullSpan.className =
            "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
          nullSpan.textContent = "null";
          valRow.appendChild(nullSpan);
        } else {
          const valInput = document.createElement("input");
          valInput.id = valInputId;
          valInput.value = filterData.values[valIndex] || "";
          if (isExactType && subType === "number") {
            valInput.type = "number";
            valInput.step = "any";
            valInput.placeholder = "42";
          } else {
            valInput.type = "text";
            valInput.placeholder = filterData.filterType === "stringwildcard"
              ? "release/*"
              : "master";
          }
          valInput.className =
            "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
          valInput.setAttribute(
            "aria-label",
            "Valeur " + (valIndex + 1) + " du filtre " + (filterIndex + 1),
          );
          valInput.addEventListener("input", function () {
            filterData.values[valIndex] = valInput.value;
            renderChips();
          });
          valRow.appendChild(valInput);
        }

        const btnRemoveVal = document.createElement("button");
        btnRemoveVal.type = "button";
        btnRemoveVal.className =
          "flex-shrink-0 rounded px-2 py-1 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/30";
        btnRemoveVal.textContent = "\u00d7";
        btnRemoveVal.setAttribute("aria-label", "Supprimer la valeur " + (valIndex + 1));
        btnRemoveVal.addEventListener("click", function () {
          filterData.values.splice(valIndex, 1);
          filterData.valueSubTypes.splice(valIndex, 1);
          if (filterData.values.length === 0) {
            filterData.values = [""];
            filterData.valueSubTypes = ["text"];
          }
          renderBodyFiltersPanel();
          renderChips();
        });

        valRow.appendChild(btnRemoveVal);
        valuesContainer.appendChild(valRow);
      })(vi);
    }

    parent.appendChild(valuesContainer);

    const btnAddVal = document.createElement("button");
    btnAddVal.type = "button";
    btnAddVal.className =
      "mt-1 text-xs text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
    btnAddVal.textContent = "+ Ajouter une valeur";
    btnAddVal.addEventListener("click", function () {
      filterData.values.push("");
      if (!filterData.valueSubTypes) filterData.valueSubTypes = [];
      filterData.valueSubTypes.push("text");
      renderBodyFiltersPanel();
      const newIdx = filterData.values.length - 1;
      const newInput = document.getElementById("bf-val-" + filterData.id + "-" + newIdx);
      if (newInput) newInput.focus();
    });
    parent.appendChild(btnAddVal);
  }

  function renderFilterBlock(
    scopeKey: string,
    scopeFilters: FilterData[],
    filterIndex: number,
    safeId: string,
    content: HTMLElement,
  ): void {
    const filterData = scopeFilters[filterIndex];

    if (filterIndex > 0) {
      const andLabel = document.createElement("div");
      andLabel.className = "text-center py-1";
      const andSpan = document.createElement("span");
      andSpan.className =
        "text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider";
      andSpan.textContent = "ET";
      andSpan.setAttribute("aria-label", "et aussi");
      andLabel.appendChild(andSpan);
      content.appendChild(andLabel);
    }

    const filterBlock = document.createElement("div");
    filterBlock.className =
      "rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:bg-gray-700/50 dark:border-gray-600";

    const filterHeader = document.createElement("div");
    filterHeader.className = "flex items-center justify-between";
    const filterTitle = document.createElement("span");
    filterTitle.className = "text-xs font-medium text-gray-500 dark:text-gray-400";
    filterTitle.textContent = "Filtre " + (filterIndex + 1);
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className =
      "text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 rounded p-0.5";
    btnDelete.setAttribute("aria-label", "Supprimer le filtre " + (filterIndex + 1));
    btnDelete.textContent = "\uD83D\uDDD1";
    btnDelete.addEventListener("click", function () {
      scopeFilters.splice(filterIndex, 1);
      if (scopeFilters.length === 0) {
        delete bodyFiltersData[scopeKey];
      }
      updateBodyFiltersVisibility();
      const addBtn = document.getElementById("bf-add-" + safeId);
      if (addBtn) addBtn.focus();
    });
    filterHeader.appendChild(filterTitle);
    filterHeader.appendChild(btnDelete);
    filterBlock.appendChild(filterHeader);

    const fieldId = "bf-field-" + filterData.id;
    const fieldLabel = document.createElement("label");
    fieldLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400";
    fieldLabel.setAttribute("for", fieldId);
    fieldLabel.textContent = "Champ (dot-path)";
    const fieldInput = document.createElement("input");
    fieldInput.type = "text";
    fieldInput.id = fieldId;
    fieldInput.value = filterData.objectPath || "";
    fieldInput.placeholder = "deployment.git_ref";
    fieldInput.className =
      "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
    fieldInput.addEventListener("input", function () {
      filterData.objectPath = fieldInput.value;
      renderChips();
    });
    filterBlock.appendChild(fieldLabel);
    filterBlock.appendChild(fieldInput);

    const typeId = "bf-type-" + filterData.id;
    const typeLabel = document.createElement("label");
    typeLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400 mt-2";
    typeLabel.setAttribute("for", typeId);
    typeLabel.textContent = "Type";
    const typeSelect = document.createElement("select");
    typeSelect.id = typeId;
    typeSelect.className =
      "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
    populateSelect(typeSelect, [
      { value: "any", label: "Valeur exacte" },
      { value: "stringwildcard", label: "Pattern (wildcard)" },
      { value: "wildcard", label: "Existe (toute valeur)" },
      { value: "not", label: "Exclure (not)" },
      { value: "and", label: "Toutes les conditions (ET)" },
    ], filterData.filterType);
    typeSelect.addEventListener("change", function () {
      filterData.filterType = typeSelect.value;
      if (filterData.filterType === "wildcard") {
        filterData.values = [];
        filterData.valueSubTypes = [];
      } else if (filterData.filterType === "not") {
        filterData.values = [];
        filterData.valueSubTypes = [];
        if (!filterData.notInnerType) filterData.notInnerType = "any";
        if (!filterData.notInnerSubType) filterData.notInnerSubType = "text";
        if (filterData.notInnerValue === undefined) filterData.notInnerValue = "";
      } else if (filterData.filterType === "and") {
        filterData.values = [];
        filterData.valueSubTypes = [];
        if (!filterData.andConditions) filterData.andConditions = [];
      } else if (filterData.values.length === 0) {
        filterData.values = [""];
        filterData.valueSubTypes = ["text"];
      }
      renderBodyFiltersPanel();
      renderChips();
    });
    filterBlock.appendChild(typeLabel);
    filterBlock.appendChild(typeSelect);

    if (filterData.filterType === "not") {
      renderNotBlock(filterData, filterBlock);
    }

    if (filterData.filterType === "and") {
      renderAndBlock(filterData, filterBlock);
    }

    if (
      filterData.filterType !== "wildcard" &&
      filterData.filterType !== "not" &&
      filterData.filterType !== "and"
    ) {
      renderValuesBlock(filterData, filterIndex, filterBlock);
    }

    content.appendChild(filterBlock);
  }

  function renderBodyFiltersPanel(): void {
    const eligible = getEligibleScopes();
    const withFilters = getScopesWithFilters();
    const allScopes: string[] = [];
    for (let i = 0; i < eligible.length; i++) {
      if (allScopes.indexOf(eligible[i]) === -1) allScopes.push(eligible[i]);
    }
    for (let j = 0; j < withFilters.length; j++) {
      if (allScopes.indexOf(withFilters[j]) === -1) {
        allScopes.push(withFilters[j]);
      }
    }

    bodyFiltersList.textContent = "";

    if (allScopes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-sm text-gray-400 dark:text-gray-500";
      empty.textContent = "Aucun scope \u00e9ligible (POST, PUT, PATCH).";
      bodyFiltersList.appendChild(empty);
      return;
    }

    for (let s = 0; s < allScopes.length; s++) {
      (function (scopeKey: string) {
        const inTextarea = eligible.indexOf(scopeKey) !== -1;
        const filters = bodyFiltersData[scopeKey] || [];
        const filterCount = filters.length;
        const isExpanded = !!expandedScopes[scopeKey];
        const safeId = "bf-scope-" + scopeKey.replace(/[^a-zA-Z0-9]/g, "_");
        const contentId = safeId + "-content";

        const row = document.createElement("div");
        row.id = safeId;

        const header = document.createElement("button");
        header.type = "button";
        header.className =
          "w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-mono cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-left" +
          (isExpanded
            ? " bg-fgp-50 dark:bg-fgp-900/30 border-l-2 border-fgp-500"
            : " text-gray-700 dark:text-gray-300");
        header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        header.setAttribute("aria-controls", contentId);

        if (!inTextarea) {
          header.className += " opacity-50";
          header.title = "Scope introuvable dans le textarea";
        }

        const chevron = document.createElement("span");
        chevron.className = "flex-shrink-0 text-xs transition-transform" +
          (isExpanded ? " rotate-90" : "");
        chevron.textContent = "\u25b6";
        chevron.setAttribute("aria-hidden", "true");

        const label = document.createElement("span");
        label.className = "flex-1 truncate";
        label.textContent = scopeKey;

        const badge = document.createElement("span");
        badge.className =
          "text-xs text-fgp-600 dark:text-fgp-300 font-medium flex items-center gap-1";
        badge.textContent = filterCount + " filtre" + (filterCount > 1 ? "s" : "");

        if (filterCount > 0) {
          const dot = document.createElement("span");
          dot.className = "w-2 h-2 rounded-full bg-fgp-500 inline-block";
          dot.setAttribute("aria-hidden", "true");
          badge.appendChild(dot);
        }

        header.appendChild(chevron);
        header.appendChild(label);
        header.appendChild(badge);

        header.addEventListener("click", function () {
          if (isExpanded) collapseScope(scopeKey);
          else expandScope(scopeKey);
        });
        header.addEventListener("keydown", function (ev: KeyboardEvent) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            if (isExpanded) collapseScope(scopeKey);
            else expandScope(scopeKey);
          }
        });

        row.appendChild(header);

        if (isExpanded) {
          const content = document.createElement("div");
          content.id = contentId;
          content.className =
            "ml-4 mt-2 mb-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4";

          if (!bodyFiltersData[scopeKey]) {
            bodyFiltersData[scopeKey] = [];
          }
          const scopeFilters = bodyFiltersData[scopeKey];

          for (let fi = 0; fi < scopeFilters.length; fi++) {
            renderFilterBlock(scopeKey, scopeFilters, fi, safeId, content);
          }

          const btnAddFilter = document.createElement("button");
          btnAddFilter.type = "button";
          btnAddFilter.id = "bf-add-" + safeId;
          btnAddFilter.className =
            "mt-2 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
          btnAddFilter.textContent = "+ Ajouter un filtre";
          btnAddFilter.addEventListener("click", function () {
            const newFilter: FilterData = {
              id: nextFilterId++,
              objectPath: "",
              filterType: "any",
              values: [""],
              valueSubTypes: ["text"],
            };
            if (!bodyFiltersData[scopeKey]) bodyFiltersData[scopeKey] = [];
            bodyFiltersData[scopeKey].push(newFilter);
            renderBodyFiltersPanel();
            renderChips();
            const newFieldInput = document.getElementById("bf-field-" + newFilter.id);
            if (newFieldInput) newFieldInput.focus();
          });
          content.appendChild(btnAddFilter);
          row.appendChild(content);
        }

        bodyFiltersList.appendChild(row);
      })(allScopes[s]);
    }
  }

  // --- Presets ---

  const btnPresetScalingo = assertElement("btn-preset-scalingo", HTMLButtonElement);
  btnPresetScalingo.addEventListener("click", function () {
    targetInput.value = "https://api.osc-fr1.scalingo.com";
    authSelect.value = "scalingo-exchange";
    authHeaderName.classList.add("hidden");
    btnLoadApps.classList.remove("hidden");
    scopesTextarea.value = "GET:/v1/apps/*";
    tokenInput.placeholder = "tk-us-...";
    updateBodyFiltersVisibility();
  });

  const btnPresetClear = assertElement("btn-preset-clear", HTMLButtonElement);
  btnPresetClear.addEventListener("click", function () {
    targetInput.value = "";
    authSelect.value = "bearer";
    authHeaderName.classList.add("hidden");
    btnLoadApps.classList.add("hidden");
    appsSection.classList.add("hidden");
    scopesTextarea.value = "";
    tokenInput.placeholder = "Votre cl\u00e9 API";
    bodyFiltersData = {};
    expandedScopes = {};
    bodyFiltersPanel.classList.add("hidden");
    updateBodyFiltersVisibility();
  });

  // --- Auth mode toggle ---

  authSelect.addEventListener("change", function () {
    if (authSelect.value === "header:") {
      authHeaderName.classList.remove("hidden");
    } else {
      authHeaderName.classList.add("hidden");
    }
    btnLoadApps.classList.toggle("hidden", authSelect.value !== "scalingo-exchange");
  });

  // --- Load apps (Scalingo helper) ---

  btnLoadApps.addEventListener("click", async function () {
    const token = tokenInput.value.trim();
    if (!token) {
      showError("Veuillez saisir un token.");
      return;
    }

    btnLoadApps.disabled = true;
    btnLoadApps.textContent = "Chargement\u2026";
    hideError();

    try {
      const res = await fetch("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(function () {
          return {} as Record<string, string>;
        });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      const data = await res.json();
      const apps: string[] = data.apps || [];
      renderApps(apps);
    } catch (e) {
      showError("Impossible de charger les apps : " + (e as Error).message);
    } finally {
      btnLoadApps.disabled = false;
      btnLoadApps.textContent = "Charger les apps";
    }
  });

  function renderApps(apps: string[]): void {
    appsList.textContent = "";
    apps.forEach(function (name: string) {
      const label = document.createElement("label");
      label.className =
        "flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      cb.className = "rounded border-gray-300 text-fgp-600 focus:ring-fgp-500";
      cb.addEventListener("change", function () {
        updateScopesFromApps();
      });
      const span = document.createElement("span");
      span.textContent = name;
      label.appendChild(cb);
      label.appendChild(span);
      appsList.appendChild(label);
    });
    appsSection.classList.remove("hidden");
  }

  function updateScopesFromApps(): void {
    const checked = appsList.querySelectorAll<HTMLInputElement>("input:checked");
    const lines: string[] = [];
    checked.forEach(function (cb) {
      lines.push("GET:/v1/apps/" + cb.value + "/*");
    });
    if (lines.length > 0) {
      lines.unshift("GET:/v1/apps");
    }
    scopesTextarea.value = lines.join("\n");
    updateBodyFiltersVisibility();
  }

  // --- TTL ---

  document.querySelectorAll<HTMLInputElement>("input[name=ttl]").forEach(function (radio) {
    radio.addEventListener("change", function () {
      customTtlWrapper.classList.toggle("hidden", radio.value !== "custom");
      ttlWarning.classList.toggle("hidden", radio.value !== "0");
    });
  });

  // --- Phase 5: Serialization ---

  function buildScopes(): SerializedScope[] {
    const textareaScopes = scopesTextarea.value
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    const result: SerializedScope[] = [];

    const withFilters = getScopesWithFilters();

    for (let i = 0; i < withFilters.length; i++) {
      const scopeKey = withFilters[i];
      const parsed = parseScope(scopeKey);
      if (!parsed) continue;
      const filters = bodyFiltersData[scopeKey];
      const serializedFilters: SerializedFilter[] = [];
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
      if (serializedFilters.length > 0) {
        const methods = parsed.method === "*" ? ["*"] : [parsed.method];
        result.push({
          methods: methods,
          pattern: parsed.path,
          bodyFilters: serializedFilters,
        });
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

  // --- Generate ---

  const fgpForm = assertElement("fgp-form", HTMLFormElement);
  fgpForm.addEventListener("submit", async function (e: Event) {
    e.preventDefault();
    hideError();

    const token = tokenInput.value.trim();
    const target = targetInput.value.trim();
    let auth = authSelect.value;
    if (auth === "header:") {
      const headerName = authHeaderName.value.trim();
      if (!headerName) {
        showError("Nom du header requis.");
        return;
      }
      auth = "header:" + headerName;
    }

    if (!token) {
      showError("Token manquant.");
      return;
    }
    if (!target) {
      showError("URL cible manquante.");
      return;
    }

    const scopes = buildScopes();
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

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          target: target,
          auth: auth,
          scopes: scopes,
          ttl: ttl,
        }),
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
      const resultCurl = assertElement("result-curl", HTMLElement);
      resultUrl.value = data.url;
      resultKey.value = data.key;
      resultCurl.textContent = 'curl -H "X-FGP-Key: ' + data.key + '" ' + data.url + "v1/apps";
      resultSection.classList.remove("hidden");
    } catch (err) {
      showError("Erreur lors de la g\u00e9n\u00e9ration : " + (err as Error).message);
    } finally {
      btn.disabled = false;
      btn.textContent = "G\u00e9n\u00e9rer l'URL";
    }
  });

  // --- Copy buttons ---

  document.addEventListener("click", function (e: Event) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>(".copy-btn");
    if (!btn) return;
    const targetId = btn.getAttribute("data-copy");
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    const text = (el as HTMLInputElement).value || el.textContent || "";
    navigator.clipboard.writeText(text).then(function () {
      const orig = btn.textContent;
      btn.textContent = "Copi\u00e9 !";
      setTimeout(function () {
        btn.textContent = orig;
      }, 1500);
    });
  });

  updateBodyFiltersVisibility();
})();
