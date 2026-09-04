import type { Auth } from "../../auth/spec.ts";
import type { AddonsApi } from "./addons.ts";
import type { AuthHeadersApi } from "./auth-headers.ts";

export const AUTH_MODE_HEADERS = "header:";
export const AUTH_MODE_SCALINGO_ADDON = "scalingo-addon";

export interface AuthModeDeps {
  headers: AuthHeadersApi;
  addons: AddonsApi;
}

export type AuthResult =
  | { ok: true; auth: Auth; requiresToken: boolean }
  | { ok: false; message: string };

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function currentAuthMode(): string {
  return element<HTMLSelectElement>("auth")?.value ?? "bearer";
}

export function syncAuthModeVisibility(): void {
  const mode = currentAuthMode();
  const headersMode = mode === AUTH_MODE_HEADERS;
  const addonMode = mode === AUTH_MODE_SCALINGO_ADDON;

  const headersSection = element("custom-headers-section");
  const addonSection = element("scalingo-addon-section");
  const tokenSection = element("token-section");
  const tokenInput = element<HTMLInputElement>("token");
  const authSelect = element<HTMLSelectElement>("auth");
  const btnLoadApps = element("btn-load-apps");

  if (headersSection) headersSection.hidden = !headersMode;
  if (addonSection) addonSection.hidden = !addonMode;
  if (btnLoadApps) btnLoadApps.classList.toggle("hidden", mode !== "scalingo-exchange");

  if (!tokenSection || !tokenInput) return;

  if (headersMode) {
    // Un champ required invalide dans un conteneur masque fait echouer reportValidity()
    // et rend le formulaire non soumettable, sans aucun message visible.
    if (tokenSection.contains(document.activeElement)) authSelect?.focus();
    tokenInput.required = false;
    tokenInput.value = "";
    tokenSection.hidden = true;
  } else {
    tokenSection.hidden = false;
    tokenInput.required = true;
  }
}

export function buildAuthPayload(deps: AuthModeDeps): AuthResult {
  const mode = currentAuthMode();

  if (mode === AUTH_MODE_HEADERS) {
    if (!deps.headers.validate()) {
      return { ok: false, message: "Corrigez les headers d'authentification." };
    }
    const entries = deps.headers.readEntries();
    if (entries.length === 0) {
      return { ok: false, message: "Au moins un header d'authentification est requis." };
    }
    return {
      ok: true,
      auth: { type: "headers", headers: entries },
      requiresToken: false,
    };
  }

  if (mode === AUTH_MODE_SCALINGO_ADDON) {
    if (!deps.addons.validate()) {
      return { ok: false, message: "Corrigez la base de données autorisée." };
    }
    const entry = deps.addons.readEntry();
    if (!entry) {
      return { ok: false, message: "Une base de données est requise." };
    }
    return {
      ok: true,
      auth: {
        type: "scalingo-addon",
        app: entry.app,
        addonId: entry.addonId,
        apiUrl: deps.addons.readApiUrl(),
      },
      requiresToken: true,
    };
  }

  return { ok: true, auth: mode, requiresToken: true };
}

// Le partage ?c= voyage dans une URL : les noms de headers restent, les valeurs partent vides.
export function buildShareAuth(deps: AuthModeDeps): Auth {
  const mode = currentAuthMode();

  if (mode === AUTH_MODE_HEADERS) {
    const entries = deps.headers.readEntries().filter((entry) => entry.name.length > 0);
    if (entries.length === 0) return mode;
    return {
      type: "headers",
      headers: entries.map((entry) => ({ name: entry.name, value: "" })),
    };
  }

  // Ni le nom d'application ni l'identifiant de base : une URL de partage collee dans un
  // ticket exposerait la topologie du compte. Le destinataire les recharge.
  if (mode === AUTH_MODE_SCALINGO_ADDON) {
    return { type: "scalingo-addon", app: "", addonId: "", apiUrl: deps.addons.readApiUrl() };
  }

  return mode;
}

export function applyAuthToForm(auth: Auth, deps: AuthModeDeps, redacted: boolean): void {
  const authSelect = element<HTMLSelectElement>("auth");
  if (!authSelect) return;

  if (typeof auth !== "string") {
    if (auth.type === "headers") {
      authSelect.value = AUTH_MODE_HEADERS;
      deps.headers.setEntries(
        auth.headers.map((entry) => ({
          name: entry.name,
          value: redacted ? "" : entry.value,
        })),
        redacted,
      );
    } else {
      authSelect.value = AUTH_MODE_SCALINGO_ADDON;
      const hasPair = auth.app.length > 0 && auth.addonId.length > 0;
      deps.addons.setEntry(hasPair ? { app: auth.app, addonId: auth.addonId } : null, auth.apiUrl);
    }
  } else if (auth.startsWith(AUTH_MODE_HEADERS) && auth.length > AUTH_MODE_HEADERS.length) {
    authSelect.value = AUTH_MODE_HEADERS;
    deps.headers.setEntries(
      [{ name: auth.slice(AUTH_MODE_HEADERS.length), value: "" }],
      true,
    );
  } else {
    authSelect.value = auth;
  }

  authSelect.dispatchEvent(new Event("change"));
}
