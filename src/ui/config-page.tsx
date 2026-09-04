import { FgpLogo, Layout } from "./layout.tsx";
import { renderChangelog } from "./changelog-renderer.tsx";
import { CHANGELOG_MARKDOWN } from "./changelog-data.ts";

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
  { label: "Scalingo API", value: "scalingo-exchange" },
  { label: "Scalingo Database API", value: "scalingo-addon" },
  { label: "Headers multiples", value: "header:" },
];

const SCALINGO_REGIONS = [
  { label: "Paris (osc-fr1)", value: "osc-fr1" },
  { label: "SecNumCloud (osc-secnum-fr1)", value: "osc-secnum-fr1" },
];

const FIELD_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500";

const REMOVE_BTN_CLASS =
  "shrink-0 rounded-md p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent dark:hover:text-red-400 dark:hover:bg-red-900/30";

const ADD_BTN_CLASS =
  "mt-3 inline-flex items-center gap-1 text-sm font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline dark:disabled:text-gray-500";

function TrashIcon() {
  return (
    <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fill-rule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clip-rule="evenodd"
      />
    </svg>
  );
}

function EyeIcon({ size = "h-5 w-5" }: { size?: string }) {
  return (
    <svg class={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path
        fill-rule="evenodd"
        d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
        clip-rule="evenodd"
      />
    </svg>
  );
}

export function ConfigPage({ commitHash = "dev" }: { commitHash?: string }) {
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
              {/* Name */}
              <section>
                <label
                  for="config-name"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Nom de la configuration
                </label>
                <input
                  type="text"
                  id="config-name"
                  placeholder="Ex : Scalingo deploy PR nosgestesclimat"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
              </section>

              {/* Preset */}
              <section>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Preset
                </label>
                <div class="flex flex-wrap items-center gap-3">
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      id="btn-preset-scalingo"
                      class="rounded-md border border-fgp-500 bg-fgp-50 px-3 py-1.5 text-sm font-medium text-fgp-700 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 dark:bg-fgp-900 dark:text-fgp-200 dark:border-fgp-600 dark:hover:bg-fgp-800 dark:focus:ring-offset-gray-900"
                    >
                      Scalingo
                    </button>
                    <button
                      type="button"
                      id="btn-preset-scalingo-db"
                      class="rounded-md border border-fgp-500 bg-fgp-50 px-3 py-1.5 text-sm font-medium text-fgp-700 hover:bg-fgp-100 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 dark:bg-fgp-900 dark:text-fgp-200 dark:border-fgp-600 dark:hover:bg-fgp-800 dark:focus:ring-offset-gray-900"
                    >
                      Scalingo DB
                    </button>
                  </div>
                  <button
                    type="button"
                    id="btn-preset-clear"
                    class="text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 focus:outline-none focus:underline"
                  >
                    R&eacute;initialiser
                  </button>
                </div>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Pr&eacute;-remplit le formulaire. &laquo; Scalingo &raquo; cible l'API de
                  contr&ocirc;le (apps, d&eacute;ploiements) et active le bouton &laquo; Charger les
                  apps &raquo;. &laquo; Scalingo DB &raquo; cible l'API des bases de donn&eacute;es
                  via un token d'addon.
                </p>

                <details id="import-details" class="mt-3 group">
                  <summary
                    id="btn-preset-import"
                    class="cursor-pointer text-sm font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline select-none list-none [&::-webkit-details-marker]:hidden"
                  >
                    <span class="inline-flex items-center gap-1.5">
                      <svg
                        class="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-90"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      Importer une config existante
                    </span>
                  </summary>
                  <div
                    id="import-section"
                    class="mt-2 rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3"
                  >
                    <div>
                      <label
                        class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        for="import-blob"
                      >
                        URL FGP ou blob
                      </label>
                      <input
                        type="text"
                        id="import-blob"
                        placeholder="https://fgp.example.com/eyJhbGci.../ ou eyJhbGci..."
                        class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-400"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        for="import-key"
                      >
                        Cl&eacute; client (X-FGP-Key)
                      </label>
                      <input
                        type="text"
                        id="import-key"
                        placeholder="a7f2c9d4-1234-5678-..."
                        class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-400"
                      />
                    </div>
                    <div class="flex items-center gap-3">
                      <button
                        type="button"
                        id="btn-import-decode"
                        class="rounded-md bg-fgp-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
                      >
                        D&eacute;coder
                      </button>
                      <span
                        id="import-status"
                        class="text-sm font-medium"
                        aria-live="polite"
                        role="status"
                      >
                      </span>
                    </div>
                  </div>
                </details>
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
                <select
                  id="auth"
                  name="auth"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                >
                  {AUTH_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </section>

              {/* Headers custom */}
              <section id="custom-headers-section" hidden>
                <fieldset id="custom-headers-fieldset">
                  <legend class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Headers d'authentification
                  </legend>
                  <div class="mb-2 flex flex-wrap items-baseline justify-end gap-3">
                    <div class="flex items-center gap-3">
                      <span
                        id="custom-headers-count"
                        class="text-xs tabular-nums text-gray-500 dark:text-gray-400"
                      >
                        1 / 8
                      </span>
                      <button
                        type="button"
                        id="btn-toggle-header-values"
                        aria-pressed="false"
                        class="inline-flex items-center gap-1.5 text-xs font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline"
                      >
                        <EyeIcon size="h-3.5 w-3.5" />
                        <span data-toggle-label>Afficher les valeurs</span>
                      </button>
                    </div>
                  </div>

                  <div id="custom-headers-list" class="space-y-3">
                    <div
                      data-header-row
                      data-header-uid="h1"
                      class="flex flex-wrap items-start gap-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0 dark:border-gray-800"
                    >
                      <div class="w-full sm:w-44 sm:shrink-0">
                        <label for="header-name-h1" class="sr-only">Nom du header 1</label>
                        <input
                          type="text"
                          id="header-name-h1"
                          data-header-name
                          maxlength={64}
                          placeholder="X-API-Key"
                          autocomplete="off"
                          spellcheck={false}
                          class={FIELD_CLASS}
                        />
                      </div>
                      <div class="min-w-[12rem] flex-1">
                        <label for="header-value-h1" class="sr-only">Valeur du header 1</label>
                        <input
                          type="password"
                          id="header-value-h1"
                          data-header-value
                          maxlength={1024}
                          placeholder="Secret envoy&#233; &#224; l'API cible"
                          autocomplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          spellcheck={false}
                          class={FIELD_CLASS}
                        />
                      </div>
                      <button
                        type="button"
                        data-header-remove
                        disabled
                        aria-label="Supprimer le header 1"
                        title="Au moins un header est requis"
                        class={REMOVE_BTN_CLASS}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  <button type="button" id="btn-add-header" class={ADD_BTN_CLASS}>
                    + Ajouter un header
                  </button>

                  <p id="custom-headers-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Chaque header est envoy&eacute; tel quel &agrave; l'API cible, &agrave; chaque
                    requ&ecirc;te. Les valeurs sont des secrets : elles sont chiffr&eacute;es dans
                    le blob et ne sont plus affich&eacute;es apr&egrave;s la
                    g&eacute;n&eacute;ration. Maximum 8 headers, nom 64 caract&egrave;res, valeur
                    1024 caract&egrave;res.
                  </p>
                  <p
                    id="custom-headers-single-note"
                    class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                  >
                    Avec un seul header, FGP utilise la forme compacte{" "}
                    <code class="font-mono">header:{"{nom}"}</code>. Comportement identique, blob
                    plus petit.
                  </p>

                  <span id="custom-headers-status" class="sr-only" role="status" aria-live="polite">
                  </span>
                </fieldset>
              </section>

              {/* Scalingo Database API */}
              <section id="scalingo-addon-section" hidden>
                <fieldset id="scalingo-addon-fieldset" data-addon-state="idle">
                  <legend class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Base de donn&eacute;es Scalingo
                  </legend>

                  <span
                    id="addon-region-label"
                    class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    R&eacute;gion
                  </span>
                  <div
                    class="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-labelledby="addon-region-label"
                  >
                    {SCALINGO_REGIONS.map((region) => (
                      <label
                        key={region.value}
                        class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm cursor-pointer hover:border-fgp-500 has-[:checked]:bg-fgp-600 has-[:checked]:text-white has-[:checked]:border-fgp-600 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:border-fgp-400"
                      >
                        <input
                          type="radio"
                          name="addon-region"
                          value={region.value}
                          checked={region.value === "osc-fr1"}
                          class="sr-only"
                        />
                        {region.label}
                      </label>
                    ))}
                  </div>

                  <p
                    id="addon-region-urls"
                    class="mt-2 text-xs text-gray-500 dark:text-gray-400"
                    role="status"
                    aria-live="polite"
                  >
                    D&eacute;termine l'API interrog&eacute;e :{" "}
                    <code class="font-mono">https://api.osc-fr1.scalingo.com</code>. Cible attendue
                    pour la Database API :{" "}
                    <code class="font-mono">https://db-api.osc-fr1.scalingo.com</code>
                  </p>
                  <p
                    id="addon-target-warning"
                    hidden
                    class="mt-2 text-xs text-amber-700 dark:text-amber-300"
                  >
                    Cette cible ne ressemble pas &agrave; une Database API Scalingo. V&eacute;rifiez
                    l'URL cible.
                  </p>

                  <div class="mt-4 flex flex-wrap items-start gap-2">
                    <div class="flex min-w-[14rem] flex-1 gap-2">
                      <div class="min-w-0 flex-1">
                        <label
                          for="addon-app"
                          class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                          Application
                        </label>
                        <input
                          type="text"
                          id="addon-app"
                          list="addon-apps-datalist"
                          maxlength={64}
                          placeholder="mon-app"
                          autocomplete="off"
                          spellcheck={false}
                          aria-describedby="addon-status addon-hint"
                          class={FIELD_CLASS}
                        />
                      </div>
                      <button
                        type="button"
                        id="btn-addon-load"
                        class="mt-[1.375rem] shrink-0 rounded-md bg-fgp-600 px-3 py-2 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
                      >
                        Charger
                      </button>
                    </div>

                    <div class="min-w-[12rem] flex-1">
                      <label
                        for="addon-select"
                        class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >
                        Base de donn&eacute;es
                      </label>
                      <select
                        id="addon-select"
                        disabled
                        class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:disabled:bg-gray-800/50 dark:disabled:text-gray-500"
                      >
                        <option value="">Choisissez une base de donn&eacute;es</option>
                      </select>
                    </div>
                  </div>

                  <datalist id="addon-apps-datalist"></datalist>

                  <p
                    id="addon-status"
                    class="mt-2 text-xs text-gray-500 dark:text-gray-400"
                    role="status"
                    aria-live="polite"
                  >
                  </p>

                  <p id="addon-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    FGP &eacute;change votre token de compte contre un bearer, puis obtient un token
                    de base de donn&eacute;es valable 1 heure, renouvel&eacute; automatiquement. Le
                    consommateur de l'URL ne voit ni l'un ni l'autre. Une requ&ecirc;te qui ne vise
                    pas cette base est refus&eacute;e. Suggestions d'applications disponibles si
                    vous avez d&eacute;j&agrave; charg&eacute; la liste des applications.
                  </p>
                </fieldset>
              </section>
              {/* Token */}
              <section id="token-section">
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
                <p id="token-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Le token est envoyé au serveur FGP via HTTPS pour le chiffrement. Il n'est jamais
                  stocké.
                </p>
              </section>

              {/* Scalingo apps helper */}
              <section id="apps-section" class="hidden" aria-live="polite">
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
                <div id="scope-chips" class="space-y-1 mb-2 hidden" aria-live="polite"></div>
                <textarea
                  id="scopes"
                  name="scopes"
                  rows={4}
                  placeholder={`GET:/v1/apps/*\nPOST:/v1/apps/my-app/scale\n*:*`}
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                  aria-describedby="scopes-hint"
                >
                </textarea>
                <p id="scopes-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
                  <div
                    class="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label="Durée de validité"
                  >
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

              {/* BYOK */}
              <details
                id="byok-details"
                class="group rounded-md border border-gray-200 dark:border-gray-700"
              >
                <summary
                  id="byok-summary"
                  class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fgp-700 hover:text-fgp-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fgp-500 focus-visible:ring-offset-2 rounded-md dark:text-fgp-300 dark:focus-visible:ring-offset-gray-900 [&::-webkit-details-marker]:hidden"
                >
                  <svg
                    class="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span>Utiliser ma propre cl&eacute; client (avanc&eacute;)</span>
                  <span
                    id="byok-active-badge"
                    hidden
                    class="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  >
                    Cl&eacute; personnalis&eacute;e active
                  </span>
                </summary>

                <div class="space-y-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
                  <div
                    id="byok-warning"
                    class="flex items-start gap-2 rounded-md border border-red-300 border-l-4 border-l-red-500 bg-red-50 p-3 dark:border-red-700 dark:border-l-red-500 dark:bg-red-900/30"
                  >
                    <svg
                      class="h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <div class="text-xs text-red-800 dark:text-red-300">
                      <p class="font-semibold">
                        R&eacute;utiliser une cl&eacute; lie les blobs entre eux : si elle fuite,
                        tous les blobs g&eacute;n&eacute;r&eacute;s avec cette cl&eacute; deviennent
                        d&eacute;chiffrables d'un coup.
                      </p>
                      <p class="mt-1">
                        R&eacute;servez la mutualisation aux secrets de CI, et prenez une cl&eacute;
                        longue et al&eacute;atoire. La cl&eacute; n'est jamais stock&eacute;e : FGP
                        ne peut ni la retrouver, ni la r&eacute;initialiser. Sans elle, le blob est
                        inexploitable.
                      </p>
                    </div>
                  </div>

                  <div>
                    <div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <label
                        for="byok-key"
                        class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Cl&eacute; personnalis&eacute;e
                      </label>
                      <button
                        type="button"
                        id="btn-byok-generate"
                        class="text-xs font-medium text-fgp-600 hover:text-fgp-800 focus:outline-none focus:underline dark:text-fgp-400 dark:hover:text-fgp-200"
                      >
                        G&eacute;n&eacute;rer une cl&eacute; forte
                      </button>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <input
                        type="password"
                        id="byok-key"
                        placeholder="24 caract&#232;res minimum"
                        autocomplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        spellcheck={false}
                        aria-describedby="byok-warning byok-strength-label byok-hint"
                        class="min-w-[12rem] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500"
                      />
                      <button
                        type="button"
                        id="btn-byok-reveal"
                        aria-pressed="false"
                        aria-label="Afficher la cl&#233;"
                        class="shrink-0 rounded-md border border-gray-300 p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:border-gray-600 dark:hover:text-gray-200"
                      >
                        <EyeIcon />
                      </button>
                      <button
                        type="button"
                        id="btn-byok-copy"
                        data-copy="byok-key"
                        class="copy-btn shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Copier
                      </button>
                    </div>

                    <div id="byok-strength" class="mt-2 flex gap-1" aria-hidden="true">
                      <span
                        data-byok-segment
                        class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"
                      >
                      </span>
                      <span
                        data-byok-segment
                        class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"
                      >
                      </span>
                      <span
                        data-byok-segment
                        class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700"
                      >
                      </span>
                    </div>

                    <p
                      id="byok-strength-label"
                      class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                      role="status"
                      aria-live="polite"
                    >
                    </p>

                    <p id="byok-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Laissez vide pour que le serveur g&eacute;n&egrave;re une cl&eacute; unique.
                      24 caract&egrave;res minimum, ASCII imprimable, sans espace. La jauge mesure
                      la vari&eacute;t&eacute; des caract&egrave;res saisis, pas la
                      s&eacute;curit&eacute; r&eacute;elle de la cl&eacute;.
                    </p>
                  </div>
                </div>
              </details>

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

              {/* Test scope */}
              <details class="mt-6 rounded-md border border-gray-200 dark:border-gray-700 group/test">
                <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
                  Tester un scope
                  <span
                    id="test-scope-badge"
                    class="hidden group-open/test:!hidden ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                  </span>
                </summary>
                <div class="px-4 pb-4 pt-2 space-y-3">
                  <div class="grid grid-cols-4 gap-3">
                    <div>
                      <label
                        class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        for="test-method"
                      >
                        M&eacute;thode
                      </label>
                      <select
                        id="test-method"
                        class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </div>
                    <div class="col-span-3">
                      <label
                        class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                        for="test-path"
                      >
                        Chemin de test
                      </label>
                      <input
                        type="text"
                        id="test-path"
                        placeholder="/v1/apps/my-app"
                        class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                      />
                    </div>
                  </div>

                  <div id="test-body-section" class="hidden">
                    <label
                      class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
                      for="test-body"
                    >
                      Body JSON (optionnel)
                    </label>
                    <textarea
                      id="test-body"
                      rows={3}
                      placeholder='{"deployment": {"git_ref": "main"}}'
                      class="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                    >
                    </textarea>
                  </div>

                  <div id="test-scope-results" class="space-y-1" aria-live="polite"></div>

                  <div class="flex items-center gap-3">
                    <button
                      type="button"
                      id="btn-test-scope"
                      class="rounded-md bg-fgp-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
                    >
                      Tester
                    </button>
                    <span
                      id="test-scope-verdict"
                      class="text-sm font-medium"
                      aria-live="polite"
                      role="status"
                    >
                    </span>
                  </div>
                  <pre
                    id="test-scope-json"
                    class="hidden mt-3 rounded-md bg-gray-100 dark:bg-gray-800/50 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre max-h-48 overflow-y-auto"
                  >
                  </pre>
                </div>
              </details>
            </form>

            {/* Result */}
            <section
              id="result-section"
              class="mt-8 hidden"
              aria-live="polite"
              aria-label="R&#233;sultat de la g&#233;n&#233;ration"
            >
              <div class="rounded-md border border-green-200 bg-green-50 p-4 space-y-4 dark:bg-green-900/30 dark:border-green-700">
                <h2 class="text-sm font-semibold text-green-900 dark:text-green-200">
                  URL générée
                </h2>

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
                  <label class="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300">
                    <span>
                      Cl&eacute; (header <code class="font-mono">X-FGP-Key</code>)
                    </span>
                    <span
                      id="result-key-origin"
                      class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    >
                      g&eacute;n&eacute;r&eacute;e par le serveur
                    </span>
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
                    Blob (header <code class="font-mono">X-FGP-Blob</code>)
                  </label>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      id="result-blob"
                      readonly
                      class="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-mono text-gray-800 select-all dark:bg-gray-800 dark:border-green-700 dark:text-gray-200"
                      aria-label="Blob X-FGP-Blob"
                    />
                    <button
                      type="button"
                      data-copy="result-blob"
                      class="copy-btn rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-gray-700"
                      aria-label="Copier le blob"
                    >
                      Copier
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                    Exemple avec blob dans l'URL
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

                <div>
                  <label class="block text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                    Exemple avec header (recommand&eacute;)
                  </label>
                  <div class="flex gap-2">
                    <pre
                      id="result-curl-header"
                      class="flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre dark:bg-gray-800 dark:border-green-700 dark:text-gray-200"
                    ></pre>
                    <button
                      type="button"
                      data-copy="result-curl-header"
                      class="copy-btn self-start rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-gray-700"
                      aria-label="Copier la commande curl header mode"
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

          <aside
            class="lg:col-span-2 lg:border-l lg:border-gray-200 lg:pl-8 dark:lg:border-gray-700 mt-8 lg:mt-0"
            aria-label="Documentation et aide"
          >
            <div class="sticky top-8">
              <div class="flex border-b border-gray-200 dark:border-gray-700 mb-6" role="tablist">
                <button
                  type="button"
                  id="tab-doc"
                  role="tab"
                  aria-selected="true"
                  aria-controls="panel-doc"
                  class="px-4 py-2 text-sm font-medium border-b-2 border-fgp-600 text-fgp-700 dark:text-fgp-300 dark:border-fgp-400"
                >
                  Doc
                </button>
                <button
                  type="button"
                  id="tab-examples"
                  role="tab"
                  aria-selected="false"
                  aria-controls="panel-examples"
                  tabindex={-1}
                  class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Exemples
                </button>
                <button
                  type="button"
                  id="tab-changelog"
                  role="tab"
                  aria-selected="false"
                  aria-controls="panel-changelog"
                  tabindex={-1}
                  class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Changelog
                </button>
                <button
                  type="button"
                  id="tab-logs"
                  role="tab"
                  aria-selected="false"
                  aria-controls="panel-logs"
                  tabindex={-1}
                  class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Logs
                </button>
              </div>

              <div
                id="panel-doc"
                role="tabpanel"
                aria-labelledby="tab-doc"
                class="space-y-6 text-sm text-gray-600 dark:text-gray-400"
              >
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
                    est requis &agrave; chaque requ&ecirc;te. L'URL seule est inexploitable sans
                    cette cl&eacute;.
                  </p>

                  <div class="mt-4 rounded-md bg-fgp-50 dark:bg-fgp-900/20 border border-fgp-200 dark:border-fgp-800 p-3">
                    <p class="text-xs font-semibold text-fgp-700 dark:text-fgp-300 mb-2">
                      Mode header (recommand&eacute;)
                    </p>
                    <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre">{`curl -H "X-FGP-Key: <clé>" \\\n  -H "X-FGP-Blob: <blob>" \\\n  <origin>/v1/apps`}</pre>
                    <p class="mt-2 text-xs">
                      Passez le blob via le header{" "}
                      <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                        X-FGP-Blob
                      </code>{" "}
                      plut&ocirc;t que dans l'URL. M&eacute;thode pr&eacute;f&eacute;r&eacute;e pour
                      &eacute;viter les probl&egrave;mes de limite de 255 caract&egrave;res par
                      segment d'URL impos&eacute;e par certains services.
                    </p>
                  </div>
                </section>

                <hr class="border-gray-200 dark:border-gray-700" />

                <section>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Partage &amp; import
                  </h3>
                  <div class="space-y-3">
                    <div>
                      <p class="font-medium text-gray-800 dark:text-gray-200">
                        URL de partage
                      </p>
                      <p>
                        L'URL dans la barre d'adresse se met &agrave; jour automatiquement avec un
                        param&egrave;tre{" "}
                        <code class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                          ?c=
                        </code>{" "}
                        qui encode la configuration (sans le token). Copiez-la pour partager un
                        template de config, le destinataire n'aura qu'&agrave; fournir son propre
                        token.
                      </p>
                    </div>
                    <div>
                      <p class="font-medium text-gray-800 dark:text-gray-200">
                        Importer une URL FGP
                      </p>
                      <p>
                        Le bouton <strong>Importer</strong>{" "}
                        dans les presets permet de d&eacute;coder une URL FGP existante (ou un blob
                        brut) avec sa cl&eacute; client. La configuration est
                        r&eacute;cup&eacute;r&eacute;e avec le token masqu&eacute;, fournissez le
                        token manuellement pour g&eacute;n&eacute;rer ou tester.
                      </p>
                    </div>
                  </div>
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
                            <code class="font-mono text-xs">bearer</code> : token envoy&eacute; dans
                            {" "}
                            <code class="font-mono text-xs">Authorization: Bearer</code>
                          </li>
                          <li>
                            <code class="font-mono text-xs">basic</code> : Basic Auth
                          </li>
                          <li>
                            Scalingo API (<code class="font-mono text-xs">scalingo-exchange</code>)
                            {" "}
                            : &eacute;change token Scalingo (tk-us-... &rarr; bearer)
                          </li>
                          <li>
                            Scalingo Database API : token d'addon obtenu en trois temps, valable 1h
                            et renouvel&eacute; automatiquement
                          </li>
                          <li>
                            Headers multiples : jusqu'&agrave; 8 headers d'authentification
                            envoy&eacute;s tels quels. Un seul header utilise la forme compacte{" "}
                            <code class="font-mono text-xs">header:X-Name</code>
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
                        Pour les scopes POST/PUT/PATCH, filtrez le contenu du body de la
                        requ&ecirc;te (champs autoris&eacute;s, valeurs contraintes).
                      </dd>
                    </div>
                    <div>
                      <dt class="font-medium text-gray-800 dark:text-gray-200">
                        Dur&eacute;e de validit&eacute; (TTL)
                      </dt>
                      <dd>
                        Dur&eacute;e pendant laquelle l'URL g&eacute;n&eacute;r&eacute;e est
                        utilisable. Pass&eacute; ce d&eacute;lai, le proxy refuse les
                        requ&ecirc;tes.
                      </dd>
                    </div>
                  </dl>
                </section>

                <hr class="border-gray-200 dark:border-gray-700" />

                <section class="space-y-3">
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Exemples &amp; r&eacute;f&eacute;rences
                  </h3>

                  {/* Scopes : exemples */}
                  <details>
                    <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
                      Scopes : exemples
                    </summary>
                    <div class="mt-2 text-xs space-y-4 text-gray-600 dark:text-gray-400">
                      <div class="space-y-2">
                        <p class="font-medium text-gray-700 dark:text-gray-300">Cas courants</p>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Lecture seule sur toutes les apps
                          </p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/*</pre>
                          <ul class="mt-1 space-y-0.5">
                            <li>
                              Autorise : <code class="font-mono">GET /v1/apps/my-app</code>,{" "}
                              <code class="font-mono">GET /v1/apps/my-app/containers</code>
                            </li>
                            <li>
                              Bloque : <code class="font-mono">POST /v1/apps/my-app/scale</code>,
                              {" "}
                              <code class="font-mono">DELETE /v1/apps/my-app</code>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Lecture + scale sur une app pr&eacute;cise
                          </p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">{`GET:/v1/apps/my-app/*\nPOST:/v1/apps/my-app/scale`}</pre>
                          <ul class="mt-1 space-y-0.5">
                            <li>
                              Autorise :{" "}
                              <code class="font-mono">GET /v1/apps/my-app/containers</code>,{" "}
                              <code class="font-mono">POST /v1/apps/my-app/scale</code>
                            </li>
                            <li>
                              Bloque :{" "}
                              <code class="font-mono">GET /v1/apps/other-app/containers</code>,{" "}
                              <code class="font-mono">DELETE /v1/apps/my-app</code>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">Full access</p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">*:*</pre>
                          <p class="mt-1">
                            Autorise tout. R&eacute;server au debug ou tokens tr&egrave;s courts
                            (TTL 1h).
                          </p>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Multi-m&eacute;thodes avec pipe
                          </p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET|POST:/v1/apps/*</pre>
                          <ul class="mt-1 space-y-0.5">
                            <li>
                              Autorise : <code class="font-mono">GET /v1/apps/my-app</code>,{" "}
                              <code class="font-mono">POST /v1/apps/my-app/deployments</code>
                            </li>
                            <li>
                              Bloque : <code class="font-mono">DELETE /v1/apps/my-app</code>,{" "}
                              <code class="font-mono">PATCH /v1/apps/my-app</code>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <hr class="border-gray-200 dark:border-gray-700" />

                      <div class="space-y-2">
                        <p class="font-medium text-gray-700 dark:text-gray-300">Edge cases</p>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Wildcard mid-path
                          </p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/*/containers</pre>
                          <p class="mt-1">
                            Matche tous les containers de toutes les apps, mais uniquement la route
                            {" "}
                            <code class="font-mono">/containers</code> exacte.
                          </p>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Exact match (pas de wildcard)
                          </p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/my-app</pre>
                          <p class="mt-1">
                            Matche uniquement cette route exacte, pas les sous-routes.
                          </p>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Trailing wildcard
                          </p>
                          <pre class="rounded-md bg-gray-100 dark:bg-gray-800/50 p-2 font-mono text-gray-800 dark:text-gray-200 mt-1">GET:/v1/apps/*</pre>
                          <p class="mt-1">
                            Matche tout ce qui commence par <code class="font-mono">/v1/apps/</code>
                            {" "}
                            suivi d'au moins un caract&egrave;re. Bloque{" "}
                            <code class="font-mono">GET /v1/apps</code>{" "}
                            (pas de segment apr&egrave;s).
                          </p>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Body filters : exemples */}
                  <details>
                    <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
                      Body filters : exemples
                    </summary>
                    <div class="mt-2 text-xs space-y-4 text-gray-600 dark:text-gray-400">
                      <p>
                        Les body filters s'appliquent aux scopes POST, PUT, PATCH. Ils contraignent
                        le contenu JSON du body.
                      </p>

                      <div class="space-y-2">
                        <p class="font-medium text-gray-700 dark:text-gray-300">Cas courants</p>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            D&eacute;ploiement scop&eacute; par branche
                          </p>
                          <p>
                            Scope : <code class="font-mono">POST:/v1/apps/my-app/deployments</code>
                          </p>
                          <p>
                            Filtre : <code class="font-mono">deployment.git_ref</code> ={" "}
                            <code class="font-mono">master</code> |{" "}
                            <code class="font-mono">main</code>
                          </p>
                          <ul class="mt-1 space-y-0.5">
                            <li>
                              Autorise : body avec <code class="font-mono">git_ref: "main"</code>
                            </li>
                            <li>
                              Bloque : body avec <code class="font-mono">git_ref: "develop"</code>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Source restreinte (wildcard string)
                          </p>
                          <p>
                            Filtre : <code class="font-mono">deployment.source_url</code> ={" "}
                            <code class="font-mono">https://github.com/my-org/*</code>
                          </p>
                          <ul class="mt-1 space-y-0.5">
                            <li>
                              Autorise : URL commen&ccedil;ant par{" "}
                              <code class="font-mono">https://github.com/my-org/</code>
                            </li>
                            <li>
                              Bloque :{" "}
                              <code class="font-mono">https://github.com/hacker/malicious/...</code>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            V&eacute;rifier qu'un champ existe
                          </p>
                          <p>
                            Filtre : <code class="font-mono">deployment.git_ref</code>{" "}
                            = wildcard (type "exists")
                          </p>
                          <p class="mt-1">
                            Autorise tout body contenant le champ, quelle que soit la valeur.
                          </p>
                        </div>
                      </div>

                      <hr class="border-gray-200 dark:border-gray-700" />

                      <div class="space-y-2">
                        <p class="font-medium text-gray-700 dark:text-gray-300">Edge cases</p>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Type exact (boolean)
                          </p>
                          <p>
                            Filtre : <code class="font-mono">container.enabled</code> ={" "}
                            <code class="font-mono">true</code> (type boolean)
                          </p>
                          <p class="mt-1">
                            Match strict sur le type JSON. La string{" "}
                            <code class="font-mono">"true"</code> ne matche pas le boolean{" "}
                            <code class="font-mono">true</code>.
                          </p>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Exclusion (NOT)
                          </p>
                          <p>
                            Filtre : <code class="font-mono">deployment.git_ref</code> !={" "}
                            <code class="font-mono">develop</code>
                          </p>
                          <ul class="mt-1 space-y-0.5">
                            <li>
                              Autorise : <code class="font-mono">"main"</code>,{" "}
                              <code class="font-mono">"release/v2"</code>
                            </li>
                            <li>
                              Bloque : <code class="font-mono">"develop"</code>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Combinaison AND
                          </p>
                          <p>
                            Filtre : <code class="font-mono">deployment.git_ref</code>{" "}
                            = AND(<code class="font-mono">release/*</code>, NOT{" "}
                            <code class="font-mono">release/broken</code>)
                          </p>
                          <p class="mt-1">
                            Toutes les conditions doivent &ecirc;tre vraies simultan&eacute;ment.
                          </p>
                        </div>

                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Regex dans body filter
                          </p>
                          <p>
                            Filtre : <code class="font-mono">deployment.git_ref</code> = regex{" "}
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                              {`^v\\d+\\.\\d+\\.\\d+$`}
                            </code>
                          </p>
                          <p class="mt-1">
                            Matche les tags semver (<code class="font-mono">v1.2.3</code>).
                            Limit&eacute; &agrave; 200 caract&egrave;res, string uniquement.
                          </p>
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Auth modes : quand utiliser quoi */}
                  <details>
                    <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
                      Auth modes : quand utiliser quoi
                    </summary>
                    <div class="mt-2 text-xs space-y-3 text-gray-600 dark:text-gray-400">
                      <div>
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          <code class="font-mono">bearer</code>
                        </p>
                        <p>
                          Envoie{" "}
                          <code class="font-mono">Authorization: Bearer &lt;token&gt;</code>. La
                          majorit&eacute; des APIs REST modernes (GitHub, Stripe, etc.).
                        </p>
                      </div>
                      <div>
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          <code class="font-mono">basic</code>
                        </p>
                        <p>
                          Envoie{" "}
                          <code class="font-mono">Authorization: Basic &lt;base64&gt;</code>. APIs
                          legacy, services internes, registries Docker.
                        </p>
                      </div>
                      <div>
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          <code class="font-mono">scalingo-exchange</code>
                        </p>
                        <p>
                          &Eacute;change le token API Scalingo (<code class="font-mono">
                            tk-us-...
                          </code>) contre un bearer temporaire (1h), cach&eacute; en m&eacute;moire
                          chiffr&eacute;, renouvel&eacute; automatiquement. Exclusivement pour l'API
                          Scalingo.
                        </p>
                      </div>
                      <div>
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          Scalingo Database API
                        </p>
                        <p>
                          Acc&egrave;s &agrave; la Database API d'une base Scalingo
                          (<code class="font-mono">
                            https://db-api.&lt;r&eacute;gion&gt;.scalingo.com
                          </code>) sans jamais exposer le token de compte. Avec plusieurs bases, FGP
                          s&eacute;lectionne la bonne &agrave; partir de l'identifiant
                          pr&eacute;sent dans le chemin de la requ&ecirc;te.
                        </p>
                      </div>
                      <div>
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          Headers multiples
                        </p>
                        <p>
                          Envoie un &agrave; huit headers d'authentification tels quels. APIs qui
                          n'utilisent pas <code class="font-mono">Authorization</code>{" "}
                          (Algolia, SendGrid, etc.) ou qui exigent plusieurs headers (cl&eacute; +
                          identifiant de client + signature). Aucun appel r&eacute;seau
                          suppl&eacute;mentaire.
                        </p>
                      </div>
                    </div>
                  </details>

                  {/* Regex : mini-guide */}
                  <details>
                    <summary class="cursor-pointer text-sm font-medium text-fgp-700 dark:text-fgp-300 hover:text-fgp-500">
                      Regex : mini-guide
                    </summary>
                    <div class="mt-2 text-xs space-y-3 text-gray-600 dark:text-gray-400">
                      <div class="space-y-1.5">
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          Patterns courants
                        </p>
                        <div class="space-y-1">
                          <div class="flex items-baseline gap-2">
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                              {`^release/.*`}
                            </code>
                            <span>
                              matche <code class="font-mono">release/v1</code>,{" "}
                              <code class="font-mono">release/hotfix</code>
                            </span>
                          </div>
                          <div class="flex items-baseline gap-2">
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                              {`v\\d+`}
                            </code>
                            <span>
                              matche <code class="font-mono">v1</code>,{" "}
                              <code class="font-mono">v12</code>,{" "}
                              <code class="font-mono">release-v3</code>
                            </span>
                          </div>
                          <div class="flex items-baseline gap-2">
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                              {`^(main|master)$`}
                            </code>
                            <span>
                              matche <code class="font-mono">main</code> ou{" "}
                              <code class="font-mono">master</code> exactement
                            </span>
                          </div>
                          <div class="flex items-baseline gap-2">
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                              {`^v\\d+\\.\\d+\\.\\d+$`}
                            </code>
                            <span>
                              matche semver (<code class="font-mono">v1.2.3</code>)
                            </span>
                          </div>
                          <div class="flex items-baseline gap-2">
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded shrink-0">
                              {`.*-prod$`}
                            </code>
                            <span>
                              matche <code class="font-mono">api-prod</code>,{" "}
                              <code class="font-mono">web-prod</code>
                            </span>
                          </div>
                        </div>
                      </div>

                      <hr class="border-gray-200 dark:border-gray-700" />

                      <div class="space-y-1.5">
                        <p class="font-medium text-gray-700 dark:text-gray-300">
                          Pi&egrave;ges fr&eacute;quents
                        </p>
                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Match partiel par d&eacute;faut
                          </p>
                          <p>
                            Le pattern{" "}
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                              release
                            </code>{" "}
                            matche aussi{" "}
                            <code class="font-mono">my-release-branch</code>. Pour un match exact :
                            {" "}
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                              {`^release$`}
                            </code>.
                          </p>
                        </div>
                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">
                            Pipe dans les regex
                          </p>
                          <p>
                            Dans un regex,{" "}
                            <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                              main|master
                            </code>{" "}
                            = "main OU master". Dans le champ scopes, le pipe s&eacute;pare les
                            m&eacute;thodes HTTP, deux contextes diff&eacute;rents.
                          </p>
                        </div>
                        <div>
                          <p class="font-medium text-gray-700 dark:text-gray-300">Limites</p>
                          <p>
                            Max 200 caract&egrave;res par pattern. Test&eacute; uniquement sur des
                            valeurs string JSON (pas num&eacute;rique ni boolean).
                          </p>
                        </div>
                      </div>
                    </div>
                  </details>
                </section>
              </div>

              <div
                id="panel-examples"
                role="tabpanel"
                aria-labelledby="tab-examples"
                aria-hidden="true"
                class="hidden text-sm text-gray-600 dark:text-gray-400"
              >
                <div class="space-y-6">
                  <section>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      Configs pr&ecirc;tes &agrave; l'emploi
                    </h3>
                    <p class="mb-3">
                      Cliquez sur un exemple pour pr&eacute;-remplir le formulaire. Ajoutez votre
                      token pour g&eacute;n&eacute;rer l'URL.
                    </p>
                    <ul class="space-y-2">
                      <li>
                        <a
                          href="/?c=H4sIAAAAAAAA_zSMwQqDMBAF_-UdiyZKoYe9l_5Ab6WHZUkTwZrgriKI_24uXmeG2WE8x2AgJLOi5D2XwWWV9jf3ToXHYYrZSf6jAS-WannRNmySeIqhKpVcgoI-eD3f5Ne-for6G74NzEbQ_dF1xwkAAP__AwDqbEqgbwAAAA"
                          class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                        >
                          Scalingo : lecture seule
                        </a>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                            GET:/v1/apps/*
                          </code>{" "}
                          (scalingo-exchange, 1h)
                        </p>
                      </li>
                      <li>
                        <a
                          href="/?c=H4sIAAAAAAAA_4TMvQoCMRAE4HfZ8rhc7kBE0oulgnZiEWJMDvKzZFfxUN_dbaytBmY-5gVsW_AMBiIzktHa4jxUcurWpoGcTXMJdXA1Qw_2zlHkr1X-6aItwctErqInMGfYbU9GPyb5QdJ5UZIKW6evHlNdsi9M4kW9D_vjX6o7uPTAnMBs1qtx_HwBAAD__wMA_H5GBrIAAAA"
                          class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                        >
                          Scalingo : deploy PR
                        </a>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                            GET:/v1/apps/my-app-pr*/deployments
                          </code>{" "}
                          +{" "}
                          <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                            GET|POST:/v1/apps/my-app-pr*/deployments/*
                          </code>{" "}
                          (24h)
                        </p>
                      </li>
                      <li>
                        <a
                          href="/?c=H4sIAAAAAAAA_wBSAK3_eyJ0YXJnZXQiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImF1dGgiOiJiZWFyZXIiLCJzY29wZXMiOlsiR0VUOioiXSwidHRsIjozNjAwfQAAAP__AwDMbCW8UgAAAA"
                          class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                        >
                          API g&eacute;n&eacute;rique : lecture seule
                        </a>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <code class="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
                            GET:*
                          </code>{" "}
                          (bearer, 1h)
                        </p>
                      </li>
                    </ul>
                  </section>

                  <hr class="border-gray-200 dark:border-gray-700" />

                  <section>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                      R&eacute;f&eacute;rences
                    </h3>
                    <ul class="space-y-2">
                      <li>
                        <a
                          href="/api/docs"
                          class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                        >
                          Swagger UI
                        </a>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {" "}: documentation interactive de l'API
                        </span>
                      </li>
                      <li>
                        <a
                          href="/api/openapi.json"
                          class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                        >
                          OpenAPI JSON
                        </a>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {" "}: sp&eacute;cification OpenAPI 3.0
                        </span>
                      </li>
                      <li>
                        <a
                          href="https://github.com/lsagetlethias/fine-grained-proxy"
                          target="_blank"
                          rel="noopener"
                          class="font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 underline underline-offset-2"
                        >
                          GitHub
                        </a>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {" "}: code source, issues, ADR
                        </span>
                      </li>
                    </ul>
                  </section>
                </div>
              </div>

              <div
                id="panel-changelog"
                role="tabpanel"
                aria-labelledby="tab-changelog"
                aria-hidden="true"
                class="hidden text-sm text-gray-600 dark:text-gray-400"
              >
                {renderChangelog(CHANGELOG_MARKDOWN)}
              </div>

              <div
                id="panel-logs"
                role="tabpanel"
                aria-labelledby="tab-logs"
                aria-hidden="true"
                class="hidden space-y-6 text-sm text-gray-600 dark:text-gray-400"
              >
                <section>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Logs
                  </h3>
                  <p>
                    Activez la capture in-memory des requ&ecirc;tes passant par ce blob. Les logs
                    sont visibles uniquement via <code class="font-mono">/logs</code>{" "}
                    et ne sont jamais persist&eacute;s.
                  </p>
                </section>

                <div
                  id="logs-feature-off"
                  hidden
                  class="rounded-md bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800"
                >
                  <p class="text-xs text-blue-800 dark:text-blue-300">
                    Les logs sont d&eacute;sactiv&eacute;s sur cette instance FGP. Contactez
                    l'administrateur pour activer <code class="font-mono">FGP_LOGS_ENABLED</code>.
                  </p>
                </div>

                <fieldset id="logs-toggles" class="space-y-4">
                  <legend class="sr-only">Configuration des logs pour ce blob</legend>

                  <label class="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" id="logs-enabled" class="peer sr-only" />
                    <span
                      class="relative inline-block h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-fgp-600 peer-focus-visible:ring-2 peer-focus-visible:ring-fgp-500 peer-focus-visible:ring-offset-2 dark:bg-gray-600 dark:peer-checked:bg-fgp-500 dark:peer-focus-visible:ring-offset-gray-900 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
                      aria-hidden="true"
                    >
                    </span>
                    <div class="flex-1">
                      <span class="font-medium text-gray-900 dark:text-gray-100">
                        Activer les logs pour ce blob
                      </span>
                      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Chaque requ&ecirc;te est journalis&eacute;e en m&eacute;moire
                        (m&eacute;thode, chemin, status, dur&eacute;e, IP tronqu&eacute;e) pendant
                        quelques minutes.
                      </p>
                    </div>
                  </label>

                  <label
                    id="logs-detailed-label"
                    class="flex items-start gap-3 cursor-pointer opacity-50"
                  >
                    <input
                      type="checkbox"
                      id="logs-detailed"
                      class="peer sr-only"
                      disabled
                      aria-describedby="logs-detailed-help"
                    />
                    <span
                      class="relative inline-block h-5 w-9 shrink-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-fgp-600 peer-focus-visible:ring-2 peer-focus-visible:ring-fgp-500 peer-focus-visible:ring-offset-2 dark:bg-gray-600 dark:peer-checked:bg-fgp-500 dark:peer-focus-visible:ring-offset-gray-900 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
                      aria-hidden="true"
                    >
                    </span>
                    <div class="flex-1">
                      <span class="font-medium text-gray-900 dark:text-gray-100">
                        Capturer aussi les bodies d&eacute;taill&eacute;s (POST/PUT/PATCH JSON)
                      </span>
                      <p
                        id="logs-detailed-help"
                        class="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
                      >
                        Le body request est compress&eacute; puis chiffr&eacute; avec votre
                        cl&eacute; client avant d'&ecirc;tre stock&eacute;. Le serveur ne peut pas
                        le lire. Multipart exclu.
                      </p>
                    </div>
                  </label>
                </fieldset>

                <div
                  id="logs-detailed-warning"
                  hidden
                  class="rounded-md bg-amber-50 border border-amber-200 p-3 dark:bg-amber-900/20 dark:border-amber-800"
                >
                  <p class="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    Attention
                  </p>
                  <p class="text-xs text-amber-700 dark:text-amber-400">
                    Activez uniquement si vous avez besoin d'inspecter les payloads. Le body peut
                    contenir des informations sensibles, n'ouvrez{" "}
                    <code class="font-mono">/logs</code> que sur un poste de confiance.
                  </p>
                </div>

                <hr class="border-gray-200 dark:border-gray-700" />

                <section>
                  <a
                    href="/logs"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1.5 text-sm font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline"
                  >
                    <span>
                      Ouvrir la console <code class="font-mono">/logs</code>
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </section>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer class="mt-12 border-t border-gray-200 dark:border-gray-700 pt-6 pb-4 text-center text-sm text-gray-400 dark:text-gray-500">
        <div class="inline-flex items-center gap-2">
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
          <span>&middot;</span>
          {/^[0-9a-f]{7,}$/i.test(commitHash)
            ? (
              <a
                href={`https://github.com/lsagetlethias/fine-grained-proxy/commit/${commitHash}`}
                target="_blank"
                rel="noopener"
                class="font-mono hover:text-fgp-600 dark:hover:text-fgp-400 transition-colors"
              >
                {commitHash.slice(0, 7)}
              </a>
            )
            : <span class="font-mono">{commitHash.slice(0, 7)}</span>}
        </div>
      </footer>
    </Layout>
  );
}
