import type { QueryAndCondition, QueryFilterData, SelectOption } from "./types.ts";

// Gabarit repris des body filters. Deux ecarts assumes et specifies : aucun selecteur de
// sous-type sur « Valeur exacte », a aucune profondeur (§19.3), et une case « Requis » qui
// porte sur le filtre entier.
const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
const SMALL_INPUT_CLASS =
  "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
const HINT_CLASS = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const ALERT_CAUTION_CLASS =
  "flex items-start gap-2 rounded-md border border-l-4 p-2 text-xs border-amber-200 border-l-amber-500 bg-amber-50 text-amber-800 dark:border-amber-700 dark:border-l-amber-500 dark:bg-amber-900/30 dark:text-amber-300";

const DENY_BY_DEFAULT_ALERT =
  "Dès qu'un filtre query est ajouté à ce scope, tout paramètre de query non " +
  "déclaré ici fait échouer la requête, y compris ceux que vous n'écrivez pas " +
  "vous-même (pagination, cache-busting, tracking ajoutés par votre client). Ce n'est pas " +
  "une contrainte en plus : c'est un refus par défaut sur tout le reste de la query.";

const REGEX_CAP_HINT =
  "Un paramètre filtré par une expression régulière n'accepte que 4 occurrences " +
  "répétées par requête, contre 64 pour les autres types. Si vous attendez plus de " +
  "4 valeurs sur ce paramètre, un pattern glob (stringwildcard) suffit souvent et n'a pas " +
  "cette limite.";

const EXACT_VALUE_HINT =
  "Une valeur de query est toujours du texte, y compris pour un nombre ou un booléen. " +
  "Pour ?page=1, écrivez 1 ici, pas une coche.";

const PARAM_HINT =
  "Nom exact du paramètre, tel qu'il apparaît dans l'URL. Pas de notation par point : " +
  "un paramètre de query n'a pas de structure imbriquée.";

const REQUIRED_HINT =
  "Décochée (par défaut), ce paramètre peut être absent de la requête, ce " +
  "n'est pas un problème. Cochée, la requête est refusée si ce paramètre est absent.";

const FILTER_TYPES: SelectOption[] = [
  { value: "any", label: "Valeur exacte" },
  { value: "stringwildcard", label: "Pattern (wildcard)" },
  { value: "regex", label: "Expression régulière (regex)" },
  { value: "wildcard", label: "Existe (toute valeur)" },
  { value: "not", label: "Exclure (not)" },
  { value: "and", label: "Toutes les conditions (ET)" },
];

const INNER_TYPES: SelectOption[] = [
  { value: "any", label: "Valeur exacte" },
  { value: "stringwildcard", label: "Pattern (wildcard)" },
  { value: "regex", label: "Expression régulière (regex)" },
];

const CONDITION_TYPES: SelectOption[] = [
  { value: "any", label: "Valeur exacte" },
  { value: "stringwildcard", label: "Pattern (wildcard)" },
  { value: "regex", label: "Expression régulière (regex)" },
  { value: "wildcard", label: "Existe (toute valeur)" },
  { value: "not", label: "Exclure (not)" },
];

function populateSelect(
  select: HTMLSelectElement,
  options: SelectOption[],
  currentValue: string,
): void {
  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    if (option.value === currentValue) opt.selected = true;
    select.appendChild(opt);
  }
}

function placeholderFor(type: string): string {
  if (type === "regex") return "^\\d+$";
  if (type === "stringwildcard") return "release/*";
  return "open";
}

// Un seul hint par bloc de filtre, quelle que soit la profondeur ou vit la regex : repeter
// le message a chaque niveau d'imbrication gonflerait un bloc deja composite (design §5.6).
export function filterUsesRegex(filter: QueryFilterData): boolean {
  if (filter.filterType === "regex") return true;
  if (filter.filterType === "not") return filter.notInnerType === "regex";
  if (filter.filterType === "and") {
    return (filter.andConditions || []).some((cond) =>
      cond.conditionType === "regex" ||
      (cond.conditionType === "not" && cond.notInnerType === "regex")
    );
  }
  return false;
}

