import { Layout } from "./layout.tsx";

const TTL_PRESETS = [
  { label: "1 heure", value: "3600" },
  { label: "24 heures", value: "86400" },
  { label: "7 jours", value: "604800" },
  { label: "30 jours", value: "2592000" },
  { label: "Personnalisé", value: "custom" },
  { label: "Pas d'expiration", value: "0" },
];

const AUTH_MODES = [
  { label: "Bearer token", value: "bearer" },
  { label: "Basic auth", value: "basic" },
  { label: "Scalingo exchange", value: "scalingo-exchange" },
  { label: "Header custom", value: "header:" },
];

export function ConfigPage() {
  return (
    <Layout>
      <div class="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <header class="mb-8">
          <h1 class="text-2xl font-bold text-fgp-900 dark:text-fgp-100 tracking-tight">
            Fine-Grained Proxy
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Générer une URL proxy avec des permissions granulaires pour n'importe quelle API.
          </p>
        </header>

        <form id="fgp-form" class="space-y-6" autocomplete="off">
          {/* Preset */}
          <section>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Preset
            </label>
            <div class="flex gap-2">
              <button
                type="button"
                id="btn-preset-scalingo"
                class="rounded-md border border-fgp-500 bg-fgp-50 px-3 py-1.5 text-sm font-medium text-fgp-700 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 dark:bg-fgp-900 dark:text-fgp-200 dark:border-fgp-600 dark:hover:bg-fgp-800 dark:focus:ring-offset-gray-900"
              >
                Scalingo
              </button>
              <button
                type="button"
                id="btn-preset-clear"
                class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:ring-offset-gray-900"
              >
                Vide
              </button>
            </div>
          </section>

          {/* Target */}
          <section>
            <label
              for="target"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              URL cible de l'API
            </label>
            <input
              type="url"
              id="target"
              name="target"
              placeholder="https://api.example.com"
              required
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </section>

          {/* Auth */}
          <section>
            <label
              for="auth"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Mode d'authentification
            </label>
            <div class="flex gap-2">
              <select
                id="auth"
                name="auth"
                class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
              >
                {AUTH_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <input
                type="text"
                id="auth-header-name"
                placeholder="X-API-Key"
                aria-label="Nom du header d'authentification"
                class="hidden w-40 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          </section>

          {/* Token */}
          <section>
            <label
              for="token"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Token / Clé API
            </label>
            <div class="flex gap-2">
              <input
                type="password"
                id="token"
                name="token"
                placeholder="tk-us-..."
                required
                class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                aria-describedby="token-hint"
              />
              <button
                type="button"
                id="btn-load-apps"
                class="hidden rounded-md bg-fgp-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
              >
                Charger les apps
              </button>
            </div>
            <p id="token-hint" class="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Le token est envoyé au serveur FGP via HTTPS pour le chiffrement. Il n'est jamais
              stocké.
            </p>
          </section>

          {/* Scalingo apps helper */}
          <section id="apps-section" class="hidden">
            <fieldset>
              <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Applications Scalingo
              </legend>
              <div
                id="apps-list"
                class="space-y-1 rounded-md border border-gray-200 bg-white p-3 max-h-48 overflow-y-auto dark:bg-gray-800 dark:border-gray-600"
                role="group"
                aria-label="Sélection des applications"
              >
              </div>
            </fieldset>
          </section>

          {/* Scopes */}
          <section>
            <label
              for="scopes"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Scopes (patterns METHOD:PATH)
            </label>
            <div id="scope-chips" class="space-y-1 mb-2 hidden"></div>
            <textarea
              id="scopes"
              name="scopes"
              rows={4}
              placeholder={`GET:/v1/apps/*\nPOST:/v1/apps/my-app/scale\n*:*`}
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              aria-describedby="scopes-hint"
            >
            </textarea>
            <p id="scopes-hint" class="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Un pattern par ligne. Wildcard * pour tout matcher.
            </p>
            <button
              type="button"
              id="btn-add-body-filters"
              class="hidden mt-1 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline"
            >
              + Ajouter des filtres body sur un scope...
            </button>
            <div
              id="body-filters-panel"
              class="hidden mt-3 rounded-md border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-600"
              role="region"
              aria-label="Filtres body avanc&#233;s"
            >
              <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Body Filters (avanc&#233;)
                </span>
                <button
                  type="button"
                  id="btn-close-body-filters"
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-fgp-500 rounded p-1"
                  aria-label="Fermer le panel body filters"
                >
                  &#10005;
                </button>
              </div>
              <div id="body-filters-list" class="p-4 space-y-1"></div>
            </div>
          </section>

          {/* TTL */}
          <section>
            <fieldset>
              <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Durée de validité
              </legend>
              <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Durée de validité">
                {TTL_PRESETS.map((preset) => (
                  <label
                    key={preset.value}
                    class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm cursor-pointer hover:border-fgp-500 has-[:checked]:bg-fgp-600 has-[:checked]:text-white has-[:checked]:border-fgp-600 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:border-fgp-400"
                  >
                    <input
                      type="radio"
                      name="ttl"
                      value={preset.value}
                      checked={preset.value === "86400"}
                      class="sr-only"
                    />
                    {preset.label}
                  </label>
                ))}
              </div>
              <div id="custom-ttl-wrapper" class="mt-2 hidden">
                <label for="custom-ttl" class="sr-only">TTL personnalisé en secondes</label>
                <input
                  type="number"
                  id="custom-ttl"
                  name="custom-ttl"
                  placeholder="Durée en secondes"
                  min="60"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
              </div>
              <div
                id="ttl-warning"
                class="mt-2 hidden rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300"
                role="alert"
              >
                Attention : sans expiration, cette URL restera valide indéfiniment.
              </div>
            </fieldset>
          </section>

          {/* Generate */}
          <section>
            <button
              type="submit"
              id="btn-generate"
              class="w-full rounded-md bg-fgp-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-fgp-800 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
            >
              Générer l'URL
            </button>
          </section>
        </form>

        {/* Result */}
        <section id="result-section" class="mt-8 hidden">
          <div class="rounded-md border border-green-200 bg-green-50 p-4 space-y-4 dark:bg-green-900/30 dark:border-green-700">
            <h2 class="text-sm font-semibold text-green-900 dark:text-green-200">URL générée</h2>

            <div>
              <label class="block text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                URL du proxy
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  id="result-url"
                  readonly
                  class="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-mono text-gray-800 select-all dark:bg-gray-800 dark:border-green-700 dark:text-gray-200"
                  aria-label="URL générée"
                />
                <button
                  type="button"
                  data-copy="result-url"
                  class="copy-btn rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-gray-700"
                  aria-label="Copier l'URL"
                >
                  Copier
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                Clé (header <code class="font-mono">X-FGP-Key</code>)
              </label>
              <div class="flex gap-2">
                <input
                  type="text"
                  id="result-key"
                  readonly
                  class="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-mono text-gray-800 select-all dark:bg-gray-800 dark:border-green-700 dark:text-gray-200"
                  aria-label="Clé X-FGP-Key"
                />
                <button
                  type="button"
                  data-copy="result-key"
                  class="copy-btn rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-gray-700"
                  aria-label="Copier la clé"
                >
                  Copier
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                Exemple d'utilisation
              </label>
              <div class="flex gap-2">
                <pre
                  id="result-curl"
                  class="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre dark:bg-gray-800 dark:border-green-700 dark:text-gray-200"
                ></pre>
                <button
                  type="button"
                  data-copy="result-curl"
                  class="copy-btn self-start rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-gray-700"
                  aria-label="Copier la commande curl"
                >
                  Copier
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Error */}
        <div
          id="error-banner"
          class="mt-4 hidden rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300"
          role="alert"
        >
        </div>

        <script
          dangerouslySetInnerHTML={{ __html: clientScript() }}
        />
      </div>
    </Layout>
  );
}

function clientScript(): string {
  return `
(function() {
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
    setTimeout(function() { errorBanner.classList.add("hidden"); }, 8000);
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
    return { method: trimmed.substring(0, idx), path: trimmed.substring(idx + 1), raw: trimmed };
  }

  function isEligible(parsed) {
    if (!parsed) return false;
    return ELIGIBLE_METHODS.indexOf(parsed.method) !== -1;
  }

  function getEligibleScopes() {
    var lines = scopesTextarea.value.split("\\n");
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
    if (idx === -1) return raw.substring(0, maxLen) + "\\u2026";
    var method = raw.substring(0, idx + 1);
    var path = raw.substring(idx + 1);
    var budget = maxLen - method.length - 3;
    if (budget < 5) return raw.substring(0, maxLen) + "\\u2026";
    return method + "\\u2026" + path.substring(path.length - budget);
  }

  function filterSummary(scopeKey) {
    var filters = bodyFiltersData[scopeKey] || [];
    var parts = [];
    for (var i = 0; i < filters.length; i++) {
      var f = filters[i];
      var field = f.objectPath || "?";
      if (f.filterType === "wildcard") {
        parts.push(field + " exists");
      } else {
        var vals = [];
        for (var j = 0; j < f.values.length; j++) {
          if (f.values[j].trim()) vals.push(f.values[j].trim());
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
    scopeChips.innerHTML = "";
    if (withFilters.length === 0) {
      scopeChips.classList.add("hidden");
      return;
    }
    scopeChips.classList.remove("hidden");
    for (var i = 0; i < withFilters.length; i++) {
      (function(scopeKey) {
        var chip = document.createElement("div");
        chip.className = "flex items-center gap-2 rounded-md border border-fgp-200 bg-fgp-50 px-3 py-2 text-sm font-mono dark:bg-fgp-900/50 dark:border-fgp-700";

        var textSpan = document.createElement("span");
        textSpan.className = "flex-1 truncate text-gray-800 dark:text-gray-200";
        var summary = filterSummary(scopeKey);
        textSpan.textContent = truncatePath(scopeKey, 50) + (summary ? " \\u2192 " + summary : "");
        textSpan.title = scopeKey + (summary ? " \\u2192 " + summary : "");

        var btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-fgp-600 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:text-fgp-400 dark:hover:bg-fgp-800";
        btnEdit.textContent = "\\u00e9diter";
        btnEdit.setAttribute("aria-label", "\\u00c9diter les filtres de " + scopeKey);
        btnEdit.addEventListener("click", function() {
          bodyFiltersPanel.classList.remove("hidden");
          renderBodyFiltersPanel();
          var target = document.getElementById("bf-scope-" + scopeKey.replace(/[^a-zA-Z0-9]/g, "_"));
          if (target) {
            expandScope(scopeKey);
            target.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });

        var btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/30";
        btnRemove.textContent = "\\u00d7";
        btnRemove.setAttribute("aria-label", "Supprimer le scope " + scopeKey + " et ses filtres");
        btnRemove.addEventListener("click", function() {
          delete bodyFiltersData[scopeKey];
          var lines = scopesTextarea.value.split("\\n");
          var kept = [];
          for (var k = 0; k < lines.length; k++) {
            if (lines[k].trim() !== scopeKey) kept.push(lines[k]);
          }
          scopesTextarea.value = kept.join("\\n");
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

  btnAddBodyFilters.addEventListener("click", function() {
    bodyFiltersPanel.classList.remove("hidden");
    renderBodyFiltersPanel();
    bodyFiltersPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  btnCloseBodyFilters.addEventListener("click", function() {
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
      if (allScopes.indexOf(withFilters[j]) === -1) allScopes.push(withFilters[j]);
    }

    bodyFiltersList.innerHTML = "";

    if (allScopes.length === 0) {
      var empty = document.createElement("p");
      empty.className = "text-sm text-gray-400 dark:text-gray-500";
      empty.textContent = "Aucun scope \\u00e9ligible (POST, PUT, PATCH).";
      bodyFiltersList.appendChild(empty);
      return;
    }

    for (var s = 0; s < allScopes.length; s++) {
      (function(scopeKey) {
        var inTextarea = eligible.indexOf(scopeKey) !== -1;
        var filters = bodyFiltersData[scopeKey] || [];
        var filterCount = filters.length;
        var isExpanded = !!expandedScopes[scopeKey];
        var safeId = "bf-scope-" + scopeKey.replace(/[^a-zA-Z0-9]/g, "_");
        var contentId = safeId + "-content";

        var row = document.createElement("div");
        row.id = safeId;

        var header = document.createElement("button");
        header.type = "button";
        header.className = "w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-mono cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-left" + (isExpanded ? " bg-fgp-50 dark:bg-fgp-900/30 border-l-2 border-fgp-500" : " text-gray-700 dark:text-gray-300");
        header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        header.setAttribute("aria-controls", contentId);

        if (!inTextarea) {
          header.className += " opacity-50";
          header.title = "Scope introuvable dans le textarea";
        }

        var chevron = document.createElement("span");
        chevron.className = "flex-shrink-0 text-xs transition-transform" + (isExpanded ? " rotate-90" : "");
        chevron.textContent = "\\u25b6";
        chevron.setAttribute("aria-hidden", "true");

        var label = document.createElement("span");
        label.className = "flex-1 truncate";
        label.textContent = scopeKey;

        var badge = document.createElement("span");
        badge.className = "text-xs text-fgp-600 dark:text-fgp-300 font-medium flex items-center gap-1";
        badge.textContent = filterCount + " filtre" + (filterCount > 1 ? "s" : "");

        if (filterCount > 0) {
          var dot = document.createElement("span");
          dot.className = "w-2 h-2 rounded-full bg-fgp-500 inline-block";
          dot.setAttribute("aria-hidden", "true");
          badge.appendChild(dot);
        }

        header.appendChild(chevron);
        header.appendChild(label);
        header.appendChild(badge);

        header.addEventListener("click", function() {
          if (isExpanded) collapseScope(scopeKey);
          else expandScope(scopeKey);
        });
        header.addEventListener("keydown", function(ev) {
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
          content.className = "ml-4 mt-2 mb-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4";

          if (!bodyFiltersData[scopeKey]) {
            bodyFiltersData[scopeKey] = [];
          }
          var scopeFilters = bodyFiltersData[scopeKey];

          for (var fi = 0; fi < scopeFilters.length; fi++) {
            (function(filterIndex) {
              var filterData = scopeFilters[filterIndex];

              if (filterIndex > 0) {
                var andLabel = document.createElement("div");
                andLabel.className = "text-center py-1";
                var andSpan = document.createElement("span");
                andSpan.className = "text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider";
                andSpan.textContent = "ET";
                andSpan.setAttribute("aria-label", "et aussi");
                andLabel.appendChild(andSpan);
                content.appendChild(andLabel);
              }

              var filterBlock = document.createElement("div");
              filterBlock.className = "rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2 dark:bg-gray-700/50 dark:border-gray-600";

              var filterHeader = document.createElement("div");
              filterHeader.className = "flex items-center justify-between";
              var filterTitle = document.createElement("span");
              filterTitle.className = "text-xs font-medium text-gray-500 dark:text-gray-400";
              filterTitle.textContent = "Filtre " + (filterIndex + 1);
              var btnDelete = document.createElement("button");
              btnDelete.type = "button";
              btnDelete.className = "text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 rounded p-0.5";
              btnDelete.setAttribute("aria-label", "Supprimer le filtre " + (filterIndex + 1));
              btnDelete.innerHTML = "&#128465;";
              btnDelete.addEventListener("click", function() {
                scopeFilters.splice(filterIndex, 1);
                if (scopeFilters.length === 0) delete bodyFiltersData[scopeKey];
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
              fieldInput.className = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
              fieldInput.addEventListener("input", function() {
                filterData.objectPath = fieldInput.value;
                renderChips();
              });
              filterBlock.appendChild(fieldLabel);
              filterBlock.appendChild(fieldInput);

              var typeId = "bf-type-" + filterData.id;
              var typeLabel = document.createElement("label");
              typeLabel.className = "block text-xs font-medium text-gray-600 dark:text-gray-400 mt-2";
              typeLabel.setAttribute("for", typeId);
              typeLabel.textContent = "Type";
              var typeSelect = document.createElement("select");
              typeSelect.id = typeId;
              typeSelect.className = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100";
              var types = [
                { value: "any", label: "Valeur exacte" },
                { value: "stringwildcard", label: "Pattern (wildcard)" },
                { value: "wildcard", label: "Existe (toute valeur)" }
              ];
              for (var t = 0; t < types.length; t++) {
                var opt = document.createElement("option");
                opt.value = types[t].value;
                opt.textContent = types[t].label;
                if (filterData.filterType === types[t].value) opt.selected = true;
                typeSelect.appendChild(opt);
              }
              typeSelect.addEventListener("change", function() {
                filterData.filterType = typeSelect.value;
                if (filterData.filterType === "wildcard") {
                  filterData.values = [];
                } else if (filterData.values.length === 0) {
                  filterData.values = [""];
                }
                renderBodyFiltersPanel();
                renderChips();
              });
              filterBlock.appendChild(typeLabel);
              filterBlock.appendChild(typeSelect);

              if (filterData.filterType !== "wildcard") {
                var valuesLabel = document.createElement("div");
                valuesLabel.className = "text-xs text-gray-500 dark:text-gray-400 mt-2";
                valuesLabel.textContent = "Valeurs (une des suivantes) :";
                filterBlock.appendChild(valuesLabel);

                var valuesContainer = document.createElement("div");
                valuesContainer.className = "space-y-1 mt-1";

                for (var vi = 0; vi < filterData.values.length; vi++) {
                  (function(valIndex) {
                    var valRow = document.createElement("div");
                    valRow.className = "flex gap-1";
                    var valInputId = "bf-val-" + filterData.id + "-" + valIndex;
                    var valInput = document.createElement("input");
                    valInput.type = "text";
                    valInput.id = valInputId;
                    valInput.value = filterData.values[valIndex] || "";
                    valInput.placeholder = filterData.filterType === "stringwildcard" ? "release/*" : "master";
                    valInput.className = "flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";
                    valInput.setAttribute("aria-label", "Valeur " + (valIndex + 1) + " du filtre " + (filterIndex + 1));
                    valInput.addEventListener("input", function() {
                      filterData.values[valIndex] = valInput.value;
                      renderChips();
                    });

                    var btnRemoveVal = document.createElement("button");
                    btnRemoveVal.type = "button";
                    btnRemoveVal.className = "flex-shrink-0 rounded px-2 py-1 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/30";
                    btnRemoveVal.textContent = "\\u00d7";
                    btnRemoveVal.setAttribute("aria-label", "Supprimer la valeur " + (valIndex + 1));
                    btnRemoveVal.addEventListener("click", function() {
                      filterData.values.splice(valIndex, 1);
                      if (filterData.values.length === 0) filterData.values = [""];
                      renderBodyFiltersPanel();
                      renderChips();
                    });

                    valRow.appendChild(valInput);
                    valRow.appendChild(btnRemoveVal);
                    valuesContainer.appendChild(valRow);
                  })(vi);
                }

                filterBlock.appendChild(valuesContainer);

                var btnAddVal = document.createElement("button");
                btnAddVal.type = "button";
                btnAddVal.className = "mt-1 text-xs text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
                btnAddVal.textContent = "+ Ajouter une valeur";
                btnAddVal.addEventListener("click", function() {
                  filterData.values.push("");
                  renderBodyFiltersPanel();
                  var newIdx = filterData.values.length - 1;
                  var newInput = document.getElementById("bf-val-" + filterData.id + "-" + newIdx);
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
          btnAddFilter.className = "mt-2 text-sm text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline";
          btnAddFilter.textContent = "+ Ajouter un filtre";
          btnAddFilter.addEventListener("click", function() {
            var newFilter = { id: nextFilterId++, objectPath: "", filterType: "any", values: [""] };
            if (!bodyFiltersData[scopeKey]) bodyFiltersData[scopeKey] = [];
            bodyFiltersData[scopeKey].push(newFilter);
            renderBodyFiltersPanel();
            renderChips();
            var newFieldInput = document.getElementById("bf-field-" + newFilter.id);
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

  document.getElementById("btn-preset-scalingo").addEventListener("click", function() {
    targetInput.value = "https://api.osc-fr1.scalingo.com";
    authSelect.value = "scalingo-exchange";
    authHeaderName.classList.add("hidden");
    btnLoadApps.classList.remove("hidden");
    scopesTextarea.value = "GET:/v1/apps/*";
    tokenInput.placeholder = "tk-us-...";
    updateBodyFiltersVisibility();
  });

  document.getElementById("btn-preset-clear").addEventListener("click", function() {
    targetInput.value = "";
    authSelect.value = "bearer";
    authHeaderName.classList.add("hidden");
    btnLoadApps.classList.add("hidden");
    appsSection.classList.add("hidden");
    scopesTextarea.value = "";
    tokenInput.placeholder = "Votre cl\\u00e9 API";
    bodyFiltersData = {};
    expandedScopes = {};
    bodyFiltersPanel.classList.add("hidden");
    updateBodyFiltersVisibility();
  });

  // --- Auth mode toggle ---

  authSelect.addEventListener("change", function() {
    if (authSelect.value === "header:") {
      authHeaderName.classList.remove("hidden");
    } else {
      authHeaderName.classList.add("hidden");
    }
    btnLoadApps.classList.toggle("hidden", authSelect.value !== "scalingo-exchange");
  });

  // --- Load apps (Scalingo helper) ---

  btnLoadApps.addEventListener("click", async function() {
    var token = tokenInput.value.trim();
    if (!token) { showError("Veuillez saisir un token."); return; }

    btnLoadApps.disabled = true;
    btnLoadApps.textContent = "Chargement\\u2026";
    hideError();

    try {
      var res = await fetch("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      });
      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
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
    appsList.innerHTML = "";
    apps.forEach(function(name) {
      var label = document.createElement("label");
      label.className = "flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = name;
      cb.className = "rounded border-gray-300 text-fgp-600 focus:ring-fgp-500";
      cb.addEventListener("change", function() {
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
    checked.forEach(function(cb) {
      lines.push("GET:/v1/apps/" + cb.value + "/*");
    });
    if (lines.length > 0) {
      lines.unshift("GET:/v1/apps");
    }
    scopesTextarea.value = lines.join("\\n");
    updateBodyFiltersVisibility();
  }

  // --- TTL ---

  document.querySelectorAll("input[name=ttl]").forEach(function(radio) {
    radio.addEventListener("change", function() {
      customTtlWrapper.classList.toggle("hidden", radio.value !== "custom");
      ttlWarning.classList.toggle("hidden", radio.value !== "0");
    });
  });

  // --- Phase 5: Serialization ---

  function buildScopes() {
    var textareaScopes = scopesTextarea.value.split("\\n").map(function(l) { return l.trim(); }).filter(Boolean);
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
        } else {
          for (var vi = 0; vi < f.values.length; vi++) {
            var v = f.values[vi].trim();
            if (v) {
              objValues.push({ type: f.filterType === "stringwildcard" ? "stringwildcard" : "any", value: v });
            }
          }
        }
        if (objValues.length > 0) {
          serializedFilters.push({ objectPath: f.objectPath.trim(), objectValue: objValues });
        }
      }
      if (serializedFilters.length > 0) {
        var methods = parsed.method === "*" ? ["*"] : [parsed.method];
        result.push({ methods: methods, pattern: parsed.path, bodyFilters: serializedFilters });
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

  document.getElementById("fgp-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    hideError();

    var token = tokenInput.value.trim();
    var target = targetInput.value.trim();
    var auth = authSelect.value;
    if (auth === "header:") {
      var headerName = authHeaderName.value.trim();
      if (!headerName) { showError("Nom du header requis."); return; }
      auth = "header:" + headerName;
    }

    if (!token) { showError("Token manquant."); return; }
    if (!target) { showError("URL cible manquante."); return; }

    var scopes = buildScopes();
    if (scopes.length === 0) { showError("Au moins un scope requis."); return; }

    var ttlRadio = document.querySelector("input[name=ttl]:checked");
    if (!ttlRadio) { showError("S\\u00e9lectionnez une dur\\u00e9e de validit\\u00e9."); return; }
    var ttl = 0;
    if (ttlRadio.value === "custom") {
      var customVal = document.getElementById("custom-ttl").value;
      if (!customVal || Number(customVal) < 60) { showError("TTL personnalis\\u00e9 invalide (minimum 60s)."); return; }
      ttl = Number(customVal);
    } else {
      ttl = Number(ttlRadio.value);
    }

    var btn = document.getElementById("btn-generate");
    btn.disabled = true;
    btn.textContent = "G\\u00e9n\\u00e9ration\\u2026";

    try {
      var res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, target: target, auth: auth, scopes: scopes, ttl: ttl }),
      });
      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      var data = await res.json();

      document.getElementById("result-url").value = data.url;
      document.getElementById("result-key").value = data.key;
      document.getElementById("result-curl").textContent =
        'curl -H "X-FGP-Key: ' + data.key + '" ' + data.url + "v1/apps";
      resultSection.classList.remove("hidden");
    } catch (err) {
      showError("Erreur lors de la g\\u00e9n\\u00e9ration : " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "G\\u00e9n\\u00e9rer l'URL";
    }
  });

  // --- Copy buttons ---

  document.addEventListener("click", function(e) {
    var btn = e.target.closest(".copy-btn");
    if (!btn) return;
    var targetId = btn.getAttribute("data-copy");
    var el = document.getElementById(targetId);
    if (!el) return;
    var text = el.value || el.textContent || "";
    navigator.clipboard.writeText(text).then(function() {
      var orig = btn.textContent;
      btn.textContent = "Copi\\u00e9 !";
      setTimeout(function() { btn.textContent = orig; }, 1500);
    });
  });

  updateBodyFiltersVisibility();
})();
`;
}
