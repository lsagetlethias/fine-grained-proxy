import {
  decodePublicConfig,
  encodePublicConfig,
  type PublicConfig,
} from "../../crypto/share.ts";
import { buildScopes } from "./build-scopes.ts";
import { restoreScopeFilters } from "./restore-filters.ts";
import type { ScopeFiltersData } from "./types.ts";
import { applyAuthToForm, buildShareAuth } from "./auth-mode.ts";
import type { AuthModeDeps } from "./auth-mode.ts";

function readCurrentConfig(
  filtersData: ScopeFiltersData,
  authDeps: AuthModeDeps,
): PublicConfig | null {
  const target = (document.getElementById("target") as HTMLInputElement | null)?.value ?? "";
  const auth = buildShareAuth(authDeps);

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  const rawLines = scopesTextarea?.value.split("\n").filter((l) => l.trim() !== "") ?? [];
  const scopes = scopesTextarea ? buildScopes(scopesTextarea.value, filtersData).scopes : [];

  const ttlRadio = document.querySelector<HTMLInputElement>("input[name=ttl]:checked");
  let ttl = 86400;
  if (ttlRadio) {
    if (ttlRadio.value === "custom") {
      const customInput = document.getElementById("custom-ttl") as HTMLInputElement | null;
      ttl = customInput ? parseInt(customInput.value, 10) || 0 : 0;
    } else {
      ttl = parseInt(ttlRadio.value, 10) || 0;
    }
  }

  if (!target && rawLines.length === 0) return null;

  const name = (document.getElementById("config-name") as HTMLInputElement | null)?.value || undefined;
  const testMethod = (document.getElementById("test-method") as HTMLSelectElement | null)?.value;
  const testPath = (document.getElementById("test-path") as HTMLInputElement | null)?.value;
  const testBody = (document.getElementById("test-body") as HTMLTextAreaElement | null)?.value;

  const test = testPath
    ? { method: testMethod ?? "GET", path: testPath, body: testBody || undefined }
    : undefined;

  return { name, target, auth, scopes, ttl, test };
}

function scopeToLine(scope: unknown): string {
  if (typeof scope === "string") return scope;
  const entry = scope as { methods?: string[]; pattern?: string };
  if (entry.methods && entry.pattern) {
    return `${entry.methods.join("|")}:${entry.pattern}`;
  }
  return String(scope);
}

const DEFAULT_TITLE = "FGP (Fine-Grained Proxy)";

function updateTitle(name?: string): void {
  document.title = name ? `${name} : ${DEFAULT_TITLE}` : DEFAULT_TITLE;
}

function applyConfig(config: PublicConfig, authDeps: AuthModeDeps): void {
  const nameInput = document.getElementById("config-name") as HTMLInputElement | null;
  if (nameInput && config.name) nameInput.value = config.name;
  updateTitle(config.name);

  const targetInput = document.getElementById("target") as HTMLInputElement | null;
  if (targetInput) targetInput.value = config.target;

  applyAuthToForm(config.auth, authDeps, true);

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  if (scopesTextarea) {
    scopesTextarea.value = config.scopes.map(scopeToLine).join("\n");
    scopesTextarea.dispatchEvent(new Event("input"));
  }

  const ttlValue = String(config.ttl);
  const ttlRadios = document.querySelectorAll<HTMLInputElement>("input[name=ttl]");
  let matched = false;
  ttlRadios.forEach((radio) => {
    if (radio.value === ttlValue) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
      matched = true;
    }
  });
  if (!matched) {
    const customRadio = document.querySelector<HTMLInputElement>("input[name=ttl][value=custom]");
    if (customRadio) {
      customRadio.checked = true;
      customRadio.dispatchEvent(new Event("change"));
      const customInput = document.getElementById("custom-ttl") as HTMLInputElement | null;
      if (customInput) customInput.value = ttlValue;
    }
  }

  if (config.test) {
    const testMethod = document.getElementById("test-method") as HTMLSelectElement | null;
    const testPath = document.getElementById("test-path") as HTMLInputElement | null;
    const testBody = document.getElementById("test-body") as HTMLTextAreaElement | null;
    if (testMethod) testMethod.value = config.test.method;
    if (testPath) testPath.value = config.test.path;
    if (testBody && config.test.body) testBody.value = config.test.body;
  }
}

async function updateShareUrl(
  filtersData: ScopeFiltersData,
  authDeps: AuthModeDeps,
): Promise<void> {
  const config = readCurrentConfig(filtersData, authDeps);
  if (!config) {
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    history.replaceState(null, "", url.toString());
    return;
  }

  const encoded = await encodePublicConfig(config);
  const url = new URL(window.location.href);
  url.searchParams.set("c", encoded);
  history.replaceState(null, "", url.toString());
}

export function setupShareConfig(
  filtersData: ScopeFiltersData,
  authDeps: AuthModeDeps,
  showError: (msg: string) => void,
): void {
  let initializing = false;

  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("c");
  if (encoded) {
    initializing = true;
    decodePublicConfig(encoded).then((config) => {
      applyConfig(config, authDeps);
      const report = restoreScopeFilters(config.scopes, filtersData);
      // Un filtre que le formulaire ne sait pas reafficher ne doit pas disparaitre en
      // silence : regenerer depuis cet ecran produirait un token plus large que celui qui
      // a ete partage, sans que rien ne l'ait signale.
      if (report.unsupported.length > 0) {
        showError(
          "Configuration partagée : filtre non restaurable dans le formulaire, " +
            report.unsupported[0] +
            ". Regénérer depuis cet écran produirait un token plus large.",
        );
      }
      const scopesTa = document.getElementById("scopes");
      if (scopesTa) scopesTa.dispatchEvent(new Event("input"));
      const testMethod = document.getElementById("test-method");
      if (testMethod) testMethod.dispatchEvent(new Event("change"));
      if (config.test?.path) {
        const details = document.querySelector("details:has(#test-scope-results)") as HTMLDetailsElement | null;
        if (details) details.open = true;
      }
      setTimeout(() => { initializing = false; }, 600);
    }).catch(() => {
      initializing = false;
    });
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleUpdate(): void {
    if (initializing) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateShareUrl(filtersData, authDeps);
    }, 500);
  }

  // Liste blanche stricte : #byok-key et les valeurs de headers d'auth sont des secrets,
  // ils ne doivent jamais atteindre l'URL de partage (historique, logs de proxy, Referer).
  const fields = [
    "config-name", "target", "auth", "scopes", "custom-ttl",
    "test-method", "test-path", "test-body",
  ];

  const nameInput = document.getElementById("config-name") as HTMLInputElement | null;
  if (nameInput) {
    nameInput.addEventListener("input", () => updateTitle(nameInput.value || undefined));
  }
  for (const id of fields) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", scheduleUpdate);
      el.addEventListener("change", scheduleUpdate);
    }
  }

  document.querySelectorAll<HTMLInputElement>("input[name=ttl]").forEach((radio) => {
    radio.addEventListener("change", scheduleUpdate);
  });

  const headersList = document.getElementById("custom-headers-list");
  if (headersList) {
    headersList.addEventListener("input", scheduleUpdate);
    headersList.addEventListener("change", scheduleUpdate);
  }

  const bodyFiltersPanel = document.getElementById("body-filters-list");
  if (bodyFiltersPanel) {
    bodyFiltersPanel.addEventListener("input", scheduleUpdate);
    bodyFiltersPanel.addEventListener("change", scheduleUpdate);
  }
}
