import {
  ADD_BTN_CLASS,
  AUTH_MODES,
  FIELD_CLASS,
  HINT_CLASS,
  LABEL_CLASS,
  LEGEND_CLASS,
  PILL_CLASS,
  REMOVE_BTN_CLASS,
  SCALINGO_REGIONS,
  SUB_LABEL_CLASS,
} from "./constants.ts";
import { EyeIcon, TrashIcon } from "./icons.tsx";

export function AuthModeSection() {
  return (
    <section>
      <label
        for="auth"
        class={LABEL_CLASS}
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
  );
}

export function CustomHeadersSection() {
  return (
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

        <p id="custom-headers-hint" class={HINT_CLASS}>
          Chaque header est envoy&eacute; tel quel &agrave; l'API cible, &agrave; chaque
          requ&ecirc;te. Les valeurs sont des secrets : elles sont chiffr&eacute;es dans le blob et
          ne sont plus affich&eacute;es apr&egrave;s la g&eacute;n&eacute;ration. Maximum 8 headers,
          nom 64 caract&egrave;res, valeur 1024 caract&egrave;res.
        </p>
        <p
          id="custom-headers-single-note"
          class={HINT_CLASS}
        >
          Avec un seul header, FGP utilise la forme compacte{" "}
          <code class="font-mono">header:{"{nom}"}</code>. Comportement identique, blob plus petit.
        </p>

        <span id="custom-headers-status" class="sr-only" role="status" aria-live="polite">
        </span>
      </fieldset>
    </section>
  );
}

export function ScalingoAddonSection() {
  return (
    <section id="scalingo-addon-section" hidden>
      <fieldset id="scalingo-addon-fieldset" data-addon-state="idle">
        <legend class={LEGEND_CLASS}>
          Base de donn&eacute;es Scalingo
        </legend>

        <span
          id="addon-region-label"
          class={SUB_LABEL_CLASS}
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
              class={PILL_CLASS}
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
          <code class="font-mono">https://api.osc-fr1.scalingo.com</code>. Cible attendue pour la
          Database API : <code class="font-mono">https://db-api.osc-fr1.scalingo.com</code>
        </p>
        <p
          id="addon-target-warning"
          hidden
          class="mt-2 text-xs text-amber-700 dark:text-amber-300"
        >
          Cette cible ne ressemble pas &agrave; une Database API Scalingo. V&eacute;rifiez l'URL
          cible.
        </p>

        <div class="mt-4 flex flex-wrap items-start gap-2">
          <div class="flex min-w-[14rem] flex-1 gap-2">
            <div class="min-w-0 flex-1">
              <label
                for="addon-app"
                class={SUB_LABEL_CLASS}
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
              class={SUB_LABEL_CLASS}
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

        <p id="addon-hint" class={HINT_CLASS}>
          FGP &eacute;change votre token de compte contre un bearer, puis obtient un token de base
          de donn&eacute;es valable 1 heure, renouvel&eacute; automatiquement. Le consommateur de
          l'URL ne voit ni l'un ni l'autre. Une requ&ecirc;te qui ne vise pas cette base est
          refus&eacute;e. Suggestions d'applications disponibles si vous avez d&eacute;j&agrave;
          charg&eacute; la liste des applications.
        </p>
      </fieldset>
    </section>
  );
}

export function TokenSection() {
  return (
    <section id="token-section">
      <label
        for="token"
        class={LABEL_CLASS}
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
      <p id="token-hint" class={HINT_CLASS}>
        Le token est envoyé au serveur FGP via HTTPS pour le chiffrement. Il n'est jamais stocké.
      </p>
    </section>
  );
}

export function ScalingoAppsSection() {
  return (
    <section id="apps-section" class="hidden" aria-live="polite">
      <fieldset>
        <legend class={LEGEND_CLASS}>
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
  );
}
