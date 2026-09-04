import {
  CONTROL_H,
  HINT_CLASS,
  INPUT_CLASS,
  LEGEND_CLASS,
  PILL_CLASS,
  TTL_PRESETS,
} from "./constants.ts";
import { EyeIcon } from "./icons.tsx";

export function TtlSection() {
  return (
    <section>
      <fieldset>
        <legend class={LEGEND_CLASS}>
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
              class={PILL_CLASS}
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
            class={INPUT_CLASS}
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
  );
}

export function ByokSection() {
  return (
    <details
      id="byok-details"
      class="group rounded-md border border-gray-200 dark:border-gray-700"
    >
      <summary
        id="byok-summary"
        class="flex flex-wrap cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fgp-700 hover:text-fgp-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fgp-500 focus-visible:ring-offset-2 rounded-md dark:text-fgp-300 dark:focus-visible:ring-offset-gray-900 [&::-webkit-details-marker]:hidden"
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
        <span class="min-w-0 flex-1">Utiliser ma propre cl&eacute; client</span>
        {
          /* Pas de classe utilitaire de display ici : elle l'emporterait sur le
            [hidden] { display: none } du preflight et le badge resterait visible. */
        }
        <span
          id="byok-active-badge"
          hidden
          aria-label="Cl&#233; personnalis&#233;e active"
          class="shrink-0 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        >
          Active
        </span>
      </summary>

      <div class="space-y-3 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        <p
          id="byok-warning"
          class="flex items-start gap-2 rounded-md border border-red-300 border-l-4 border-l-red-500 bg-red-50 p-2 text-xs text-red-800 dark:border-red-700 dark:border-l-red-500 dark:bg-red-900/30 dark:text-red-300"
        >
          <svg
            class="h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
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
          <span>
            R&eacute;utiliser une cl&eacute; lie les blobs : sa fuite rend d&eacute;chiffrables tous
            ceux g&eacute;n&eacute;r&eacute;s avec elle.
          </span>
        </p>

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
              class="min-w-[11rem] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500"
            />
            {
              /* Groupes : sous 360 px la rangee replie de toute facon, avec ce conteneur
                elle replie proprement et le champ y gagne de la largeur. */
            }
            <div id="byok-actions" class="flex shrink-0 gap-2">
              <button
                type="button"
                id="btn-byok-reveal"
                aria-pressed="false"
                aria-label="Afficher la cl&#233;"
                class={`${CONTROL_H} w-[2.375rem] shrink-0 inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:border-gray-600 dark:hover:text-gray-200`}
              >
                <EyeIcon />
              </button>
              <button
                type="button"
                id="btn-byok-copy"
                data-copy="byok-key"
                class={`${CONTROL_H} copy-btn shrink-0 inline-flex items-center justify-center rounded-md border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700`}
              >
                Copier
              </button>
            </div>
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
            class={HINT_CLASS}
            role="status"
            aria-live="polite"
          >
          </p>

          <p id="byok-hint" class={HINT_CLASS}>
            Laissez vide pour que FGP en g&eacute;n&egrave;re une.
          </p>

          <button
            type="button"
            id="byok-doc-link"
            data-goto-doc="doc-client-key"
            data-return-label="Cl&#233; personnalis&#233;e"
            class="mt-1 text-xs font-medium text-fgp-600 hover:text-fgp-800 focus:outline-none focus:underline dark:text-fgp-400 dark:hover:text-fgp-200"
          >
            En savoir plus sur la cl&eacute; client
          </button>
        </div>
      </div>
    </details>
  );
}

export function GenerateSection() {
  return (
    <section>
      <button
        type="submit"
        id="btn-generate"
        class="w-full rounded-md bg-fgp-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-fgp-800 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
      >
        Générer l'URL
      </button>
    </section>
  );
}
