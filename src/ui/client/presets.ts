import type { BodyFiltersState } from "./body-filters.ts";
import { assertElement } from "./elements.ts";
import type { Elements } from "./elements.ts";
import type { AppsPermissionsState } from "./types.ts";
import { syncAuthModeVisibility } from "./auth-mode.ts";
import type { AuthModeDeps } from "./auth-mode.ts";
import type { ByokApi } from "./byok.ts";

export function setupPresets(
  els: Elements,
  state: BodyFiltersState,
  appsPerms: AppsPermissionsState,
  updateVisibility: () => void,
  authDeps: AuthModeDeps,
  byok: ByokApi,
): void {
  const btnPresetScalingo = assertElement("btn-preset-scalingo", HTMLButtonElement);
  btnPresetScalingo.addEventListener("click", function () {
    els.targetInput.value = "https://api.osc-fr1.scalingo.com";
    els.authSelect.value = "scalingo-exchange";
    els.scopesTextarea.value = "GET:/v1/apps/*";
    els.tokenInput.placeholder = "tk-us-...";
    syncAuthModeVisibility();
    updateVisibility();
  });

  const btnPresetScalingoDb = assertElement("btn-preset-scalingo-db", HTMLButtonElement);
  btnPresetScalingoDb.addEventListener("click", function () {
    els.authSelect.value = "scalingo-addon";
    authDeps.addons.applyPreset();
    els.targetInput.value = "https://db-api.osc-fr1.scalingo.com";
    els.scopesTextarea.value = "GET:/api/databases/*";
    els.tokenInput.placeholder = "tk-us-...";
    syncAuthModeVisibility();
    authDeps.addons.syncTargetWarning();
    updateVisibility();
  });

  const btnPresetClear = assertElement("btn-preset-clear", HTMLButtonElement);
  btnPresetClear.addEventListener("click", function () {
    els.targetInput.value = "";
    els.authSelect.value = "bearer";
    els.appsSection.classList.add("hidden");
    els.appsList.textContent = "";
    els.scopesTextarea.value = "";
    els.tokenInput.value = "";
    els.tokenInput.placeholder = "Votre cl\u00e9 API";
    state.bodyFiltersData = {};
    state.queryFiltersData = {};
    state.expandedScopes = {};
    els.bodyFiltersPanel.classList.add("hidden");

    authDeps.headers.reset();
    authDeps.addons.reset();
    byok.reset();
    syncAuthModeVisibility();

    const keys = Object.keys(appsPerms);
    for (let i = 0; i < keys.length; i++) {
      delete appsPerms[keys[i]];
    }

    const configName = document.getElementById("config-name") as HTMLInputElement | null;
    if (configName) configName.value = "";
    document.title = "FGP (Fine-Grained Proxy)";
    history.replaceState(null, "", window.location.pathname);

    updateVisibility();
  });
}
