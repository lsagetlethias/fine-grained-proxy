import { FgpLogo, Layout } from "./layout.tsx";

export function LogsPage() {
  return (
    <Layout>
      <header class="mb-8">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <FgpLogo size={36} />
            <h1 class="text-2xl font-bold text-fgp-900 dark:text-fgp-100 tracking-tight">
              Logs d'un blob
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
          Consultez en direct les requêtes passées par votre blob FGP.
        </p>
      </header>

      <main class="max-w-4xl mx-auto space-y-6">
        <section id="logs-auth-state" aria-label="Authentification au flux">
          <form
            id="logs-auth-form"
            class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800/50 space-y-4"
          >
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Consultez en direct les requêtes passées par votre blob FGP. Saisissez votre blob et
              votre clé client pour ouvrir le flux.
            </p>

            <div>
              <label
                for="logs-blob"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Blob chiffré
              </label>
              <input
                type="text"
                id="logs-blob"
                name="blob"
                required
                autocomplete="off"
                spellcheck={false}
                placeholder="Collez le blob base64url ici"
                class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>

            <div>
              <label
                for="logs-key"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Clé client (X-FGP-Key)
              </label>
              <div class="relative">
                <input
                  type="password"
                  id="logs-key"
                  name="key"
                  required
                  autocomplete="off"
                  spellcheck={false}
                  placeholder="La clé retournée à la génération"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm font-mono shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
                <button
                  type="button"
                  id="logs-key-toggle"
                  aria-label="Afficher ou masquer la clé"
                  class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:text-fgp-600"
                >
                  <svg
                    id="logs-key-toggle-icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="submit"
                id="logs-connect"
                class="rounded-md bg-fgp-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
              >
                Connecter
              </button>
              <span
                id="logs-auth-status"
                class="text-sm font-medium"
                aria-live="polite"
                role="status"
              >
              </span>
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400">
              Le blob et la clé sont gardés le temps de l'onglet uniquement (sessionStorage). F5
              sans re-saisir, fermer l'onglet = tout oublié.
            </p>
          </form>
        </section>

        <section id="logs-stream-state" aria-label="Flux de logs en direct" hidden>
          <header class="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                <span id="logs-blob-name">Flux en direct</span>
                <span
                  id="logs-blob-separator"
                  class="text-gray-400 dark:text-gray-500 font-normal mx-2"
                >
                  ·
                </span>
                <span
                  id="logs-blob-id"
                  class="font-mono text-sm text-gray-500 dark:text-gray-400"
                  title=""
                >
                  --------
                </span>
              </h2>
            </div>
            <div class="flex items-center gap-3">
              <span
                id="logs-status"
                role="status"
                aria-live="polite"
                class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                <span
                  id="logs-status-dot"
                  class="h-2 w-2 rounded-full bg-green-500 dark:bg-green-400"
                  aria-hidden="true"
                >
                </span>
                <span id="logs-status-label">Connecté</span>
              </span>
              <button
                type="button"
                id="logs-disconnect"
                class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-gray-900 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950 dark:focus:ring-offset-gray-900"
              >
                Se déconnecter
              </button>
            </div>
          </header>

          <span id="logs-announce" class="sr-only" aria-live="polite" aria-atomic="true"></span>

          <section class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50 relative">
            <header class="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Requêtes
              </h3>
            </header>
            <div
              id="logs-network-empty"
              class="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
            >
              Aucun événement pour l'instant. Les requêtes apparaîtront ici en direct.
            </div>
            <ul
              id="logs-network-list"
              role="log"
              aria-label="Requêtes passées par le blob"
              class="divide-y divide-gray-100 dark:divide-gray-800 max-h-[60vh] overflow-y-auto"
              hidden
            >
            </ul>
            <button
              type="button"
              id="logs-resume-scroll"
              class="absolute bottom-3 right-3 rounded-md bg-fgp-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500"
              hidden
            >
              Reprendre le défilement auto
            </button>
          </section>

          <details
            id="logs-detailed-section"
            class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50 group"
          >
            <summary class="cursor-pointer list-none px-4 py-3 flex items-center justify-between [&::-webkit-details-marker]:hidden">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Bodies détaillés
                <span class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                  (<span id="logs-detailed-count">0</span>)
                </span>
              </h3>
              <svg
                class="h-4 w-4 transition-transform group-open:rotate-90 text-gray-500"
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
            </summary>

            <div
              id="logs-detailed-disabled"
              class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
              hidden
            >
              Les bodies détaillés ne sont pas activés pour ce blob. Activez-les dans l'onglet Logs
              de votre configuration.
            </div>

            <ul
              id="logs-detailed-list"
              role="log"
              class="divide-y divide-gray-100 dark:divide-gray-800 max-h-[50vh] overflow-y-auto"
            >
            </ul>
          </details>
        </section>

        <section id="logs-error-state" aria-label="Erreur de flux" hidden>
          <div class="rounded-lg border border-red-300 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
            <p id="logs-error-message" class="text-sm text-red-800 dark:text-red-300 mb-4"></p>
            <div class="flex items-center justify-center gap-3">
              <button
                type="button"
                id="logs-retry"
                class="rounded-md bg-fgp-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2"
                hidden
              >
                Réessayer
              </button>
              <button
                type="button"
                id="logs-back-to-form"
                class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Retour au formulaire
              </button>
            </div>
          </div>
        </section>
      </main>

      <script defer src="/static/logs-client.js"></script>
    </Layout>
  );
}
