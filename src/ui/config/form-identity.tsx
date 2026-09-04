import {
  CONTROL_H_SM,
  HINT_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  SUB_LABEL_CLASS,
} from "./constants.ts";
export function NameSection() {
  return (
    <section>
      <label
        for="config-name"
        class={LABEL_CLASS}
      >
        Nom de la configuration
      </label>
      <input
        type="text"
        id="config-name"
        placeholder="Ex : Scalingo deploy PR nosgestesclimat"
        class={INPUT_CLASS}
      />
    </section>
  );
}

export function PresetSection() {
  return (
    <section>
      <label class={LABEL_CLASS}>
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
      <p class={HINT_CLASS}>
        Pr&eacute;-remplit le formulaire. &laquo; Scalingo &raquo; cible l'API de contr&ocirc;le
        (apps, d&eacute;ploiements) et active le bouton &laquo; Charger les apps &raquo;. &laquo;
        Scalingo DB &raquo; cible l'API des bases de donn&eacute;es via un token d'addon.
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
              class={SUB_LABEL_CLASS}
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
              class={SUB_LABEL_CLASS}
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
              class={`${CONTROL_H_SM} inline-flex items-center justify-center rounded-md bg-fgp-600 px-4 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900`}
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
  );
}

export function TargetSection() {
  return (
    <section>
      <label
        for="target"
        class={LABEL_CLASS}
      >
        URL cible de l'API
      </label>
      <input
        type="url"
        id="target"
        name="target"
        placeholder="https://api.example.com"
        required
        class={INPUT_CLASS}
      />
    </section>
  );
}
