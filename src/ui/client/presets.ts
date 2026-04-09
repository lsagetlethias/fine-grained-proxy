import type { BodyFiltersState } from "./body-filters.ts";
import type { Elements } from "./elements.ts";

export function setupPresets(
  els: Elements,
  state: BodyFiltersState,
  updateVisibility: () => void,
): void {
  const btnPresetScalingo = document.getElementById("btn-preset-scalingo") as HTMLButtonElement;
  btnPresetScalingo.addEventListener("click", function () {
    els.targetInput.value = "https://api.osc-fr1.scalingo.com";
    els.authSelect.value = "scalingo-exchange";
    els.authHeaderName.classList.add("hidden");
    els.btnLoadApps.classList.remove("hidden");
    els.scopesTextarea.value = "GET:/v1/apps/*";
    els.tokenInput.placeholder = "tk-us-...";
    updateVisibility();
  });

  const btnPresetClear = document.getElementById("btn-preset-clear") as HTMLButtonElement;
  btnPresetClear.addEventListener("click", function () {
    els.targetInput.value = "";
    els.authSelect.value = "bearer";
    els.authHeaderName.classList.add("hidden");
    els.btnLoadApps.classList.add("hidden");
    els.appsSection.classList.add("hidden");
    els.scopesTextarea.value = "";
    els.tokenInput.placeholder = "Votre cl\u00e9 API";
    state.bodyFiltersData = {};
    state.expandedScopes = {};
    els.bodyFiltersPanel.classList.add("hidden");
    updateVisibility();
  });
}
