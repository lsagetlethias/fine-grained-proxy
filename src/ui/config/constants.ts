export const TTL_PRESETS = [
  { label: "1 heure", value: "3600" },
  { label: "24 heures", value: "86400" },
  { label: "7 jours", value: "604800" },
  { label: "30 jours", value: "2592000" },
  { label: "Personnalisé", value: "custom" },
  { label: "Pas d'expiration", value: "0" },
];

export const AUTH_MODES = [
  { label: "Bearer token", value: "bearer" },
  { label: "Basic auth", value: "basic" },
  { label: "Scalingo API", value: "scalingo-exchange" },
  { label: "Scalingo Database API", value: "scalingo-addon" },
  { label: "Headers multiples", value: "header:" },
];

export const SCALINGO_REGIONS = [
  { label: "Paris (osc-fr1)", value: "osc-fr1" },
  { label: "SecNumCloud (osc-secnum-fr1)", value: "osc-secnum-fr1" },
];

export const FIELD_CLASS =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:border-red-500 aria-[invalid=true]:focus:ring-red-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 dark:aria-[invalid=true]:border-red-500";

// Hauteur explicite des controles. Ne jamais compter sur align-items: stretch pour
// egaliser un bouton et un champ : l'egalite disparait des que le bouton passe sur sa
// propre ligne en flex-wrap, ce qui arrive sur mobile.
export const CONTROL_H = "h-[2.375rem]";
export const CONTROL_H_SM = "h-[2.125rem]";

export const REMOVE_BTN_CLASS =
  "h-[2.375rem] w-[2.375rem] shrink-0 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-fgp-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent dark:hover:text-red-400 dark:hover:bg-red-900/30";

export const ADD_BTN_CLASS =
  "mt-3 inline-flex items-center gap-1 text-sm font-medium text-fgp-600 hover:text-fgp-800 dark:text-fgp-400 dark:hover:text-fgp-200 focus:outline-none focus:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline dark:disabled:text-gray-500";

export const LABEL_CLASS = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export const SUB_LABEL_CLASS = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

export const LEGEND_CLASS = "text-sm font-medium text-gray-700 dark:text-gray-300 mb-2";

export const HINT_CLASS = "mt-1 text-xs text-gray-500 dark:text-gray-400";

export const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400";

export const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm cursor-pointer hover:border-fgp-500 has-[:checked]:bg-fgp-600 has-[:checked]:text-white has-[:checked]:border-fgp-600 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:border-fgp-400";

export const RESULT_LABEL_CLASS =
  "block text-xs font-medium text-green-700 dark:text-green-300 mb-1";

export const RESULT_INPUT_CLASS =
  "flex-1 rounded-md border border-green-300 bg-white px-3 py-2 text-xs font-mono text-gray-800 select-all dark:bg-gray-800 dark:border-green-700 dark:text-gray-200";

export const RESULT_COPY_BTN_CLASS =
  "copy-btn h-[2.125rem] inline-flex items-center justify-center rounded-md border border-green-300 bg-white px-3 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:border-green-700 dark:text-green-300 dark:hover:bg-gray-700";
