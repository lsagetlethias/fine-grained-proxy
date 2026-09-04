import { CONTROL_H_SM, HINT_CLASS, LABEL_CLASS, SUB_LABEL_CLASS } from "./constants.ts";
export function ScopesSection() {
  return (
    <section>
      <label
        for="scopes"
        class={LABEL_CLASS}
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
      <p id="scopes-hint" class={HINT_CLASS}>
        Un pattern par ligne. Wildcard * pour tout matcher. Les scopes POST/PUT/PATCH permettent
        d'ajouter des filtres sur le contenu de la requ&ecirc;te.
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
  );
}

export function TestScopeSection() {
  return (
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
              class={SUB_LABEL_CLASS}
              for="test-method"
            >
              M&eacute;thode
            </label>
            <select
              id="test-method"
              class={`${CONTROL_H_SM} w-full rounded-md border border-gray-300 bg-white px-2 text-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200`}
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
              class={SUB_LABEL_CLASS}
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
            class={SUB_LABEL_CLASS}
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
            class={`${CONTROL_H_SM} inline-flex items-center justify-center rounded-md bg-fgp-600 px-4 text-sm font-medium text-white hover:bg-fgp-700 focus:outline-none focus:ring-2 focus:ring-fgp-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900`}
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
  );
}
