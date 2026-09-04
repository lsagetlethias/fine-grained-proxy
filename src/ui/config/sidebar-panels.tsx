import { renderChangelog } from "../changelog-renderer.tsx";
import { CHANGELOG_MARKDOWN } from "../changelog-data.ts";

export function ExamplesPanel() {
  return (
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
            Cliquez sur un exemple pour pr&eacute;-remplir le formulaire. Ajoutez votre token pour
            g&eacute;n&eacute;rer l'URL.
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
  );
}

export function ChangelogPanel() {
  return (
    <div
      id="panel-changelog"
      role="tabpanel"
      aria-labelledby="tab-changelog"
      aria-hidden="true"
      class="hidden text-sm text-gray-600 dark:text-gray-400"
    >
      {renderChangelog(CHANGELOG_MARKDOWN)}
    </div>
  );
}

export function LogsPanel() {
  return (
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
          Activez la capture in-memory des requ&ecirc;tes passant par ce blob. Les logs sont
          visibles uniquement via <code class="font-mono">/logs</code>{" "}
          et ne sont jamais persist&eacute;s.
        </p>
      </section>

      <div
        id="logs-feature-off"
        hidden
        class="rounded-md bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800"
      >
        <p class="text-xs text-blue-800 dark:text-blue-300">
          Les logs sont d&eacute;sactiv&eacute;s sur cette instance FGP. Contactez l'administrateur
          pour activer <code class="font-mono">FGP_LOGS_ENABLED</code>.
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
              Chaque requ&ecirc;te est journalis&eacute;e en m&eacute;moire (m&eacute;thode, chemin,
              status, dur&eacute;e, IP tronqu&eacute;e) pendant quelques minutes.
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
              Le body request est compress&eacute; puis chiffr&eacute; avec votre cl&eacute; client
              avant d'&ecirc;tre stock&eacute;. Le serveur ne peut pas le lire. Multipart exclu.
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
          Activez uniquement si vous avez besoin d'inspecter les payloads. Le body peut contenir des
          informations sensibles, n'ouvrez <code class="font-mono">/logs</code>{" "}
          que sur un poste de confiance.
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
  );
}
