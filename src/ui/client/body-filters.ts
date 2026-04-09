import type { AndCondition, FilterData, SelectOption } from "./types.ts";
import { filterSummary, getEligibleScopes, getScopesWithFilters, truncatePath } from "./scopes.ts";

export interface BodyFiltersState {
  bodyFiltersData: Record<string, FilterData[]>;
  nextFilterId: number;
  expandedScopes: Record<string, boolean>;
}

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
  renderPanel: () => void,
  renderChips: () => void,
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
    { value: "regex", label: "Expression r\u00e9guli\u00e8re (regex)" },
  ], cond.notInnerType);
  condNotTypeSelect.addEventListener("change", function () {
    cond.notInnerType = condNotTypeSelect.value;
    if (condNotTypeSelect.value === "any") {
      if (!cond.notInnerSubType) cond.notInnerSubType = "text";
    } else {
      cond.notInnerSubType = "text";
    }
    cond.notInnerValue = "";
    renderPanel();
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
      renderPanel();
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
    cnPatInput.placeholder = cond.notInnerType === "regex"
      ? "^release\\/v\\d+"
      : "release/broken*";
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
  state: BodyFiltersState,
  renderPanel: () => void,
  renderChips: () => void,
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
    emptyMsg.className = "text-xs text-gray-500 dark:text-gray-400 py-1";
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
        renderPanel();
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
        { value: "regex", label: "Expression r\u00e9guli\u00e8re (regex)" },
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
        renderPanel();
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
          renderPanel();
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
      } else if (cond.conditionType === "regex") {
        const condRxInput = document.createElement("input");
        condRxInput.type = "text";
        condRxInput.value = cond.value || "";
        condRxInput.placeholder = "^release\\/v\\d+";
        condRxInput.className =
          "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
        condRxInput.addEventListener("input", function () {
          cond.value = condRxInput.value;
          renderChips();
        });
        condBlock.appendChild(condRxInput);
      } else if (cond.conditionType === "not") {
        renderConditionNotBlock(cond, condBlock, renderPanel, renderChips);
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
      id: state.nextFilterId++,
      conditionType: "any",
      value: "",
      valueSubType: "text",
      notInnerType: null,
      notInnerSubType: null,
      notInnerValue: null,
    });
    renderPanel();
    renderChips();
  });
  andWrapper.appendChild(btnAddCond);
  parent.appendChild(andWrapper);
}

function renderNotBlock(
  filterData: FilterData,
  parent: HTMLElement,
  renderPanel: () => void,
  renderChips: () => void,
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
    { value: "regex", label: "Expression r\u00e9guli\u00e8re (regex)" },
  ], filterData.notInnerType);
  notTypeSelect.addEventListener("change", function () {
    filterData.notInnerType = notTypeSelect.value;
    if (notTypeSelect.value === "any") {
      if (!filterData.notInnerSubType) filterData.notInnerSubType = "text";
    } else {
      filterData.notInnerSubType = "text";
    }
    filterData.notInnerValue = "";
    renderPanel();
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
      renderPanel();
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
    notPatInput.placeholder = filterData.notInnerType === "regex"
      ? "^release\\/v\\d+"
      : "release/broken*";
    notPatInput.className =
      "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
    notPatInput.setAttribute("aria-label", filterData.notInnerType === "regex"
      ? "Regex exclue"
      : "Pattern exclu");
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
  renderPanel: () => void,
  renderChips: () => void,
): void {
  if (!filterData.valueSubTypes) filterData.valueSubTypes = [];

  const valuesLabel = document.createElement("div");
  valuesLabel.className = "text-xs text-gray-600 dark:text-gray-400 mt-2";
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
          renderPanel();
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
            : filterData.filterType === "regex"
            ? "^release\\/v\\d+"
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
        renderPanel();
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
    renderPanel();
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
  state: BodyFiltersState,
  updateVisibility: () => void,
  renderPanel: () => void,
  renderChips: () => void,
): void {
  const filterData = scopeFilters[filterIndex];

  if (filterIndex > 0) {
    const andLabel = document.createElement("div");
    andLabel.className = "text-center py-1";
    andLabel.setAttribute("role", "separator");
    andLabel.setAttribute("aria-hidden", "true");
    const andSpan = document.createElement("span");
    andSpan.className =
      "text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider";
    andSpan.textContent = "ET";
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
      delete state.bodyFiltersData[scopeKey];
    }
    updateVisibility();
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
    { value: "regex", label: "Expression r\u00e9guli\u00e8re (regex)" },
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
    renderPanel();
    renderChips();
  });
  filterBlock.appendChild(typeLabel);
  filterBlock.appendChild(typeSelect);

  if (filterData.filterType === "not") {
    renderNotBlock(filterData, filterBlock, renderPanel, renderChips);
  }

  if (filterData.filterType === "and") {
    renderAndBlock(filterData, filterBlock, state, renderPanel, renderChips);
  }

  if (
    filterData.filterType !== "wildcard" &&
    filterData.filterType !== "not" &&
    filterData.filterType !== "and"
  ) {
    renderValuesBlock(filterData, filterIndex, filterBlock, renderPanel, renderChips);
  }

  content.appendChild(filterBlock);
}