function renderNotBlock(
  filter: QueryFilterData,
  parent: HTMLElement,
  renderPanel: () => void,
  renderChips: () => void,
): void {
  if (!filter.notInnerType) filter.notInnerType = "any";
  if (filter.notInnerValue === undefined) filter.notInnerValue = "";

  const wrapper = document.createElement("div");
  wrapper.className =
    "mt-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:bg-amber-900/10 dark:border-amber-700/50";

  const title = document.createElement("span");
  title.className = "block text-xs font-medium text-amber-700 dark:text-amber-400";
  title.textContent = "Exclure :";
  wrapper.appendChild(title);

  const typeSelect = document.createElement("select");
  typeSelect.className = INPUT_CLASS;
  typeSelect.setAttribute("aria-label", "Type de la condition d'exclusion");
  populateSelect(typeSelect, INNER_TYPES, filter.notInnerType);
  typeSelect.addEventListener("change", function () {
    filter.notInnerType = typeSelect.value;
    filter.notInnerValue = "";
    renderPanel();
    renderChips();
  });
  wrapper.appendChild(typeSelect);

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.value = filter.notInnerValue || "";
  valueInput.placeholder = placeholderFor(filter.notInnerType);
  valueInput.className = SMALL_INPUT_CLASS + " w-full";
  valueInput.setAttribute("aria-label", "Valeur de la condition d'exclusion");
  valueInput.addEventListener("input", function () {
    filter.notInnerValue = valueInput.value;
    renderChips();
  });
  wrapper.appendChild(valueInput);

  parent.appendChild(wrapper);
}

function renderConditionNot(
  cond: QueryAndCondition,
  parent: HTMLElement,
  renderPanel: () => void,
  renderChips: () => void,
): void {
  if (!cond.notInnerType) cond.notInnerType = "any";
  if (cond.notInnerValue === null || cond.notInnerValue === undefined) cond.notInnerValue = "";

  const wrapper = document.createElement("div");
  wrapper.className =
    "mt-1 ml-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:bg-amber-900/10 dark:border-amber-700/50";

  const title = document.createElement("span");
  title.className = "block text-xs font-medium text-amber-700 dark:text-amber-400";
  title.textContent = "Exclure :";
  wrapper.appendChild(title);

  const typeSelect = document.createElement("select");
  typeSelect.className = INPUT_CLASS;
  typeSelect.setAttribute("aria-label", "Type de la condition d'exclusion imbriquée");
  populateSelect(typeSelect, INNER_TYPES, cond.notInnerType);
  typeSelect.addEventListener("change", function () {
    cond.notInnerType = typeSelect.value;
    cond.notInnerValue = "";
    renderPanel();
    renderChips();
  });
  wrapper.appendChild(typeSelect);

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.value = cond.notInnerValue || "";
  valueInput.placeholder = placeholderFor(cond.notInnerType);
  valueInput.className = SMALL_INPUT_CLASS + " w-full";
  valueInput.setAttribute("aria-label", "Valeur de la condition d'exclusion imbriquée");
  valueInput.addEventListener("input", function () {
    cond.notInnerValue = valueInput.value;
    renderChips();
  });
  wrapper.appendChild(valueInput);

  parent.appendChild(wrapper);
}

