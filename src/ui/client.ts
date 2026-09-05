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
import { setupDocLinks } from "./client/doc-links.ts";
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
    queryFiltersData: {},
    nextFilterId: 1,
    expandedScopes: {},
  };

  const appsPerms: AppsPermissionsState = {};

  function showError(msg: string): void {
    els.errorBannerMessage.textContent = msg;
    els.errorBanner.classList.remove("hidden");
    setTimeout(function () {
      els.errorBanner.classList.add("hidden");
    }, 8000);
  }

  function hideError(): void {
    els.errorBanner.classList.add("hidden");
  }

  function doUpdateVisibility(prune: boolean = true): void {
    updateBodyFiltersVisibility(
      els.scopesTextarea,
      els.btnAddBodyFilters,
      els.bodyFiltersPanel,
      els.bodyFiltersList,
      els.scopeChips,
      state,
      prune,
    );
  }

  // Pendant la frappe on rafraichit l'affichage sans purger, sinon renommer un scope
  // detruirait ses filtres des la premiere touche. La purge attend que la saisie soit posee.
  els.scopesTextarea.addEventListener("input", function () {
    doUpdateVisibility(false);
  });
  els.scopesTextarea.addEventListener("change", function () {
    doUpdateVisibility(true);
  });

  els.btnAddBodyFilters.addEventListener("click", function () {
    els.bodyFiltersPanel.classList.remove("hidden");
    els.btnAddBodyFilters.setAttribute("aria-expanded", "true");
    doUpdateVisibility();
    els.bodyFiltersPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  els.btnCloseBodyFilters.addEventListener("click", function () {
    els.bodyFiltersPanel.classList.add("hidden");
    els.btnAddBodyFilters.setAttribute("aria-expanded", "false");
  });

  const authDeps: AuthModeDeps = {
    headers: setupAuthHeaders(),
    addons: setupAddons(function () {
      return els.tokenInput.value.trim();
    }),
  };
  const byok = setupByok();

  setupShareConfig(state, authDeps, showError);

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
  setupGenerate(els, state, showError, hideError, getLogsConfig, authDeps, byok);
  setupClipboard();
  setupTestScope(state, authDeps);
  setupImportConfig(authDeps, state);
  setupTabs();
  setupDocLinks();

  syncAuthModeVisibility();
  doUpdateVisibility();
})();
