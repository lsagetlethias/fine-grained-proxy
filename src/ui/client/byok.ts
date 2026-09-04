import { checkClientKey, CLIENT_KEY_MIN_LENGTH } from "../../crypto/client-key.ts";
import { assertElement } from "./elements.ts";

const SEGMENT_BASE = "h-1 flex-1 rounded-full";
const SEGMENT_IDLE = "bg-gray-200 dark:bg-gray-700";
// Pas de segment bleu : il entrerait en collision avec la couleur de marque de la page
// et casserait la lecture de l'echelle rouge / ambre / vert.
const SEGMENT_COLORS: Record<string, string> = {
  red: "bg-red-500 dark:bg-red-400",
  amber: "bg-amber-500 dark:bg-amber-400",
  green: "bg-green-500 dark:bg-green-400",
};

const LABEL_NEUTRAL = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const LABEL_ERROR = "mt-1 text-xs text-red-700 dark:text-red-300";

interface Diversity {
  segments: number;
  color: string;
  label: string;
  blocking: boolean;
}

function measure(key: string): Diversity {
  const n = key.length;
  if (n === 0) return { segments: 0, color: "red", label: "", blocking: false };

  const distinct = new Set(key).size;
  const families = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter((re) => re.test(key)).length;

  if (n < CLIENT_KEY_MIN_LENGTH) {
    return {
      segments: 1,
      color: "red",
      label: `Trop courte : ${n} / ${CLIENT_KEY_MIN_LENGTH} caractères minimum.`,
      blocking: true,
    };
  }
  if (distinct < 8) {
    return {
      segments: 1,
      color: "red",
      label: `Diversité : faible. ${distinct} caractères distincts seulement.`,
      blocking: false,
    };
  }
  if (distinct < 12 || families < 2) {
    return {
      segments: 2,
      color: "amber",
      label: "Diversité : moyenne. Ajoutez des caractères variés ou générez une clé.",
      blocking: false,
    };
  }
  // Pas de palier au-dessus : au-dela de ce seuil il n'y a plus de gradient reel entre
  // deux bonnes cles, graduer davantage reviendrait a inventer une note.
  return {
    segments: 3,
    color: "green",
    label: `Diversité : élevée. ${distinct} caractères distincts, ${families} familles.`,
    blocking: false,
  };
}

function generateStrongKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ByokApi {
  readKey(): string;
  validate(): boolean;
  reset(): void;
}

export function setupByok(): ByokApi {
  const details = assertElement("byok-details", HTMLDetailsElement);
  const input = assertElement("byok-key", HTMLInputElement);
  const badge = assertElement("byok-active-badge", HTMLElement);
  const strength = assertElement("byok-strength", HTMLElement);
  const label = assertElement("byok-strength-label", HTMLElement);
  const btnReveal = assertElement("btn-byok-reveal", HTMLButtonElement);
  const btnGenerate = assertElement("btn-byok-generate", HTMLButtonElement);
  const btnCopy = assertElement("btn-byok-copy", HTMLButtonElement);
  const resultOrigin = assertElement("result-key-origin", HTMLElement);

  const segments = Array.from(strength.querySelectorAll<HTMLElement>("[data-byok-segment]"));
  let labelTimer: ReturnType<typeof setTimeout> | null = null;

  if (typeof crypto?.getRandomValues !== "function") {
    btnGenerate.disabled = true;
    label.textContent = "Génération indisponible sur ce navigateur, saisissez une clé manuellement.";
  }

  function paint(level: Diversity): void {
    segments.forEach((segment, index) => {
      const active = index < level.segments;
      segment.className = `${SEGMENT_BASE} ${
        active ? SEGMENT_COLORS[level.color] : SEGMENT_IDLE
      }`;
    });
  }

  function writeLabel(text: string, isError: boolean, immediate: boolean): void {
    if (labelTimer !== null) clearTimeout(labelTimer);
    const apply = () => {
      label.textContent = text;
      label.className = isError ? LABEL_ERROR : LABEL_NEUTRAL;
    };
    // La region est aria-live : la reecrire a chaque frappe noierait le lecteur d'ecran.
    if (immediate) apply();
    else labelTimer = setTimeout(apply, 500);
  }

  function refresh(immediate = false): void {
    const key = input.value.trim();
    badge.hidden = key.length === 0;
    const level = measure(key);
    paint(level);
    if (key.length === 0) {
      input.removeAttribute("aria-invalid");
      writeLabel("", false, immediate);
      return;
    }
    const issue = checkClientKey(key);
    if (issue === "invalid-charset") {
      input.setAttribute("aria-invalid", "true");
      paint({ ...level, segments: 1, color: "red" });
      writeLabel("Caractères ASCII imprimables sans espace uniquement.", true, immediate);
      return;
    }
    if (issue === "too-long") {
      input.setAttribute("aria-invalid", "true");
      writeLabel("256 caractères maximum.", true, immediate);
      return;
    }
    if (issue === "too-short") {
      input.setAttribute("aria-invalid", "true");
      writeLabel(level.label, true, immediate);
      return;
    }
    input.removeAttribute("aria-invalid");
    writeLabel(level.label, false, immediate);
  }

  function setRevealed(revealed: boolean): void {
    input.type = revealed ? "text" : "password";
    btnReveal.setAttribute("aria-pressed", revealed ? "true" : "false");
    btnReveal.setAttribute("aria-label", revealed ? "Masquer la clé" : "Afficher la clé");
  }

  input.addEventListener("input", () => refresh());

  btnReveal.addEventListener("click", () => {
    setRevealed(input.type === "password");
  });

  btnGenerate.addEventListener("click", () => {
    input.value = generateStrongKey();
    setRevealed(true);
    badge.hidden = false;
    paint({ segments: 3, color: "green", label: "", blocking: false });
    input.removeAttribute("aria-invalid");
    writeLabel(
      "Diversité : élevée. Clé générée localement, 192 bits d'entropie. Copiez-la maintenant : elle ne sera plus affichée après la génération.",
      false,
      true,
    );
    btnCopy.focus();
  });

  return {
    readKey(): string {
      return input.value.trim();
    },
    validate(): boolean {
      const key = input.value.trim();
      if (key.length === 0) return true;
      if (checkClientKey(key) === null) return true;
      // Ouvrir avant de focuser : le focus sur un element non rendu est perdu.
      details.open = true;
      input.setAttribute("aria-invalid", "true");
      refresh(true);
      input.focus();
      return false;
    },
    reset(): void {
      input.value = "";
      setRevealed(false);
      badge.hidden = true;
      input.removeAttribute("aria-invalid");
      details.open = false;
      paint({ segments: 0, color: "red", label: "", blocking: false });
      writeLabel("", false, true);
      resultOrigin.textContent = "générée par le serveur";
      resultOrigin.className =
        "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300";
    },
  };
}

export function markKeyOrigin(providedByUser: boolean): void {
  const badge = document.getElementById("result-key-origin");
  if (!badge) return;
  badge.textContent = providedByUser ? "fournie par vous" : "générée par le serveur";
  badge.className = providedByUser
    ? "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    : "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300";
}