function renderAndBlock(
  filter: QueryFilterData,
  parent: HTMLElement,
  nextId: () => number,
  renderPanel: () => void,
  renderChips: () => void,
): void {
  if (!filter.andConditions) filter.andConditions = [];
  const conditions = filter.andConditions;

  const wrapper = document.createElement("div");
  wrapper.className =
    "mt-2 rounded-md border border-sky-200 bg-sky-50/50 p-3 space-y-2 dark:bg-sky-900/10 dark:border-sky-700/50";
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-label", "Groupe de conditions ET");

  for (let i = 0; i < conditions.length; i++) {
    (function (index: number) {
      const cond = conditions[index];
      const block = document.createElement("div");
      block.className = "space-y-1";

      const head = document.createElement("div");
      head.className = "flex items-center justify-between";
      const label = document.createElement("span");
      label.className = "text-xs font-medium text-sky-700 dark:text-sky-400";
      label.textContent = "Condition " + (index + 1) + " sur " + conditions.length;
      const btnRemove = document.createElement("button");
      btnRemove.type = "button";
      btnRemove.className =
        "text-xs text-red-500 hover:text-red-700 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-1";
      btnRemove.setAttribute("aria-label", "Supprimer la condition " + (index + 1));
      btnRemove.textContent = "✕";
      btnRemove.addEventListener("click", function () {
        conditions.splice(index, 1);
        renderPanel();
        renderChips();
      });
      head.appendChild(label);
      head.appendChild(btnRemove);
      block.appendChild(head);

      const typeSelect = document.createElement("select");
      typeSelect.className = INPUT_CLASS;
      typeSelect.setAttribute("aria-label", "Type de la condition " + (index + 1));
      populateSelect(typeSelect, CONDITION_TYPES, cond.conditionType);
      typeSelect.addEventListener("change", function () {
        cond.conditionType = typeSelect.value;
        cond.value = "";
        cond.notInnerType = typeSelect.value === "not" ? "any" : null;
        cond.notInnerValue = typeSelect.value === "not" ? "" : null;
        renderPanel();
        renderChips();
      });
      block.appendChild(typeSelect);

      if (cond.conditionType === "not") {
        renderConditionNot(cond, block, renderPanel, renderChips);
      } else if (cond.conditionType !== "wildcard") {
        const valueInput = document.createElement("input");
        valueInput.type = "text";
        valueInput.value = cond.value || "";
        valueInput.placeholder = placeholderFor(cond.conditionType);
        valueInput.className = SMALL_INPUT_CLASS + " w-full mt-1";
        valueInput.setAttribute("aria-label", "Valeur de la condition " + (index + 1));
        valueInput.addEventListener("input", function () {
          cond.value = valueInput.value;
          renderChips();
        });
        block.appendChild(valueInput);
      }

      wrapper.appendChild(block);
    })(i);
  }

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className =
    "text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200 focus:outline-none focus:underline";
  btnAdd.textContent = "+ Ajouter une condition";
  btnAdd.addEventListener("click", function () {
    conditions.push({
      id: nextId(),
      conditionType: "any",
      value: "",
      notInnerType: null,
      notInnerValue: null,
    });
    renderPanel();
    renderChips();
  });
  wrapper.appendChild(btnAdd);

  parent.appendChild(wrapper);
}

function renderValuesBlock(
  filter: QueryFilterData,
  parent: HTMLElement,
  renderPanel: () => void,
  renderChips: () => void,
): void {
  if (filter.values.length === 0) filter.values = [""];

  const label = document.createElement("span");
  label.className = "block text-xs font-medium text-gray-600 dark:text-gray-400 mt-2";
  label.textContent = "Valeurs (une des suivantes)";
  parent.appendChild(label);

  for (let i = 0; i < filter.values.length; i++) {
    (function (index: number) {
      const row = document.createElement("div");
      row.className = "flex gap-1 mt-1";

      const input = document.createElement("input");
      input.type = "text";
      input.id = "qf-value-" + filter.id + "-" + index;
      input.value = filter.values[index];
      input.placeholder = placeholderFor(filter.filterType);
      input.className = SMALL_INPUT_CLASS;
      input.setAttribute("aria-label", "Valeur " + (index + 1));
      input.addEventListener("input", function () {
        filter.values[index] = input.value;
        renderChips();
      });
      row.appendChild(input);

      if (filter.values.length > 1) {
        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className =
          "shrink-0 rounded px-2 text-sm text-red-500 hover:text-red-700 dark:text-red-400 focus:outline-none focus:ring-2 focus:ring-red-500";
        btnRemove.setAttribute("aria-label", "Supprimer la valeur " + (index + 1));
        btnRemove.textContent = "✕";
        btnRemove.addEventListener("click", function () {
          filter.values.splice(index, 1);
          renderPanel();
          renderChips();
          const fallback = document.getElementById(
            "qf-value-" + filter.id + "-" + Math.max(0, index - 1),
          );
          if (fallback) fallback.focus();
        });
        row.appendChild(btnRemove);
      }

      parent.appendChild(row);
    })(i);
  }

  if (filter.filterType === "any") {
    const hint = document.createElement("p");
    hint.className = HINT_CLASS;
    hint.textContent = EXACT_VALUE_HINT;
    parent.appendChild(hint);
  }

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className =
    "mt-1 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
  btnAdd.textContent = "+ Ajouter une valeur";
  btnAdd.addEventListener("click", function () {
    filter.values.push("");
    renderPanel();
    renderChips();
    const added = document.getElementById(
      "qf-value-" + filter.id + "-" + (filter.values.length - 1),
    );
    if (added) added.focus();
  });
  parent.appendChild(btnAdd);
}

