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

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove("hidden");
    setTimeout(function() { errorBanner.classList.add("hidden"); }, 8000);
  }

  function hideError() {
    errorBanner.classList.add("hidden");
  }

  // --- Presets ---

  document.getElementById("btn-preset-scalingo").addEventListener("click", function() {
    targetInput.value = "https://api.osc-fr1.scalingo.com";
    authSelect.value = "scalingo-exchange";
    authHeaderName.classList.add("hidden");
    btnLoadApps.classList.remove("hidden");
    scopesTextarea.value = "GET:/v1/apps/*";
    tokenInput.placeholder = "tk-us-...";
  });

  document.getElementById("btn-preset-clear").addEventListener("click", function() {
    targetInput.value = "";
    authSelect.value = "bearer";
    authHeaderName.classList.add("hidden");
    btnLoadApps.classList.add("hidden");
    appsSection.classList.add("hidden");
    scopesTextarea.value = "";
    tokenInput.placeholder = "Votre cl\\u00e9 API";
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
  }

  // --- TTL ---

  document.querySelectorAll("input[name=ttl]").forEach(function(radio) {
    radio.addEventListener("change", function() {
      customTtlWrapper.classList.toggle("hidden", radio.value !== "custom");
      ttlWarning.classList.toggle("hidden", radio.value !== "0");
    });
  });

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

    var scopeLines = scopesTextarea.value.split("\\n").map(function(l) { return l.trim(); }).filter(Boolean);
    if (scopeLines.length === 0) { showError("Au moins un scope requis."); return; }

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
        body: JSON.stringify({ token: token, target: target, auth: auth, scopes: scopeLines, ttl: ttl }),
      });
      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      var data = await res.json();

      document.getElementById("result-url").value = data.url;
      document.getElementById("result-key").value = data.key;
      document.getElementById("result-curl").textContent =
        'curl -H "X-FGP-Key: ' + data.key + '" \\\\\n  ' + data.url + "v1/apps";
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
})();
`;
}
