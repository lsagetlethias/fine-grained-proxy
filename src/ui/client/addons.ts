import { assertElement } from "./elements.ts";

export interface AddonEntry {
  app: string;
  addonId: string;
}

interface LoadedAddon {
  id: string;
  resourceId: string;
  provider: string;
  plan: string;
}

const STATUS_CLASSES: Record<string, string> = {
  neutral: "mt-2 text-xs text-gray-500 dark:text-gray-400",
  success: "mt-2 text-xs text-green-700 dark:text-green-300",
  warning: "mt-2 text-xs text-amber-700 dark:text-amber-300",
  error: "mt-2 text-xs text-red-700 dark:text-red-300",
};

export interface AddonsApi {
  readEntry(): AddonEntry | null;
  readApiUrl(): string;
  setEntry(entry: AddonEntry | null, apiUrl?: string): void;
  validate(): boolean;
  reset(): void;
  suggestApps(apps: string[]): void;
  syncTargetWarning(): void;
  applyPreset(): void;
}

export function regionApiUrl(region: string): string {
  return `https://api.${region}.scalingo.com`;
}

export function regionDbUrl(region: string): string {
  return `https://db-api.${region}.scalingo.com`;
}

export function setupAddons(getToken: () => string): AddonsApi {
  const appInput = assertElement("addon-app", HTMLInputElement);
  const select = assertElement("addon-select", HTMLSelectElement);
  const btnLoad = assertElement("btn-addon-load", HTMLButtonElement);
  const status = assertElement("addon-status", HTMLElement);
  const fieldset = assertElement("scalingo-addon-fieldset", HTMLFieldSetElement);
  const regionUrls = assertElement("addon-region-urls", HTMLElement);
  const targetWarning = assertElement("addon-target-warning", HTMLElement);
  const datalist = assertElement("addon-apps-datalist", HTMLElement);

  let loaded: LoadedAddon[] = [];

  function setStatus(message: string, tone: keyof typeof STATUS_CLASSES): void {
    status.textContent = message;
    status.className = STATUS_CLASSES[tone];
  }

  function setState(state: string): void {
    fieldset.dataset.addonState = state;
  }

  function currentRegion(): string {
    const checked = document.querySelector<HTMLInputElement>("input[name=addon-region]:checked");
    return checked?.value ?? "osc-fr1";
  }

  function code(text: string): HTMLElement {
    const el = document.createElement("code");
    el.className = "font-mono";
    el.textContent = text;
    return el;
  }

  function resetSelect(): void {
    select.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choisissez une base de données";
    select.appendChild(placeholder);
    select.disabled = true;
  }

  function toIdle(): void {
    loaded = [];
    resetSelect();
    appInput.removeAttribute("aria-invalid");
    setStatus("", "neutral");
    setState("idle");
    btnLoad.textContent = "Charger";
  }

  function optionLabel(addon: LoadedAddon, all: LoadedAddon[]): string {
    const readable = addon.resourceId || addon.id;
    const base = addon.provider ? `${readable} · ${addon.provider}` : readable;
    const duplicate = all.filter((a) => (a.resourceId || a.id) === readable).length > 1;
    return duplicate ? `${base} (…${addon.id.slice(-6)})` : base;
  }

  function fillSelect(addons: LoadedAddon[]): void {
    resetSelect();
    for (const addon of addons) {
      const option = document.createElement("option");
      option.value = addon.id;
      option.textContent = optionLabel(addon, addons);
      select.appendChild(option);
    }
    select.disabled = false;
    if (addons.length === 1) select.value = addons[0].id;
  }

  async function loadAddons(): Promise<void> {
    const app = appInput.value.trim();
    const token = getToken();
    if (!app) {
      setStatus("Renseignez d'abord une application.", "error");
      appInput.setAttribute("aria-invalid", "true");
      appInput.focus();
      return;
    }
    if (!token) {
      setStatus("Renseignez votre token Scalingo et le nom de l'application.", "error");
      return;
    }

    // aria-disabled plutot que disabled : le focus doit survivre pour que le resultat
    // soit annonce dans le contexte du bouton.
    btnLoad.setAttribute("aria-disabled", "true");
    btnLoad.textContent = "Chargement…";
    setState("loading");
    setStatus("Chargement des bases de données...", "neutral");

    try {
      const res = await fetch("/api/list-addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, app, target: regionApiUrl(currentRegion()) }),
      });

      if (res.status === 401) {
        setState("error");
        setStatus("Token refusé par Scalingo. Vérifiez votre token de compte.", "error");
        btnLoad.textContent = "Réessayer";
        return;
      }
      if (res.status === 404) {
        setState("not-found");
        setStatus(
          "Application introuvable. Vérifiez le nom exact, il est sensible à la casse.",
          "error",
        );
        appInput.setAttribute("aria-invalid", "true");
        btnLoad.textContent = "Réessayer";
        appInput.focus();
        return;
      }
      if (!res.ok) {
        setState("error");
        setStatus(
          "Impossible de récupérer les bases de données de cette application.",
          "error",
        );
        btnLoad.textContent = "Réessayer";
        return;
      }

      const data = await res.json() as { addons?: LoadedAddon[] };
      loaded = data.addons ?? [];
      btnLoad.textContent = "Charger";

      if (loaded.length === 0) {
        resetSelect();
        setState("empty");
        setStatus("Cette application n'a aucune base de données.", "warning");
        return;
      }

      fillSelect(loaded);
      setState("loaded");
      setStatus(
        loaded.length === 1
          ? "1 base de données trouvée, sélectionnée automatiquement."
          : `${loaded.length} bases de données trouvées.`,
        "success",
      );
    } catch {
      setState("error");
      setStatus(
        "Impossible de récupérer les bases de données de cette application.",
        "error",
      );
      btnLoad.textContent = "Réessayer";
    } finally {
      btnLoad.removeAttribute("aria-disabled");
    }
  }

  function syncTargetWarning(): void {
    const target = (document.getElementById("target") as HTMLInputElement | null)?.value.trim() ??
      "";
    const authSelect = document.getElementById("auth") as HTMLSelectElement | null;
    if (!authSelect || authSelect.value !== "scalingo-addon" || target.length === 0) {
      targetWarning.hidden = true;
      return;
    }
    targetWarning.hidden = target.includes("db-api.") && target.includes("scalingo.com");
  }

  function syncRegion(): void {
    const region = currentRegion();
    regionUrls.textContent = "";
    regionUrls.append("Cible : ", code(regionDbUrl(region)));
  }

  // Un identifiant d'addon n'est pas valide d'une region a l'autre : laisser une base
  // selectionnee apres un changement de region produirait un blob silencieusement faux.
  function onRegionChange(): void {
    syncRegion();
    toIdle();
    const targetInput = document.getElementById("target") as HTMLInputElement | null;
    if (targetInput) {
      targetInput.value = regionDbUrl(currentRegion());
      targetInput.dispatchEvent(new Event("input"));
    }
    syncTargetWarning();
  }

  appInput.addEventListener("input", function () {
    if (loaded.length > 0 || !select.disabled) toIdle();
  });

  btnLoad.addEventListener("click", function () {
    if (btnLoad.getAttribute("aria-disabled") === "true") return;
    loadAddons();
  });

  document.querySelectorAll<HTMLInputElement>("input[name=addon-region]").forEach((radio) => {
    radio.addEventListener("change", onRegionChange);
  });

  syncRegion();

  return {
    readEntry(): AddonEntry | null {
      const app = appInput.value.trim();
      const addonId = select.value;
      if (!app || !addonId) return null;
      return { app, addonId };
    },
    readApiUrl(): string {
      return regionApiUrl(currentRegion());
    },
    setEntry(entry: AddonEntry | null, apiUrl?: string): void {
      if (apiUrl) {
        const region = apiUrl.match(/^https:\/\/api\.([^.]+)\.scalingo\.com/)?.[1];
        if (region) {
          const radio = document.querySelector<HTMLInputElement>(
            `input[name=addon-region][value="${region}"]`,
          );
          if (radio) radio.checked = true;
          syncRegion();
        }
      }
      toIdle();
      if (!entry) return;
      appInput.value = entry.app;
      const option = document.createElement("option");
      option.value = entry.addonId;
      option.textContent = entry.addonId;
      select.appendChild(option);
      select.value = entry.addonId;
      select.disabled = false;
      setState("loaded");
      setStatus(
        "Base importée. Rechargez la liste pour en choisir une autre.",
        "neutral",
      );
    },
    validate(): boolean {
      appInput.removeAttribute("aria-invalid");
      if (!appInput.value.trim()) {
        setStatus("Renseignez le nom de l'application.", "error");
        appInput.setAttribute("aria-invalid", "true");
        appInput.focus();
        return false;
      }
      if (!select.value) {
        setStatus("Sélectionnez une base de données pour cette application.", "error");
        select.focus();
        return false;
      }
      return true;
    },
    reset(): void {
      appInput.value = "";
      toIdle();
      const defaultRegion = document.querySelector<HTMLInputElement>(
        'input[name=addon-region][value="osc-fr1"]',
      );
      if (defaultRegion) defaultRegion.checked = true;
      syncRegion();
      targetWarning.hidden = true;
    },
    suggestApps(apps: string[]): void {
      datalist.textContent = "";
      for (const app of apps) {
        const option = document.createElement("option");
        option.value = app;
        datalist.appendChild(option);
      }
    },
    syncTargetWarning,
    applyPreset(): void {
      const defaultRegion = document.querySelector<HTMLInputElement>(
        'input[name=addon-region][value="osc-fr1"]',
      );
      if (defaultRegion) defaultRegion.checked = true;
      syncRegion();
      toIdle();
    },
  };
}