function renderFilterBlock(
  filters: QueryFilterData[],
  index: number,
  parent: HTMLElement,
  addButtonId: string,
  nextId: () => number,
  renderPanel: () => void,
  renderChips: () => void,
): void {
  const filter = filters[index];

  if (index > 0) {
    const andLabel = document.createElement("div");
    andLabel.className = "text-center py-1";
    andLabel.setAttribute("role", "separator");
    andLabel.setAttribute("aria-hidden", "true");
    const andSpan = document.createElement("span");
    andSpan.className =
      "text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider";
    andSpan.textContent = "ET";
    andLabel.appendChild(andSpan);
    parent.appendChild(andLabel);
  }

  const block = document.createElement("div");
  block.className =
    "rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:bg-gray-700/50 dark:border-gray-600";

  const header = document.createElement("div");
  header.className = "flex items-center justify-between";
  const title = document.createElement("span");
  title.className = "text-xs font-medium text-gray-500 dark:text-gray-400";
  title.textContent = "Filtre " + (index + 1);
  const btnDelete = document.createElement("button");
  btnDelete.type = "button";
  btnDelete.className =
    "text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 rounded p-0.5";
  btnDelete.setAttribute("aria-label", "Supprimer le filtre query " + (index + 1));
  btnDelete.textContent = "🗑";
  btnDelete.addEventListener("click", function () {
    filters.splice(index, 1);
    renderPanel();
    renderChips();
    const addBtn = document.getElementById(addButtonId);
    if (addBtn) addBtn.focus();
  });
  header.appendChild(title);
  header.appendChild(btnDelete);
  block.appendChild(header);

  const paramId = "qf-param-" + filter.id;
  const paramHintId = "qf-param-help-" + filter.id;
  const paramLabel = document.createElement("label");
  paramLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400";
  paramLabel.setAttribute("for", paramId);
  paramLabel.textContent = "Paramètre de query";
  const paramInput = document.createElement("input");
  paramInput.type = "text";
  paramInput.id = paramId;
  paramInput.value = filter.param || "";
  paramInput.placeholder = "status";
  paramInput.className = "mt-1 " + INPUT_CLASS;
  paramInput.setAttribute("aria-describedby", paramHintId);
  paramInput.addEventListener("input", function () {
    filter.param = paramInput.value;
    renderChips();
  });
  const paramHint = document.createElement("p");
  paramHint.id = paramHintId;
  paramHint.className = HINT_CLASS;
  paramHint.textContent = PARAM_HINT;
  block.appendChild(paramLabel);
  block.appendChild(paramInput);
  block.appendChild(paramHint);

  const typeId = "qf-type-" + filter.id;
  const typeLabel = document.createElement("label");
  typeLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400 mt-2";
  typeLabel.setAttribute("for", typeId);
  typeLabel.textContent = "Type";
  const typeSelect = document.createElement("select");
  typeSelect.id = typeId;
  typeSelect.className = "mt-1 " + INPUT_CLASS;
  populateSelect(typeSelect, FILTER_TYPES, filter.filterType);
  typeSelect.addEventListener("change", function () {
    filter.filterType = typeSelect.value;
    filter.values = [];
    if (filter.filterType === "not") {
      if (!filter.notInnerType) filter.notInnerType = "any";
      filter.notInnerValue = "";
    } else if (filter.filterType === "and") {
      if (!filter.andConditions) filter.andConditions = [];
    } else if (filter.filterType !== "wildcard") {
      filter.values = [""];
    }
    renderPanel();
    renderChips();
  });
  block.appendChild(typeLabel);
  block.appendChild(typeSelect);

  if (filter.filterType === "not") {
    renderNotBlock(filter, block, renderPanel, renderChips);
  } else if (filter.filterType === "and") {
    renderAndBlock(filter, block, nextId, renderPanel, renderChips);
  } else if (filter.filterType !== "wildcard") {
    renderValuesBlock(filter, block, renderPanel, renderChips);
  }

  // Porte de sortie affichee au moment ou l'auteur choisit son type, pas dans un guide qu'il
  // n'ouvrira qu'apres avoir bute sur le plafond en production (§19.4, design §5.6).
  if (filterUsesRegex(filter)) {
    const capHint = document.createElement("p");
    capHint.className = "mt-2 text-xs text-gray-500 dark:text-gray-400";
    capHint.textContent = REGEX_CAP_HINT;
    block.appendChild(capHint);
  }

  const requiredId = "qf-required-" + filter.id;
  const requiredHelpId = "qf-required-help-" + filter.id;
  const requiredLabel = document.createElement("label");
  requiredLabel.className =
    "flex items-start gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 cursor-pointer";
  const requiredInput = document.createElement("input");
  requiredInput.type = "checkbox";
  requiredInput.id = requiredId;
  requiredInput.checked = filter.required === true;
  requiredInput.className =
    "mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-fgp-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-offset-gray-800";
  requiredInput.setAttribute("aria-describedby", requiredHelpId);
  requiredInput.addEventListener("change", function () {
    filter.required = requiredInput.checked;
    renderChips();
  });
  const requiredText = document.createElement("span");
  requiredText.className = "flex-1";
  const requiredTitle = document.createElement("span");
  requiredTitle.className = "text-sm text-gray-700 dark:text-gray-300";
  requiredTitle.textContent = "Requis";
  const requiredHelp = document.createElement("p");
  requiredHelp.id = requiredHelpId;
  requiredHelp.className = HINT_CLASS;
  requiredHelp.textContent = REQUIRED_HINT;
  requiredText.appendChild(requiredTitle);
  requiredText.appendChild(requiredHelp);
  requiredLabel.appendChild(requiredInput);
  requiredLabel.appendChild(requiredText);
  block.appendChild(requiredLabel);

  parent.appendChild(block);
}

