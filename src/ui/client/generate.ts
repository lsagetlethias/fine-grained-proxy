import type { ScopeFiltersData } from "./types.ts";
import { assertElement } from "./elements.ts";
import type { Elements } from "./elements.ts";
import { buildScopes } from "./build-scopes.ts";
import { buildAuthPayload } from "./auth-mode.ts";
import type { AuthModeDeps } from "./auth-mode.ts";
import { markKeyOrigin } from "./byok.ts";
import type { ByokApi } from "./byok.ts";

export function setupGenerate(
  els: Elements,
  filtersData: ScopeFiltersData,
  showError: (msg: string) => void,
  hideError: () => void,
  getLogsConfig: (() => { enabled: boolean; detailed: boolean } | null) | undefined,
  authDeps: AuthModeDeps,
  byok: ByokApi,
): void {
  const fgpForm = assertElement("fgp-form", HTMLFormElement);
  fgpForm.addEventListener("submit", async function (e: Event) {
    e.preventDefault();
    hideError();

    const token = els.tokenInput.value.trim();
    const target = els.targetInput.value.trim();

    const authResult = buildAuthPayload(authDeps);
    if (!authResult.ok) {
      showError(authResult.message);
      return;
    }

    if (authResult.requiresToken && !token) {
      showError("Token manquant.");
      return;
    }
    if (!target) {
      showError("URL cible manquante.");
      return;
    }
    if (!byok.validate()) {
      showError("Cl\u00e9 client personnalis\u00e9e invalide.");
      return;
    }

    const built = buildScopes(els.scopesTextarea.value, filtersData);
    // Un filtre query incomplet ne peut pas etre traduit en « pas de filtre » : le blob
    // partirait sans aucune contrainte de query, en v3 au lieu de v5, pendant que l'alerte
    // de deni par defaut et la chip du scope affirment le contraire a l'ecran.
    if (built.errors.length > 0) {
      showError(built.errors[0]);
      return;
    }
    const scopes = built.scopes;
    if (scopes.length === 0) {
      showError("Au moins un scope requis.");
      return;
    }

    const ttlRadio = document.querySelector<HTMLInputElement>("input[name=ttl]:checked");
    if (!ttlRadio) {
      showError("S\u00e9lectionnez une dur\u00e9e de validit\u00e9.");
      return;
    }
    let ttl = 0;
    if (ttlRadio.value === "custom") {
      const customTtl = assertElement("custom-ttl", HTMLInputElement);
      const customVal = customTtl.value;
      if (!customVal || Number(customVal) < 60) {
        showError("TTL personnalis\u00e9 invalide (minimum 60s).");
        return;
      }
      ttl = Number(customVal);
    } else {
      ttl = Number(ttlRadio.value);
    }

    const btn = assertElement("btn-generate", HTMLButtonElement);
    btn.disabled = true;
    btn.textContent = "G\u00e9n\u00e9ration\u2026";

    const nameInput = document.getElementById("config-name") as HTMLInputElement | null;
    const name = nameInput?.value.trim() || undefined;
    const logs = getLogsConfig ? getLogsConfig() : null;
    const customKey = byok.readKey();

    try {
      const payload: Record<string, unknown> = {
        target: target,
        auth: authResult.auth,
        scopes: scopes,
        ttl: ttl,
      };
      if (authResult.requiresToken) payload.token = token;
      if (customKey) payload.key = customKey;
      if (name) payload.name = name;
      if (logs) payload.logs = logs;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(function () {
          return {} as Record<string, string>;
        });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      const data = await res.json();

      const resultUrl = assertElement("result-url", HTMLInputElement);
      const resultKey = assertElement("result-key", HTMLInputElement);
      const resultBlob = assertElement("result-blob", HTMLInputElement);
      const resultCurl = assertElement("result-curl", HTMLElement);
      const resultCurlHeader = assertElement("result-curl-header", HTMLElement);
      resultUrl.value = data.url;
      resultKey.value = data.key;
      markKeyOrigin(customKey.length > 0);
      resultBlob.value = data.blob;
      resultCurl.textContent = 'curl -H "X-FGP-Key: ' + data.key + '" ' + data.url + "v1/apps";
      const origin = new URL(data.url).origin;
      resultCurlHeader.textContent = 'curl -H "X-FGP-Key: ' + data.key + '" \\\n  -H "X-FGP-Blob: ' +
        data.blob + '" \\\n  ' + origin + "/v1/apps";
      els.resultSection.classList.remove("hidden");
      resultUrl.focus();
    } catch (err) {
      showError("Erreur lors de la g\u00e9n\u00e9ration : " + (err as Error).message);
    } finally {
      btn.disabled = false;
      btn.textContent = "G\u00e9n\u00e9rer l'URL";
    }
  });
}