export function renderBodyFiltersPanel(
  scopesTextarea: HTMLTextAreaElement,
  bodyFiltersList: HTMLElement,
  state: BodyFiltersState,
  updateVisibility: () => void,
  renderChips: () => void,
): void {
  const eligible = getEligibleScopes(scopesTextarea);
  const withFilters = getScopesWithFilters(state.bodyFiltersData);
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

  const renderPanel = () =>
    renderBodyFiltersPanel(
      scopesTextarea,
      bodyFiltersList,
      state,
      updateVisibility,
      renderChips,
    );

  for (let s = 0; s < allScopes.length; s++) {
    (function (scopeKey: string) {
      const inTextarea = eligible.indexOf(scopeKey) !== -1;
      const filters = state.bodyFiltersData[scopeKey] || [];
      const filterCount = filters.length;
      const isExpanded = !!state.expandedScopes[scopeKey];
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

      const expandScope = (key: string) => {
        state.expandedScopes[key] = true;
        renderPanel();
      };
      const collapseScope = (key: string) => {
        state.expandedScopes[key] = false;
        renderPanel();
      };

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

        if (!state.bodyFiltersData[scopeKey]) {
          state.bodyFiltersData[scopeKey] = [];
        }
        const scopeFilters = state.bodyFiltersData[scopeKey];

        for (let fi = 0; fi < scopeFilters.length; fi++) {
          renderFilterBlock(
            scopeKey,
            scopeFilters,
            fi,
            safeId,
            content,
            state,
            updateVisibility,
            renderPanel,
            renderChips,
          );
        }

        const btnAddFilter = document.createElement("button");
        btnAddFilter.type = "button";
        btnAddFilter.id = "bf-add-" + safeId;
        btnAddFilter.className =
          "mt-2 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
        btnAddFilter.textContent = "+ Ajouter un filtre";
        btnAddFilter.addEventListener("click", function () {
          const newFilter: FilterData = {
            id: state.nextFilterId++,
            objectPath: "",
            filterType: "any",
            values: [""],
            valueSubTypes: ["text"],
          };
          if (!state.bodyFiltersData[scopeKey]) state.bodyFiltersData[scopeKey] = [];
          state.bodyFiltersData[scopeKey].push(newFilter);
          renderPanel();
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

export function renderChips(
  scopesTextarea: HTMLTextAreaElement,
  scopeChips: HTMLElement,
  bodyFiltersPanel: HTMLElement,
  bodyFiltersList: HTMLElement,
  state: BodyFiltersState,
  updateVisibility: () => void,
): void {
  const withFilters = getScopesWithFilters(state.bodyFiltersData);
  scopeChips.textContent = "";
  if (withFilters.length === 0) {
    scopeChips.classList.add("hidden");
    return;
  }
  scopeChips.classList.remove("hidden");

  const doRenderChips = () =>
    renderChips(
      scopesTextarea,
      scopeChips,
      bodyFiltersPanel,
      bodyFiltersList,
      state,
      updateVisibility,
    );

  for (let i = 0; i < withFilters.length; i++) {
    (function (scopeKey: string) {
      const chip = document.createElement("div");
      chip.className =
        "flex items-center gap-2 rounded-md border border-fgp-200 bg-fgp-50 px-3 py-2 text-sm font-mono dark:bg-fgp-900/50 dark:border-fgp-700";

      const textSpan = document.createElement("span");
      textSpan.className = "flex-1 truncate text-gray-800 dark:text-gray-200";
      const summary = filterSummary(scopeKey, state.bodyFiltersData);
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
        renderBodyFiltersPanel(
          scopesTextarea,
          bodyFiltersList,
          state,
          updateVisibility,
          doRenderChips,
        );
        const target = document.getElementById(
          "bf-scope-" + scopeKey.replace(/[^a-zA-Z0-9]/g, "_"),
        );
        if (target) {
          state.expandedScopes[scopeKey] = true;
          renderBodyFiltersPanel(
            scopesTextarea,
            bodyFiltersList,
            state,
            updateVisibility,
            doRenderChips,
          );
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
        delete state.bodyFiltersData[scopeKey];
        const lines = scopesTextarea.value.split("\n");
        const kept: string[] = [];
        for (let k = 0; k < lines.length; k++) {
          if (lines[k].trim() !== scopeKey) kept.push(lines[k]);
        }
        scopesTextarea.value = kept.join("\n");
        updateVisibility();
      });

      chip.appendChild(textSpan);
      chip.appendChild(btnEdit);
      chip.appendChild(btnRemove);
      scopeChips.appendChild(chip);
    })(withFilters[i]);
  }
}

export function updateBodyFiltersVisibility(
  scopesTextarea: HTMLTextAreaElement,
  btnAddBodyFilters: HTMLButtonElement,
  bodyFiltersPanel: HTMLElement,
  bodyFiltersList: HTMLElement,
  scopeChips: HTMLElement,
  state: BodyFiltersState,
): void {
  const eligible = getEligibleScopes(scopesTextarea);
  const withFilters = getScopesWithFilters(state.bodyFiltersData);

  let hasEligibleWithoutFilters = false;
  for (let j = 0; j < eligible.length; j++) {
    if (withFilters.indexOf(eligible[j]) === -1) {
      hasEligibleWithoutFilters = true;
      break;
    }
  }

  btnAddBodyFilters.classList.toggle("hidden", !hasEligibleWithoutFilters);

  const updateVisibility = () =>
    updateBodyFiltersVisibility(
      scopesTextarea,
      btnAddBodyFilters,
      bodyFiltersPanel,
      bodyFiltersList,
      scopeChips,
      state,
    );

  const doRenderChips = () =>
    renderChips(
      scopesTextarea,
      scopeChips,
      bodyFiltersPanel,
      bodyFiltersList,
      state,
      updateVisibility,
    );

  doRenderChips();
  if (bodyFiltersPanel.classList.contains("hidden")) return;
  renderBodyFiltersPanel(
    scopesTextarea,
    bodyFiltersList,
    state,
    updateVisibility,
    doRenderChips,
  );
}