export interface QuerySubSectionOptions {
  scopeKey: string;
  filters: QueryFilterData[];
  safeId: string;
  container: HTMLElement;
  nextId: () => number;
  renderPanel: () => void;
  renderChips: () => void;
}

export function renderQuerySubSection(options: QuerySubSectionOptions): void {
  const { filters, safeId, container } = options;

  const section = document.createElement("div");
  section.className = "mt-3 space-y-2";
  section.setAttribute("aria-live", "polite");

  const title = document.createElement("p");
  title.className =
    "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";
  title.textContent = "Query Filters (avancé)";
  section.appendChild(title);

  // Pilote par l'etat du scope, jamais par un evenement : la condition ne lit la propriete
  // « required » d'aucun filtre, ce qui rend structurellement impossible de lire l'alerte
  // comme une propriete du filtre qu'on vient de cocher (design §5.5).
  if (filters.length > 0) {
    const alert = document.createElement("div");
    alert.className = ALERT_CAUTION_CLASS;
    const alertText = document.createElement("span");
    alertText.textContent = DENY_BY_DEFAULT_ALERT;
    alert.appendChild(alertText);
    section.appendChild(alert);
  }

  const addButtonId = "qf-add-" + safeId;
  const renderPanel = options.renderPanel;
  const renderChips = options.renderChips;

  for (let i = 0; i < filters.length; i++) {
    renderFilterBlock(
      filters,
      i,
      section,
      addButtonId,
      options.nextId,
      renderPanel,
      renderChips,
    );
  }

  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.id = addButtonId;
  btnAdd.className =
    "mt-2 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
  btnAdd.textContent = "+ Ajouter un filtre query";
  btnAdd.addEventListener("click", function () {
    filters.push({
      id: options.nextId(),
      param: "",
      required: false,
      filterType: "any",
      values: [""],
    });
    renderPanel();
    renderChips();
    const added = document.getElementById("qf-param-" + filters[filters.length - 1].id);
    if (added) added.focus();
  });
  section.appendChild(btnAdd);

  container.appendChild(section);
}
