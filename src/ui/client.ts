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
import { setupLogsTab } from "./client/logs-tab.ts";
import { setupAuthHeaders } from "./client/auth-headers.ts";
import { setupAddons } from "./client/addons.ts";
import { setupByok } from "./client/byok.ts";
import { syncAuthModeVisibility } from "./client/auth-mode.ts";
import type { AuthModeDeps } from "./client/auth-mode.ts";
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

  const authDeps: AuthModeDeps = {
    headers: setupAuthHeaders(),
    addons: setupAddons(function () {
      return els.tokenInput.value.trim();
    }),
  };
  const byok = setupByok();

  setupShareConfig(state.bodyFiltersData, authDeps);

  els.authSelect.addEventListener("change", function () {
    syncAuthModeVisibility();
    authDeps.addons.syncTargetWarning();
  });
  els.targetInput.addEventListener("input", function () {
    authDeps.addons.syncTargetWarning();
  });

  setupPresets(els, state, appsPerms, doUpdateVisibility, authDeps, byok);
  setupApps(els, state, appsPerms, showError, hideError, doUpdateVisibility, authDeps.addons);
  setupTtl(els);
  const getLogsConfig = setupLogsTab();
  setupGenerate(els, state.bodyFiltersData, showError, hideError, getLogsConfig, authDeps, byok);
  setupClipboard();
  setupTestScope(state.bodyFiltersData, authDeps);
  setupImportConfig(authDeps);
  setupTabs();

  syncAuthModeVisibility();
  doUpdateVisibility();
})();
