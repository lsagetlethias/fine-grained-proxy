import { FgpLogo, Layout } from "./layout.tsx";

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
      <header class="mb-8">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <FgpLogo size={36} />
            <h1 class="text-2xl font-bold text-fgp-900 dark:text-fgp-100 tracking-tight">
              Fine-Grained Proxy
            </h1>
          </div>
          <a
            href="https://github.com/lsagetlethias/fine-grained-proxy"
            target="_blank"
            rel="noopener"
            class="text-gray-400 hover:text-fgp-600 dark:hover:text-fgp-400 transition-colors"
            aria-label="Voir le code source sur GitHub"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Générer une URL proxy avec des permissions granulaires pour n'importe quelle API.
        </p>
      </header>

      <main>
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div class="lg:col-span-3">
          <form id="fgp-form" class="space-y-6" autocomplete="off">
            {/* Preset */}
            <section>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Charger un preset
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
                  R&eacute;initialiser
                </button>
              </div>
              <p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Pr&eacute;-remplit le formulaire. Le bouton &laquo; Charger les apps &raquo; est
                disponible avec le mode d'auth Scalingo exchange.
              </p>
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
                Un pattern par ligne. Wildcard * pour tout matcher. Les scopes POST/PUT/PATCH
                permettent d'ajouter des filtres sur le contenu de la requ&ecirc;te.
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

          <script defer src="/static/client.js" />
        </div>

        <aside class="lg:col-span-2 lg:border-l lg:border-gray-200 lg:pl-8 dark:lg:border-gray-700 mt-8 lg:mt-0" aria-label="Documentation et aide">
          <nav class="sticky top-8 space-y-6 text-sm text-gray-600 dark:text-gray-400">
            <section>
              <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Guide d'utilisation
              </h3>
              <ol class="list-decimal list-inside space-y-2">
                <li>Choisissez un preset ou configurez manuellement les champs.</li>
                <li>Renseignez le token API de votre service cible.</li>
                <li>
                  D&eacute;finissez les scopes (permissions par route et m&eacute;thode HTTP).
                </li>
                <li>Configurez la dur&eacute;e de validit&eacute; (TTL) de l'URL.</li>
                <li>G&eacute;n&eacute;rez l'URL et la cl&eacute; client.</li>
              </ol>
            </section>

            <hr class="border-gray-200 dark:border-gray-700" />

            <section>
              <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Utilisation de l'URL
              </h3>
              <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre">{`curl -H "X-FGP-Key: <clé>" \\
  <url>/v1/apps`}</pre>
              <p class="mt-2">
                Le header{" "}
                <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                  X-FGP-Key
                </code>{" "}
                est requis &agrave; chaque requ&ecirc;te. L'URL seule est inexploitable sans cette
                cl&eacute;.
              </p>
            </section>

            <hr class="border-gray-200 dark:border-gray-700" />

            <section>
              <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Infos sur les champs
              </h3>
              <dl class="space-y-3">
                <div>
                  <dt class="font-medium text-gray-800 dark:text-gray-200">URL cible</dt>
                  <dd>
                    L'URL de base de l'API que vous souhaitez proxifier.
                  </dd>
                </div>
                <div>
                  <dt class="font-medium text-gray-800 dark:text-gray-200">Mode d'auth</dt>
                  <dd>
                    Comment le proxy s'authentifie aupr&egrave;s de l'API cible.
                  </dd>
                  <dd class="mt-1">
                    <ul class="list-disc list-inside space-y-0.5">
                      <li>
                        <code class="font-mono text-xs">bearer</code>{" "}
                        &mdash; token envoy&eacute; dans{" "}
                        <code class="font-mono text-xs">Authorization: Bearer</code>
                      </li>
                      <li>
                        <code class="font-mono text-xs">basic</code> &mdash; Basic Auth
                      </li>
                      <li>
                        <code class="font-mono text-xs">scalingo-exchange</code>{" "}
                        &mdash; &eacute;change token Scalingo (tk-us-... &rarr; bearer)
                      </li>
                      <li>
                        <code class="font-mono text-xs">header:X-Name</code> &mdash; header custom
                      </li>
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt class="font-medium text-gray-800 dark:text-gray-200">Scopes</dt>
                  <dd>
                    Patterns au format{" "}
                    <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                      METHOD:PATH
                    </code>
                    . Le wildcard{" "}
                    <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                      *
                    </code>{" "}
                    matche tout.
                  </dd>
                  <dd class="mt-1">
                    <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-xs text-gray-800 dark:text-gray-200">{`GET:/v1/apps/*
POST:/v1/apps/my-app/scale`}</pre>
                  </dd>
                </div>
                <div>
                  <dt class="font-medium text-gray-800 dark:text-gray-200">Body filters</dt>
                  <dd>
                    Pour les scopes POST/PUT/PATCH, filtrez le contenu du body de la requ&ecirc;te
                    (champs autoris&eacute;s, valeurs contraintes).
                  </dd>
                </div>
                <div>
                  <dt class="font-medium text-gray-800 dark:text-gray-200">
                    Dur&eacute;e de validit&eacute; (TTL)
                  </dt>
                  <dd>
                    Dur&eacute;e pendant laquelle l'URL g&eacute;n&eacute;r&eacute;e est utilisable.
                    Pass&eacute; ce d&eacute;lai, le proxy refuse les requ&ecirc;tes.
                  </dd>
                </div>
              </dl>
            </section>

            <hr class="border-gray-200 dark:border-gray-700" />

            <section>
              <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Documentation API
              </h3>
              <p>
                La sp&eacute;cification OpenAPI et le Swagger UI interactif sont disponibles sur
                {" "}
                <a
                  href="/api/docs"
                  class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                >
                  /api/docs
                </a>
                .
              </p>
            </section>
          </nav>
        </aside>
        </div>
      </main>

      <footer class="mt-12 border-t border-gray-200 dark:border-gray-700 pt-6 pb-4 text-center text-sm text-gray-400 dark:text-gray-500">
        <a
          href="https://github.com/lsagetlethias/fine-grained-proxy"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 hover:text-fgp-600 dark:hover:text-fgp-400 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          Fine-Grained Proxy sur GitHub
        </a>
      </footer>
    </Layout>
  );
}
