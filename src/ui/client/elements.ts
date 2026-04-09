export function assertElement<T extends HTMLElement>(
  id: string,
  ctor: new (...args: never[]) => T,
): T {
  const el = document.getElementById(id);
  if (!el || !(el instanceof ctor)) {
    throw new Error(`Element #${id} not found or wrong type`);
  }
  return el;
}

export function getElements() {
  return {
    targetInput: assertElement("target", HTMLInputElement),
    authSelect: assertElement("auth", HTMLSelectElement),
    authHeaderName: assertElement("auth-header-name", HTMLInputElement),
    tokenInput: assertElement("token", HTMLInputElement),
    btnLoadApps: assertElement("btn-load-apps", HTMLButtonElement),
    appsSection: assertElement("apps-section", HTMLElement),
    appsList: assertElement("apps-list", HTMLElement),
    scopesTextarea: assertElement("scopes", HTMLTextAreaElement),
    resultSection: assertElement("result-section", HTMLElement),
    errorBanner: assertElement("error-banner", HTMLElement),
    customTtlWrapper: assertElement("custom-ttl-wrapper", HTMLElement),
    ttlWarning: assertElement("ttl-warning", HTMLElement),
    scopeChips: assertElement("scope-chips", HTMLElement),
    btnAddBodyFilters: assertElement("btn-add-body-filters", HTMLButtonElement),
    bodyFiltersPanel: assertElement("body-filters-panel", HTMLElement),
    bodyFiltersList: assertElement("body-filters-list", HTMLElement),
    btnCloseBodyFilters: assertElement("btn-close-body-filters", HTMLButtonElement),
  };
}

export type Elements = ReturnType<typeof getElements>;
