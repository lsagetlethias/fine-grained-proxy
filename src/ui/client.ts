import { getElements } from "./client/elements.ts";
import { updateBodyFiltersVisibility } from "./client/body-filters.ts";
import type { BodyFiltersState } from "./client/body-filters.ts";
import { setupPresets } from "./client/presets.ts";
import { setupApps } from "./client/apps.ts";
import { setupTtl } from "./client/ttl.ts";
import { setupClipboard } from "./client/clipboard.ts";
import { setupGenerate } from "./client/generate.ts";
import { setupTestScope } from "./client/test-scope.ts";
import { setupImportConfig } from "./client/import-config.ts";
import { setupShareConfig } from "./client/share-config.ts";
import { setupTabs } from "./client/tabs.ts";
import type { AppsPermissionsState } from "./client/types.ts";

(function () {
  "use strict";

  const els = getElements();

  const state: BodyFiltersState = {
    bodyFiltersData: {},
    nextFilterId: 1,
    expandedScopes: {},
  };

  const appsPerms: AppsPermissionsState = {};

  function showError(msg: string): void {
    els.errorBanner.textContent = msg;
    els.errorBanner.classList.remove("hidden");
    setTimeout(function () {
      els.errorBanner.classList.add("hidden");
    }, 8000);
  }

  function hideError(): void {
    els.errorBanner.classList.add("hidden");
  }

  function doUpdateVisibility(): void {
    updateBodyFiltersVisibility(
      els.scopesTextarea,
      els.btnAddBodyFilters,
      els.bodyFiltersPanel,
      els.bodyFiltersList,
      els.scopeChips,
      state,
    );
  }

  els.scopesTextarea.addEventListener("input", doUpdateVisibility);

  els.btnAddBodyFilters.addEventListener("click", function () {
    els.bodyFiltersPanel.classList.remove("hidden");
    doUpdateVisibility();
    els.bodyFiltersPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  els.btnCloseBodyFilters.addEventListener("click", function () {
    els.bodyFiltersPanel.classList.add("hidden");
  });

  setupShareConfig();

  els.authSelect.addEventListener("change", function () {
    if (els.authSelect.value === "header:") {
      els.authHeaderName.classList.remove("hidden");
    } else {
      els.authHeaderName.classList.add("hidden");
    }
    els.btnLoadApps.classList.toggle("hidden", els.authSelect.value !== "scalingo-exchange");
  });

  setupPresets(els, state, appsPerms, doUpdateVisibility);
  setupApps(els, state, appsPerms, showError, hideError, doUpdateVisibility);
  setupTtl(els);
  setupGenerate(els, state.bodyFiltersData, showError, hideError);
  setupClipboard();
  setupTestScope();
  setupImportConfig();
  setupTabs();

  doUpdateVisibility();
})();
