// deno-lint-ignore-file
(function () {
  "use strict";

  var targetInput = document.getElementById("target");
  var authSelect = document.getElementById("auth");
  var authHeaderName = document.getElementById("auth-header-name");
  var tokenInput = document.getElementById("token");
  var btnLoadApps = document.getElementById("btn-load-apps");
  var appsSection = document.getElementById("apps-section");
  var appsList = document.getElementById("apps-list");
  var scopesTextarea = document.getElementById("scopes");
  var resultSection = document.getElementById("result-section");
  var errorBanner = document.getElementById("error-banner");
  var customTtlWrapper = document.getElementById("custom-ttl-wrapper");
  var ttlWarning = document.getElementById("ttl-warning");
  var scopeChips = document.getElementById("scope-chips");
  var btnAddBodyFilters = document.getElementById("btn-add-body-filters");
  var bodyFiltersPanel = document.getElementById("body-filters-panel");
  var bodyFiltersList = document.getElementById("body-filters-list");
  var btnCloseBodyFilters = document.getElementById("btn-close-body-filters");

  var ELIGIBLE_METHODS = ["POST", "PUT", "PATCH", "*"];
  var bodyFiltersData = {};
  var nextFilterId = 1;

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
    setTimeout(function () {
      errorBanner.classList.add("hidden");
    }, 8000);
  }

  function hideError() {
    errorBanner.classList.add("hidden");
  }

  // --- Body Filters: helpers ---

  function parseScope(line) {
    var trimmed = line.trim();
    if (!trimmed) return null;
    var idx = trimmed.indexOf(":");
    if (idx === -1) return null;
    return {
      method: trimmed.substring(0, idx),
      path: trimmed.substring(idx + 1),
      raw: trimmed,
    };
  }

  function isEligible(parsed) {
    if (!parsed) return false;
    return ELIGIBLE_METHODS.indexOf(parsed.method) !== -1;
  }

  function getEligibleScopes() {
    var lines = scopesTextarea.value.split("\n");
    var result = [];
    for (var i = 0; i < lines.length; i++) {
      var p = parseScope(lines[i]);
      if (isEligible(p)) result.push(p.raw);
    }
    return result;
  }

  function getScopesWithFilters() {
    var keys = Object.keys(bodyFiltersData);
    var result = [];
    for (var i = 0; i < keys.length; i++) {
      if (bodyFiltersData[keys[i]] && bodyFiltersData[keys[i]].length > 0) {
        result.push(keys[i]);
      }
    }
    return result;
  }

  function truncatePath(raw, maxLen) {
    if (raw.length <= maxLen) return raw;
    var idx = raw.indexOf(":");
    if (idx === -1) return raw.substring(0, maxLen) + "\u2026";
    var method = raw.substring(0, idx + 1);
    var path = raw.substring(idx + 1);
    var budget = maxLen - method.length - 3;
    if (budget < 5) return raw.substring(0, maxLen) + "\u2026";
    return method + "\u2026" + path.substring(path.length - budget);
  }

  function filterSummary(scopeKey) {
    var filters = bodyFiltersData[scopeKey] || [];
    var parts = [];
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      var field = f.objectPath || "?";
      if (f.filterType === "wildcard") {
        parts.push(field + " exists");
      } else if (f.filterType === "not") {
        var innerType = f.notInnerType || "any";
        var innerSubType = f.notInnerSubType || "text";
        var innerVal = (f.notInnerValue || "").trim();
        var displayVal = "";
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
        var andParts = [];
        var aConds = f.andConditions || [];
        for (var ai = 0; ai < aConds.length; ai++) {
          var ac = aConds[ai];
          if (ac.conditionType === "wildcard") {
            andParts.push("exists");
          } else if (ac.conditionType === "not") {
            var nv = (ac.notInnerValue || "").trim();
            andParts.push("pas " + (nv || "?"));
          } else {
            var cv = (ac.value || "").trim();
            andParts.push(cv || "?");
          }
        }
        if (andParts.length > 0) {
          parts.push(field + " = (" + andParts.join(" ET ") + ")");
        } else {
          parts.push(field + " = (vide)");
        }
      } else {
        var vals = [];
        var subTypes = f.valueSubTypes || [];
        for (var j = 0; j < f.values.length; j++) {
          var st = subTypes[j] || "text";
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

  function updateBodyFiltersVisibility() {
    var eligible = getEligibleScopes();
    var allFromTextarea = eligible;
    var withFilters = getScopesWithFilters();

    for (var i = 0; i < withFilters.length; i++) {
      if (allFromTextarea.indexOf(withFilters[i]) === -1) {
        allFromTextarea.push(withFilters[i]);
      }
    }

    var hasEligibleWithoutFilters = false;
    for (var j = 0; j < eligible.length; j++) {
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

  function renderChips() {
    var withFilters = getScopesWithFilters();
    scopeChips.textContent = "";
    if (withFilters.length === 0) {
      scopeChips.classList.add("hidden");
      return;
    }
    scopeChips.classList.remove("hidden");
    for (var i = 0; i < withFilters.length; i++) {
      (function (scopeKey) {
        var chip = document.createElement("div");
        chip.className =
          "flex items-center gap-2 rounded-md border border-fgp-200 bg-fgp-50 px-3 py-2 text-sm font-mono dark:bg-fgp-900/50 dark:border-fgp-700";

        var textSpan = document.createElement("span");
        textSpan.className = "flex-1 truncate text-gray-800 dark:text-gray-200";
        var summary = filterSummary(scopeKey);
        textSpan.textContent = truncatePath(scopeKey, 50) +
          (summary ? " \u2192 " + summary : "");
        textSpan.title = scopeKey + (summary ? " \u2192 " + summary : "");

        var btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className =
          "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-fgp-600 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:text-fgp-400 dark:hover:bg-fgp-800";
        btnEdit.textContent = "\u00e9diter";
        btnEdit.setAttribute(
          "aria-label",
          "\u00c9diter les filtres de " + scopeKey,
        );
        btnEdit.addEventListener("click", function () {
          bodyFiltersPanel.classList.remove("hidden");
          renderBodyFiltersPanel();
          var target = document.getElementById(
            "bf-scope-" + scopeKey.replace(/[^a-zA-Z0-9]/g, "_"),
          );
          if (target) {
            expandScope(scopeKey);
            target.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });

        var btnRemove = document.createElement("button");
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
          var lines = scopesTextarea.value.split("\n");
          var kept = [];
          for (var k = 0; k < lines.length; k++) {
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

  var expandedScopes = {};

  function expandScope(scopeKey) {
    expandedScopes[scopeKey] = true;
    renderBodyFiltersPanel();
  }

  function collapseScope(scopeKey) {
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

  function renderBodyFiltersPanel() {
    var eligible = getEligibleScopes();
    var withFilters = getScopesWithFilters();
    var allScopes = [];
    for (var i = 0; i < eligible.length; i++) {
      if (allScopes.indexOf(eligible[i]) === -1) allScopes.push(eligible[i]);
    }
    for (var j = 0; j < withFilters.length; j++) {
      if (allScopes.indexOf(withFilters[j]) === -1) {
        allScopes.push(withFilters[j]);
      }
    }

    bodyFiltersList.textContent = "";

    if (allScopes.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-sm text-gray-400 dark:text-gray-500";
      empty.textContent = "Aucun scope \u00e9ligible (POST, PUT, PATCH).";
      bodyFiltersList.appendChild(empty);
      return;
    }

    for (var s = 0; s < allScopes.length; s++) {
      (function (scopeKey) {
        var inTextarea = eligible.indexOf(scopeKey) !== -1;
        var filters = bodyFiltersData[scopeKey] || [];
        var filterCount = filters.length;
        var isExpanded = !!expandedScopes[scopeKey];
        var safeId = "bf-scope-" +
          scopeKey.replace(/[^a-zA-Z0-9]/g, "_");
        var contentId = safeId + "-content";

        var row = document.createElement("div");
        row.id = safeId;

        var header = document.createElement("button");
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

        var chevron = document.createElement("span");
        chevron.className = "flex-shrink-0 text-xs transition-transform" +
          (isExpanded ? " rotate-90" : "");
        chevron.textContent = "\u25b6";
        chevron.setAttribute("aria-hidden", "true");

        var label = document.createElement("span");
        label.className = "flex-1 truncate";
        label.textContent = scopeKey;

        var badge = document.createElement("span");
        badge.className =
          "text-xs text-fgp-600 dark:text-fgp-300 font-medium flex items-center gap-1";
        badge.textContent = filterCount + " filtre" +
          (filterCount > 1 ? "s" : "");

        if (filterCount > 0) {
          var dot = document.createElement("span");
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
        header.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            if (isExpanded) collapseScope(scopeKey);
            else expandScope(scopeKey);
          }
        });

        row.appendChild(header);

        if (isExpanded) {
          var content = document.createElement("div");
          content.id = contentId;
          content.className =
            "ml-4 mt-2 mb-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4";

          if (!bodyFiltersData[scopeKey]) {
            bodyFiltersData[scopeKey] = [];
          }
          var scopeFilters = bodyFiltersData[scopeKey];

          for (var fi = 0; fi < scopeFilters.length; fi++) {
            (function (filterIndex) {
              var filterData = scopeFilters[filterIndex];

              if (filterIndex > 0) {
                var andLabel = document.createElement("div");
                andLabel.className = "text-center py-1";
                var andSpan = document.createElement("span");
                andSpan.className =
                  "text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider";
                andSpan.textContent = "ET";
                andSpan.setAttribute("aria-label", "et aussi");
                andLabel.appendChild(andSpan);
                content.appendChild(andLabel);
              }

              var filterBlock = document.createElement("div");
              filterBlock.className =
                "rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:bg-gray-700/50 dark:border-gray-600";

              var filterHeader = document.createElement("div");
              filterHeader.className = "flex items-center justify-between";
              var filterTitle = document.createElement("span");
              filterTitle.className = "text-xs font-medium text-gray-500 dark:text-gray-400";
              filterTitle.textContent = "Filtre " + (filterIndex + 1);
              var btnDelete = document.createElement("button");
              btnDelete.type = "button";
              btnDelete.className =
                "text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 rounded p-0.5";
              btnDelete.setAttribute(
                "aria-label",
                "Supprimer le filtre " + (filterIndex + 1),
              );
              btnDelete.textContent = "\uD83D\uDDD1";
              btnDelete.addEventListener("click", function () {
                scopeFilters.splice(filterIndex, 1);
                if (scopeFilters.length === 0) {
                  delete bodyFiltersData[scopeKey];
                }
                updateBodyFiltersVisibility();
                var addBtn = document.getElementById("bf-add-" + safeId);
                if (addBtn) addBtn.focus();
              });
              filterHeader.appendChild(filterTitle);
              filterHeader.appendChild(btnDelete);
              filterBlock.appendChild(filterHeader);

              var fieldId = "bf-field-" + filterData.id;
              var fieldLabel = document.createElement("label");
              fieldLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400";
              fieldLabel.setAttribute("for", fieldId);
              fieldLabel.textContent = "Champ (dot-path)";
              var fieldInput = document.createElement("input");
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

              var typeId = "bf-type-" + filterData.id;
              var typeLabel = document.createElement("label");
              typeLabel.className =
                "block text-xs font-medium text-gray-600 dark:text-gray-400 mt-2";
              typeLabel.setAttribute("for", typeId);
              typeLabel.textContent = "Type";
              var typeSelect = document.createElement("select");
              typeSelect.id = typeId;
              typeSelect.className =
                "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
              var types = [
                { value: "any", label: "Valeur exacte" },
                { value: "stringwildcard", label: "Pattern (wildcard)" },
                { value: "wildcard", label: "Existe (toute valeur)" },
                { value: "not", label: "Exclure (not)" },
                { value: "and", label: "Toutes les conditions (ET)" },
              ];
              for (var t = 0; t < types.length; t++) {
                var opt = document.createElement("option");
                opt.value = types[t].value;
                opt.textContent = types[t].label;
                if (filterData.filterType === types[t].value) {
                  opt.selected = true;
                }
                typeSelect.appendChild(opt);
              }
              typeSelect.addEventListener("change", function () {
                filterData.filterType = typeSelect.value;
                if (filterData.filterType === "wildcard") {
                  filterData.values = [];
                  filterData.valueSubTypes = [];
                } else if (filterData.filterType === "not") {
                  filterData.values = [];
                  filterData.valueSubTypes = [];
                  if (!filterData.notInnerType) {
                    filterData.notInnerType = "any";
                  }
                  if (!filterData.notInnerSubType) {
                    filterData.notInnerSubType = "text";
                  }
                  if (filterData.notInnerValue === undefined) {
                    filterData.notInnerValue = "";
                  }
                } else if (filterData.filterType === "and") {
                  filterData.values = [];
                  filterData.valueSubTypes = [];
                  if (!filterData.andConditions) {
                    filterData.andConditions = [];
                  }
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
                if (!filterData.notInnerType) filterData.notInnerType = "any";
                if (!filterData.notInnerSubType) {
                  filterData.notInnerSubType = "text";
                }
                if (filterData.notInnerValue === undefined) {
                  filterData.notInnerValue = "";
                }

                var notWrapper = document.createElement("div");
                notWrapper.className =
                  "mt-2 ml-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:bg-amber-900/10 dark:border-amber-700/50";

                var notTitle = document.createElement("span");
                notTitle.className = "block text-xs font-medium text-amber-700 dark:text-amber-400";
                notTitle.textContent = "Exclure :";
                notWrapper.appendChild(notTitle);

                var notTypeId = "bf-not-type-" + filterData.id;
                var notTypeLabel = document.createElement("label");
                notTypeLabel.className =
                  "block text-xs font-medium text-gray-600 dark:text-gray-400";
                notTypeLabel.setAttribute("for", notTypeId);
                notTypeLabel.textContent = "Type";
                var notTypeSelect = document.createElement("select");
                notTypeSelect.id = notTypeId;
                notTypeSelect.className =
                  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                var notTypes = [
                  { value: "any", label: "Valeur exacte" },
                  { value: "stringwildcard", label: "Pattern (wildcard)" },
                ];
                for (var nt = 0; nt < notTypes.length; nt++) {
                  var notOpt = document.createElement("option");
                  notOpt.value = notTypes[nt].value;
                  notOpt.textContent = notTypes[nt].label;
                  if (filterData.notInnerType === notTypes[nt].value) {
                    notOpt.selected = true;
                  }
                  notTypeSelect.appendChild(notOpt);
                }
                notTypeSelect.addEventListener("change", function () {
                  filterData.notInnerType = notTypeSelect.value;
                  if (notTypeSelect.value === "any") {
                    if (!filterData.notInnerSubType) {
                      filterData.notInnerSubType = "text";
                    }
                  } else {
                    filterData.notInnerSubType = "text";
                  }
                  filterData.notInnerValue = "";
                  renderBodyFiltersPanel();
                  renderChips();
                });
                notWrapper.appendChild(notTypeLabel);
                notWrapper.appendChild(notTypeSelect);

                var notIsExact = filterData.notInnerType === "any";

                var notValLabel = document.createElement("div");
                notValLabel.className = "text-xs text-gray-500 dark:text-gray-400 mt-2";
                notValLabel.textContent = "Valeurs :";
                notWrapper.appendChild(notValLabel);

                var notValRow = document.createElement("div");
                notValRow.className = "flex gap-1 mt-1";

                var notValInputId = "bf-not-val-" + filterData.id;

                if (notIsExact) {
                  var notSubType = filterData.notInnerSubType || "text";
                  var notSubTypeSelect = document.createElement("select");
                  notSubTypeSelect.className =
                    "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                  notSubTypeSelect.setAttribute(
                    "aria-label",
                    "Type de la valeur exclue",
                  );
                  var notSubOpts = [
                    { value: "text", label: "Texte" },
                    { value: "number", label: "Nombre" },
                    { value: "boolean", label: "Bool\u00e9en" },
                    { value: "null", label: "Null" },
                  ];
                  for (var nst = 0; nst < notSubOpts.length; nst++) {
                    var nstOpt = document.createElement("option");
                    nstOpt.value = notSubOpts[nst].value;
                    nstOpt.textContent = notSubOpts[nst].label;
                    if (notSubType === notSubOpts[nst].value) {
                      nstOpt.selected = true;
                    }
                    notSubTypeSelect.appendChild(nstOpt);
                  }
                  notSubTypeSelect.addEventListener("change", function () {
                    filterData.notInnerSubType = notSubTypeSelect.value;
                    if (notSubTypeSelect.value === "boolean") {
                      filterData.notInnerValue = "true";
                    } else if (notSubTypeSelect.value === "null") {
                      filterData.notInnerValue = "";
                    } else if (notSubTypeSelect.value === "number") {
                      var parsedN = Number(filterData.notInnerValue);
                      if (isNaN(parsedN)) filterData.notInnerValue = "";
                    }
                    renderBodyFiltersPanel();
                    renderChips();
                  });
                  notValRow.appendChild(notSubTypeSelect);

                  if (notSubType === "boolean") {
                    var notBoolSelect = document.createElement("select");
                    notBoolSelect.id = notValInputId;
                    notBoolSelect.className =
                      "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                    notBoolSelect.setAttribute(
                      "aria-label",
                      "Valeur bool\u00e9enne exclue",
                    );
                    var nbTrue = document.createElement("option");
                    nbTrue.value = "true";
                    nbTrue.textContent = "true";
                    if (filterData.notInnerValue === "true") {
                      nbTrue.selected = true;
                    }
                    var nbFalse = document.createElement("option");
                    nbFalse.value = "false";
                    nbFalse.textContent = "false";
                    if (filterData.notInnerValue === "false") {
                      nbFalse.selected = true;
                    }
                    notBoolSelect.appendChild(nbTrue);
                    notBoolSelect.appendChild(nbFalse);
                    notBoolSelect.addEventListener("change", function () {
                      filterData.notInnerValue = notBoolSelect.value;
                      renderChips();
                    });
                    notValRow.appendChild(notBoolSelect);
                  } else if (notSubType === "null") {
                    var notNullSpan = document.createElement("span");
                    notNullSpan.className =
                      "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
                    notNullSpan.textContent = "null";
                    notValRow.appendChild(notNullSpan);
                  } else {
                    var notValInput = document.createElement("input");
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
                  var notPatInput = document.createElement("input");
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
                filterBlock.appendChild(notWrapper);
              }

              if (filterData.filterType === "and") {
                if (!filterData.andConditions) filterData.andConditions = [];
                var andConditions = filterData.andConditions;

                var andWrapper = document.createElement("div");
                andWrapper.className =
                  "mt-2 ml-3 rounded-md border border-sky-200 bg-sky-50/50 p-3 space-y-2 dark:bg-sky-900/10 dark:border-sky-700/50";
                andWrapper.setAttribute("role", "group");
                andWrapper.setAttribute(
                  "aria-label",
                  "Groupe de conditions ET",
                );

                var andTitle = document.createElement("span");
                andTitle.className = "block text-xs font-medium text-sky-700 dark:text-sky-400";
                andTitle.textContent = "ET";
                andWrapper.appendChild(andTitle);

                if (andConditions.length === 0) {
                  var emptyMsg = document.createElement("p");
                  emptyMsg.className = "text-xs text-gray-400 dark:text-gray-500 py-1";
                  emptyMsg.textContent = "(aucune condition)";
                  andWrapper.appendChild(emptyMsg);
                }

                for (var ci = 0; ci < andConditions.length; ci++) {
                  (function (condIndex) {
                    var cond = andConditions[condIndex];

                    if (condIndex > 0) {
                      var etLabel = document.createElement("div");
                      etLabel.className =
                        "text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center py-1";
                      etLabel.textContent = "ET";
                      etLabel.setAttribute("aria-hidden", "true");
                      andWrapper.appendChild(etLabel);
                    }

                    var condBlock = document.createElement("div");
                    condBlock.className = "space-y-1";
                    condBlock.setAttribute(
                      "aria-label",
                      "Condition " + (condIndex + 1) + " sur " +
                        andConditions.length,
                    );

                    var condHeader = document.createElement("div");
                    condHeader.className =
                      "flex items-center justify-between text-xs text-gray-600 dark:text-gray-400";
                    var condTitle = document.createElement("span");
                    condTitle.textContent = "Condition " + (condIndex + 1);
                    var btnRemoveCond = document.createElement("button");
                    btnRemoveCond.type = "button";
                    btnRemoveCond.className =
                      "text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 text-xs";
                    btnRemoveCond.textContent = "\u00d7";
                    btnRemoveCond.setAttribute(
                      "aria-label",
                      "Supprimer la condition " + (condIndex + 1),
                    );
                    btnRemoveCond.addEventListener("click", function () {
                      andConditions.splice(condIndex, 1);
                      renderBodyFiltersPanel();
                      renderChips();
                    });
                    condHeader.appendChild(condTitle);
                    condHeader.appendChild(btnRemoveCond);
                    condBlock.appendChild(condHeader);

                    var condTypeSelect = document.createElement("select");
                    condTypeSelect.className =
                      "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                    var condTypes = [
                      { value: "any", label: "Valeur exacte" },
                      { value: "stringwildcard", label: "Pattern (wildcard)" },
                      { value: "wildcard", label: "Existe (toute valeur)" },
                      { value: "not", label: "Exclure (not)" },
                    ];
                    for (var ct = 0; ct < condTypes.length; ct++) {
                      var cOpt = document.createElement("option");
                      cOpt.value = condTypes[ct].value;
                      cOpt.textContent = condTypes[ct].label;
                      if (cond.conditionType === condTypes[ct].value) {
                        cOpt.selected = true;
                      }
                      condTypeSelect.appendChild(cOpt);
                    }
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
                      var condSubType = cond.valueSubType || "text";
                      var condValRow = document.createElement("div");
                      condValRow.className = "flex gap-1";
                      var condSubSelect = document.createElement("select");
                      condSubSelect.className =
                        "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                      var condSubOpts = [
                        { value: "text", label: "Texte" },
                        { value: "number", label: "Nombre" },
                        { value: "boolean", label: "Bool\u00e9en" },
                        { value: "null", label: "Null" },
                      ];
                      for (var cso = 0; cso < condSubOpts.length; cso++) {
                        var csOpt = document.createElement("option");
                        csOpt.value = condSubOpts[cso].value;
                        csOpt.textContent = condSubOpts[cso].label;
                        if (condSubType === condSubOpts[cso].value) {
                          csOpt.selected = true;
                        }
                        condSubSelect.appendChild(csOpt);
                      }
                      condSubSelect.addEventListener("change", function () {
                        cond.valueSubType = condSubSelect.value;
                        if (condSubSelect.value === "boolean") {
                          cond.value = "true";
                        } else if (condSubSelect.value === "null") {
                          cond.value = "";
                        } else if (condSubSelect.value === "number") {
                          var pn = Number(cond.value);
                          if (isNaN(pn)) cond.value = "";
                        }
                        renderBodyFiltersPanel();
                        renderChips();
                      });
                      condValRow.appendChild(condSubSelect);

                      if (condSubType === "boolean") {
                        var condBoolSel = document.createElement("select");
                        condBoolSel.className =
                          "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                        var cbTrue = document.createElement("option");
                        cbTrue.value = "true";
                        cbTrue.textContent = "true";
                        if (cond.value === "true") cbTrue.selected = true;
                        var cbFalse = document.createElement("option");
                        cbFalse.value = "false";
                        cbFalse.textContent = "false";
                        if (cond.value === "false") cbFalse.selected = true;
                        condBoolSel.appendChild(cbTrue);
                        condBoolSel.appendChild(cbFalse);
                        condBoolSel.addEventListener("change", function () {
                          cond.value = condBoolSel.value;
                          renderChips();
                        });
                        condValRow.appendChild(condBoolSel);
                      } else if (condSubType === "null") {
                        var condNullSpan = document.createElement("span");
                        condNullSpan.className =
                          "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
                        condNullSpan.textContent = "null";
                        condValRow.appendChild(condNullSpan);
                      } else {
                        var condValInput = document.createElement("input");
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
                      var condSwInput = document.createElement("input");
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
                      if (!cond.notInnerType) cond.notInnerType = "any";
                      if (!cond.notInnerSubType) {
                        cond.notInnerSubType = "text";
                      }
                      if (cond.notInnerValue === undefined) {
                        cond.notInnerValue = "";
                      }

                      var condNotWrapper = document.createElement("div");
                      condNotWrapper.className =
                        "mt-1 ml-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2 dark:bg-amber-900/10 dark:border-amber-700/50";
                      var condNotTitle = document.createElement("span");
                      condNotTitle.className =
                        "block text-xs font-medium text-amber-700 dark:text-amber-400";
                      condNotTitle.textContent = "Exclure :";
                      condNotWrapper.appendChild(condNotTitle);

                      var condNotTypeSelect = document.createElement("select");
                      condNotTypeSelect.className =
                        "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                      var condNotTypes = [
                        { value: "any", label: "Valeur exacte" },
                        {
                          value: "stringwildcard",
                          label: "Pattern (wildcard)",
                        },
                      ];
                      for (var cnt = 0; cnt < condNotTypes.length; cnt++) {
                        var cnOpt = document.createElement("option");
                        cnOpt.value = condNotTypes[cnt].value;
                        cnOpt.textContent = condNotTypes[cnt].label;
                        if (cond.notInnerType === condNotTypes[cnt].value) {
                          cnOpt.selected = true;
                        }
                        condNotTypeSelect.appendChild(cnOpt);
                      }
                      condNotTypeSelect.addEventListener(
                        "change",
                        function () {
                          cond.notInnerType = condNotTypeSelect.value;
                          if (condNotTypeSelect.value === "any") {
                            if (!cond.notInnerSubType) {
                              cond.notInnerSubType = "text";
                            }
                          } else {
                            cond.notInnerSubType = "text";
                          }
                          cond.notInnerValue = "";
                          renderBodyFiltersPanel();
                          renderChips();
                        },
                      );
                      condNotWrapper.appendChild(condNotTypeSelect);

                      var condNotValRow = document.createElement("div");
                      condNotValRow.className = "flex gap-1 mt-1";
                      if (cond.notInnerType === "any") {
                        var cnSubType = cond.notInnerSubType || "text";
                        var cnSubSelect = document.createElement("select");
                        cnSubSelect.className =
                          "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                        var cnSubOpts = [
                          { value: "text", label: "Texte" },
                          { value: "number", label: "Nombre" },
                          { value: "boolean", label: "Bool\u00e9en" },
                          { value: "null", label: "Null" },
                        ];
                        for (var cns = 0; cns < cnSubOpts.length; cns++) {
                          var cnsOpt = document.createElement("option");
                          cnsOpt.value = cnSubOpts[cns].value;
                          cnsOpt.textContent = cnSubOpts[cns].label;
                          if (cnSubType === cnSubOpts[cns].value) {
                            cnsOpt.selected = true;
                          }
                          cnSubSelect.appendChild(cnsOpt);
                        }
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
                          var cnBoolSel = document.createElement("select");
                          cnBoolSel.className =
                            "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                          var cnbT = document.createElement("option");
                          cnbT.value = "true";
                          cnbT.textContent = "true";
                          if (cond.notInnerValue === "true") {
                            cnbT.selected = true;
                          }
                          var cnbF = document.createElement("option");
                          cnbF.value = "false";
                          cnbF.textContent = "false";
                          if (cond.notInnerValue === "false") {
                            cnbF.selected = true;
                          }
                          cnBoolSel.appendChild(cnbT);
                          cnBoolSel.appendChild(cnbF);
                          cnBoolSel.addEventListener("change", function () {
                            cond.notInnerValue = cnBoolSel.value;
                            renderChips();
                          });
                          condNotValRow.appendChild(cnBoolSel);
                        } else if (cnSubType === "null") {
                          var cnNullSpan = document.createElement("span");
                          cnNullSpan.className =
                            "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
                          cnNullSpan.textContent = "null";
                          condNotValRow.appendChild(cnNullSpan);
                        } else {
                          var cnValInput = document.createElement("input");
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
                        var cnPatInput = document.createElement("input");
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
                      condBlock.appendChild(condNotWrapper);
                    }

                    andWrapper.appendChild(condBlock);
                  })(ci);
                }

                var btnAddCond = document.createElement("button");
                btnAddCond.type = "button";
                btnAddCond.className =
                  "text-sm text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200";
                btnAddCond.textContent = "+ Ajouter une condition";
                btnAddCond.setAttribute(
                  "aria-label",
                  "Ajouter une condition au groupe ET",
                );
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
                filterBlock.appendChild(andWrapper);
              }

              if (
                filterData.filterType !== "wildcard" &&
                filterData.filterType !== "not" &&
                filterData.filterType !== "and"
              ) {
                if (!filterData.valueSubTypes) filterData.valueSubTypes = [];

                var valuesLabel = document.createElement("div");
                valuesLabel.className = "text-xs text-gray-500 dark:text-gray-400 mt-2";
                valuesLabel.textContent = "Valeurs (une des suivantes) :";
                filterBlock.appendChild(valuesLabel);

                var valuesContainer = document.createElement("div");
                valuesContainer.className = "space-y-1 mt-1";

                var isExactType = filterData.filterType === "any";

                for (var vi = 0; vi < filterData.values.length; vi++) {
                  (function (valIndex) {
                    var subType = filterData.valueSubTypes[valIndex] || "text";
                    var valRow = document.createElement("div");
                    valRow.className = "flex gap-1";
                    var valInputId = "bf-val-" + filterData.id + "-" + valIndex;

                    if (isExactType) {
                      var subTypeSelectId = "bf-subtype-" + filterData.id + "-" + valIndex;
                      var subTypeSelect = document.createElement("select");
                      subTypeSelect.id = subTypeSelectId;
                      subTypeSelect.className =
                        "w-24 flex-shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                      subTypeSelect.setAttribute(
                        "aria-label",
                        "Type de la valeur " + (valIndex + 1),
                      );
                      var subTypeOpts = [
                        { value: "text", label: "Texte" },
                        { value: "number", label: "Nombre" },
                        { value: "boolean", label: "Bool\u00e9en" },
                        { value: "null", label: "Null" },
                      ];
                      for (var st = 0; st < subTypeOpts.length; st++) {
                        var stOpt = document.createElement("option");
                        stOpt.value = subTypeOpts[st].value;
                        stOpt.textContent = subTypeOpts[st].label;
                        if (subType === subTypeOpts[st].value) {
                          stOpt.selected = true;
                        }
                        subTypeSelect.appendChild(stOpt);
                      }
                      subTypeSelect.addEventListener("change", function () {
                        filterData.valueSubTypes[valIndex] = subTypeSelect.value;
                        if (subTypeSelect.value === "boolean") {
                          filterData.values[valIndex] = "true";
                        } else if (subTypeSelect.value === "null") {
                          filterData.values[valIndex] = "";
                        } else if (subTypeSelect.value === "number") {
                          var parsed = Number(filterData.values[valIndex]);
                          if (isNaN(parsed)) filterData.values[valIndex] = "";
                        }
                        renderBodyFiltersPanel();
                        renderChips();
                      });
                      valRow.appendChild(subTypeSelect);
                    }

                    if (isExactType && subType === "boolean") {
                      var boolSelect = document.createElement("select");
                      boolSelect.id = valInputId;
                      boolSelect.className =
                        "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
                      boolSelect.setAttribute(
                        "aria-label",
                        "Valeur " + (valIndex + 1) + " du filtre " +
                          (filterIndex + 1),
                      );
                      var boolTrue = document.createElement("option");
                      boolTrue.value = "true";
                      boolTrue.textContent = "true";
                      if (filterData.values[valIndex] === "true") {
                        boolTrue.selected = true;
                      }
                      var boolFalse = document.createElement("option");
                      boolFalse.value = "false";
                      boolFalse.textContent = "false";
                      if (filterData.values[valIndex] === "false") {
                        boolFalse.selected = true;
                      }
                      boolSelect.appendChild(boolTrue);
                      boolSelect.appendChild(boolFalse);
                      boolSelect.addEventListener("change", function () {
                        filterData.values[valIndex] = boolSelect.value;
                        renderChips();
                      });
                      valRow.appendChild(boolSelect);
                    } else if (isExactType && subType === "null") {
                      var nullSpan = document.createElement("span");
                      nullSpan.className =
                        "flex-1 rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-400 italic dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500";
                      nullSpan.textContent = "null";
                      valRow.appendChild(nullSpan);
                    } else {
                      var valInput = document.createElement("input");
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
                        "Valeur " + (valIndex + 1) + " du filtre " +
                          (filterIndex + 1),
                      );
                      valInput.addEventListener("input", function () {
                        filterData.values[valIndex] = valInput.value;
                        renderChips();
                      });
                      valRow.appendChild(valInput);
                    }

                    var btnRemoveVal = document.createElement("button");
                    btnRemoveVal.type = "button";
                    btnRemoveVal.className =
                      "flex-shrink-0 rounded px-2 py-1 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/30";
                    btnRemoveVal.textContent = "\u00d7";
                    btnRemoveVal.setAttribute(
                      "aria-label",
                      "Supprimer la valeur " + (valIndex + 1),
                    );
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

                filterBlock.appendChild(valuesContainer);

                var btnAddVal = document.createElement("button");
                btnAddVal.type = "button";
                btnAddVal.className =
                  "mt-1 text-xs text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
                btnAddVal.textContent = "+ Ajouter une valeur";
                btnAddVal.addEventListener("click", function () {
                  filterData.values.push("");
                  if (!filterData.valueSubTypes) {
                    filterData.valueSubTypes = [];
                  }
                  filterData.valueSubTypes.push("text");
                  renderBodyFiltersPanel();
                  var newIdx = filterData.values.length - 1;
                  var newInput = document.getElementById(
                    "bf-val-" + filterData.id + "-" + newIdx,
                  );
                  if (newInput) newInput.focus();
                });
                filterBlock.appendChild(btnAddVal);
              }

              content.appendChild(filterBlock);
            })(fi);
          }

          var btnAddFilter = document.createElement("button");
          btnAddFilter.type = "button";
          btnAddFilter.id = "bf-add-" + safeId;
          btnAddFilter.className =
            "mt-2 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
          btnAddFilter.textContent = "+ Ajouter un filtre";
          btnAddFilter.addEventListener("click", function () {
            var newFilter = {
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
            var newFieldInput = document.getElementById(
              "bf-field-" + newFilter.id,
            );
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

  document
    .getElementById("btn-preset-scalingo")
    .addEventListener("click", function () {
      targetInput.value = "https://api.osc-fr1.scalingo.com";
      authSelect.value = "scalingo-exchange";
      authHeaderName.classList.add("hidden");
      btnLoadApps.classList.remove("hidden");
      scopesTextarea.value = "GET:/v1/apps/*";
      tokenInput.placeholder = "tk-us-...";
      updateBodyFiltersVisibility();
    });

  document
    .getElementById("btn-preset-clear")
    .addEventListener("click", function () {
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
    btnLoadApps.classList.toggle(
      "hidden",
      authSelect.value !== "scalingo-exchange",
    );
  });

  // --- Load apps (Scalingo helper) ---

  btnLoadApps.addEventListener("click", async function () {
    var token = tokenInput.value.trim();
    if (!token) {
      showError("Veuillez saisir un token.");
      return;
    }

    btnLoadApps.disabled = true;
    btnLoadApps.textContent = "Chargement\u2026";
    hideError();

    try {
      var res = await fetch("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      });
      if (!res.ok) {
        var errData = await res.json().catch(function () {
          return {};
        });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      var data = await res.json();
      var apps = data.apps || [];
      renderApps(apps);
    } catch (e) {
      showError("Impossible de charger les apps : " + e.message);
    } finally {
      btnLoadApps.disabled = false;
      btnLoadApps.textContent = "Charger les apps";
    }
  });

  function renderApps(apps) {
    appsList.textContent = "";
    apps.forEach(function (name) {
      var label = document.createElement("label");
      label.className =
        "flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      cb.className = "rounded border-gray-300 text-fgp-600 focus:ring-fgp-500";
      cb.addEventListener("change", function () {
        updateScopesFromApps();
      });
      var span = document.createElement("span");
      span.textContent = name;
      label.appendChild(cb);
      label.appendChild(span);
      appsList.appendChild(label);
    });
    appsSection.classList.remove("hidden");
  }

  function updateScopesFromApps() {
    var checked = appsList.querySelectorAll("input:checked");
    var lines = [];
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

  document.querySelectorAll("input[name=ttl]").forEach(function (radio) {
    radio.addEventListener("change", function () {
      customTtlWrapper.classList.toggle("hidden", radio.value !== "custom");
      ttlWarning.classList.toggle("hidden", radio.value !== "0");
    });
  });

  // --- Phase 5: Serialization ---

  function buildScopes() {
    var textareaScopes = scopesTextarea.value
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean);
    var result = [];

    var withFilters = getScopesWithFilters();

    for (var i = 0; i < withFilters.length; i++) {
      var scopeKey = withFilters[i];
      var parsed = parseScope(scopeKey);
      if (!parsed) continue;
      var filters = bodyFiltersData[scopeKey];
      var serializedFilters = [];
      for (var fi = 0; fi < filters.length; fi++) {
        var f = filters[fi];
        if (!f.objectPath || !f.objectPath.trim()) continue;
        var objValues = [];
        if (f.filterType === "wildcard") {
          objValues.push({ type: "wildcard", value: "*" });
        } else if (f.filterType === "not") {
          var notInner = f.notInnerType || "any";
          var notSub = f.notInnerSubType || "text";
          var notVal = (f.notInnerValue || "").trim();
          var innerValue = null;
          if (notInner === "any") {
            if (notSub === "null") {
              innerValue = null;
            } else if (notSub === "boolean") {
              innerValue = notVal === "true";
            } else if (notSub === "number") {
              var notNum = Number(notVal);
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
          var andSubs = [];
          var aConds = f.andConditions || [];
          for (var ai = 0; ai < aConds.length; ai++) {
            var ac = aConds[ai];
            if (ac.conditionType === "any") {
              var acSub = ac.valueSubType || "text";
              var acVal = (ac.value || "").trim();
              if (acSub === "null") {
                andSubs.push({ type: "any", value: null });
              } else if (acSub === "boolean") {
                andSubs.push({ type: "any", value: acVal === "true" });
              } else if (acSub === "number") {
                var acNum = Number(acVal);
                if (acVal && !isNaN(acNum)) {
                  andSubs.push({ type: "any", value: acNum });
                }
              } else {
                if (acVal) andSubs.push({ type: "any", value: acVal });
              }
            } else if (ac.conditionType === "stringwildcard") {
              var swVal = (ac.value || "").trim();
              if (swVal) {
                andSubs.push({ type: "stringwildcard", value: swVal });
              }
            } else if (ac.conditionType === "wildcard") {
              andSubs.push({ type: "wildcard", value: "*" });
            } else if (ac.conditionType === "not") {
              var acNotInner = ac.notInnerType || "any";
              var acNotSub = ac.notInnerSubType || "text";
              var acNotVal = (ac.notInnerValue || "").trim();
              var acInnerValue = undefined;
              if (acNotInner === "any") {
                if (acNotSub === "null") acInnerValue = null;
                else if (acNotSub === "boolean") {
                  acInnerValue = acNotVal === "true";
                } else if (acNotSub === "number") {
                  var acNotNum = Number(acNotVal);
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
          var subTypes = f.valueSubTypes || [];
          for (var vi = 0; vi < f.values.length; vi++) {
            var v = f.values[vi].trim();
            var st = subTypes[vi] || "text";
            if (f.filterType === "any") {
              if (st === "null") {
                objValues.push({ type: "any", value: null });
              } else if (st === "boolean") {
                objValues.push({ type: "any", value: v === "true" });
              } else if (st === "number") {
                var num = Number(v);
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
        var methods = parsed.method === "*" ? ["*"] : [parsed.method];
        result.push({
          methods: methods,
          pattern: parsed.path,
          bodyFilters: serializedFilters,
        });
      } else {
        result.push(scopeKey);
      }
    }

    for (var j = 0; j < textareaScopes.length; j++) {
      if (withFilters.indexOf(textareaScopes[j]) === -1) {
        result.push(textareaScopes[j]);
      }
    }

    return result;
  }

  // --- Generate ---

  document
    .getElementById("fgp-form")
    .addEventListener("submit", async function (e) {
      e.preventDefault();
      hideError();

      var token = tokenInput.value.trim();
      var target = targetInput.value.trim();
      var auth = authSelect.value;
      if (auth === "header:") {
        var headerName = authHeaderName.value.trim();
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

      var scopes = buildScopes();
      if (scopes.length === 0) {
        showError("Au moins un scope requis.");
        return;
      }

      var ttlRadio = document.querySelector("input[name=ttl]:checked");
      if (!ttlRadio) {
        showError("S\u00e9lectionnez une dur\u00e9e de validit\u00e9.");
        return;
      }
      var ttl = 0;
      if (ttlRadio.value === "custom") {
        var customVal = document.getElementById("custom-ttl").value;
        if (!customVal || Number(customVal) < 60) {
          showError("TTL personnalis\u00e9 invalide (minimum 60s).");
          return;
        }
        ttl = Number(customVal);
      } else {
        ttl = Number(ttlRadio.value);
      }

      var btn = document.getElementById("btn-generate");
      btn.disabled = true;
      btn.textContent = "G\u00e9n\u00e9ration\u2026";

      try {
        var res = await fetch("/api/generate", {
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
          var errData = await res.json().catch(function () {
            return {};
          });
          throw new Error(errData.message || "Erreur " + res.status);
        }
        var data = await res.json();

        document.getElementById("result-url").value = data.url;
        document.getElementById("result-key").value = data.key;
        document.getElementById("result-curl").textContent = 'curl -H "X-FGP-Key: ' + data.key +
          '" ' + data.url + "v1/apps";
        resultSection.classList.remove("hidden");
      } catch (err) {
        showError(
          "Erreur lors de la g\u00e9n\u00e9ration : " + err.message,
        );
      } finally {
        btn.disabled = false;
        btn.textContent = "G\u00e9n\u00e9rer l'URL";
      }
    });

  // --- Copy buttons ---

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".copy-btn");
    if (!btn) return;
    var targetId = btn.getAttribute("data-copy");
    var el = document.getElementById(targetId);
    if (!el) return;
    var text = el.value || el.textContent || "";
    navigator.clipboard.writeText(text).then(function () {
      var orig = btn.textContent;
      btn.textContent = "Copi\u00e9 !";
      setTimeout(function () {
        btn.textContent = orig;
      }, 1500);
    });
  });

  updateBodyFiltersVisibility();
})();
