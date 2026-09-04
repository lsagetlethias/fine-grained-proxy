import {
  ALERT_DANGER_CLASS,
  RESULT_COPY_BTN_CLASS,
  RESULT_INPUT_CLASS,
  RESULT_LABEL_CLASS,
} from "./constants.ts";
import { AlertTriangleIcon } from "./icons.tsx";
export function ResultSection() {
  return (
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
          <label class={RESULT_LABEL_CLASS}>
            URL du proxy
          </label>
          <div class="flex gap-2">
            <input
              type="text"
              id="result-url"
              readonly
              class={RESULT_INPUT_CLASS}
              aria-label="URL générée"
            />
            <button
              type="button"
              data-copy="result-url"
              class={RESULT_COPY_BTN_CLASS}
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
              class={RESULT_INPUT_CLASS}
              aria-label="Clé X-FGP-Key"
            />
            <button
              type="button"
              data-copy="result-key"
              class={RESULT_COPY_BTN_CLASS}
              aria-label="Copier la clé"
            >
              Copier
            </button>
          </div>
          {
            /* Deux variantes : « notez cette cle maintenant » adresse a quelqu'un qui vient de
              la coller depuis son coffre serait un bruit qui decredibilise les avertissements. */
          }
          <p id="result-key-note" class="mt-1 text-xs text-green-800 dark:text-green-300">
            Notez cette cl&eacute; maintenant : FGP ne la stocke pas et ne pourra pas vous la
            redonner. Sans elle, l'URL est inexploitable.
          </p>
        </div>

        <div>
          <label class={RESULT_LABEL_CLASS}>
            Blob (header <code class="font-mono">X-FGP-Blob</code>)
          </label>
          <div class="flex gap-2">
            <input
              type="text"
              id="result-blob"
              readonly
              class={RESULT_INPUT_CLASS}
              aria-label="Blob X-FGP-Blob"
            />
            <button
              type="button"
              data-copy="result-blob"
              class={RESULT_COPY_BTN_CLASS}
              aria-label="Copier le blob"
            >
              Copier
            </button>
          </div>
        </div>

        <div>
          <label class={RESULT_LABEL_CLASS}>
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
              class={RESULT_COPY_BTN_CLASS}
              aria-label="Copier la commande curl"
            >
              Copier
            </button>
          </div>
        </div>

        <div>
          <label class={RESULT_LABEL_CLASS}>
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
              class={RESULT_COPY_BTN_CLASS}
              aria-label="Copier la commande curl header mode"
            >
              Copier
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ErrorBanner() {
  return (
    <div
      id="error-banner"
      class={`mt-4 hidden ${ALERT_DANGER_CLASS}`}
      role="alert"
    >
      <AlertTriangleIcon />
      {/* Le message va dans ce span, pas sur le conteneur : textContent effacerait l'icone. */}
      <span id="error-banner-message"></span>
    </div>
  );
}
