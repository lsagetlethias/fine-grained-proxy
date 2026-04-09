import type { BodyFiltersState } from "./body-filters.ts";
import type { Elements } from "./elements.ts";
import type { AppsPermissionsState, FilterData, SerializedFilterValue } from "./types.ts";
import { defaultAppPermissions } from "./types.ts";

export function setupApps(
  els: Elements,
  state: BodyFiltersState,
  appsPerms: AppsPermissionsState,
  showError: (msg: string) => void,
  hideError: () => void,
  updateVisibility: () => void,
): void {
  els.btnLoadApps.addEventListener("click", async function () {
    const token = els.tokenInput.value.trim();
    if (!token) {
      showError("Veuillez saisir un token.");
      return;
    }

    els.btnLoadApps.disabled = true;
    els.btnLoadApps.textContent = "Chargement\u2026";
    hideError();

    try {
      const res = await fetch("/api/list-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(function () {
          return {} as Record<string, string>;
        });
        throw new Error(errData.message || "Erreur " + res.status);
      }
      const data = await res.json();
      const apps: string[] = data.apps || [];
      renderApps(els, apps, state, appsPerms, updateVisibility);
    } catch (e) {
      showError("Impossible de charger les apps : " + (e as Error).message);
    } finally {
      els.btnLoadApps.disabled = false;
      els.btnLoadApps.textContent = "Charger les apps";
    }
  });
}

function renderApps(
  els: Elements,
  apps: string[],
  state: BodyFiltersState,
  appsPerms: AppsPermissionsState,
  updateVisibility: () => void,
): void {
  els.appsList.textContent = "";

  const keys = Object.keys(appsPerms);
  for (let i = 0; i < keys.length; i++) {
    delete appsPerms[keys[i]];
  }

  apps.forEach(function (name: string) {
    appsPerms[name] = defaultAppPermissions();

    const wrapper = document.createElement("div");
    wrapper.className = "py-1";

    const appLabel = document.createElement("label");
    appLabel.className =
      "flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm font-medium";
    const appCb = document.createElement("input");
    appCb.type = "checkbox";
    appCb.value = name;
    appCb.className = "rounded border-gray-300 text-fgp-600 focus:ring-fgp-500";
    appCb.dataset.appCheckbox = "true";
    const appSpan = document.createElement("span");
    appSpan.textContent = name;
    appLabel.appendChild(appCb);
    appLabel.appendChild(appSpan);
    wrapper.appendChild(appLabel);

    const permsContainer = document.createElement("div");
    permsContainer.className = "ml-8 mt-1 space-y-1 hidden";
    permsContainer.dataset.permsFor = name;

    buildPermissionCheckboxes(permsContainer, name, appsPerms, els, state, updateVisibility);

    wrapper.appendChild(permsContainer);

    appCb.addEventListener("change", function () {
      if (appCb.checked) {
        permsContainer.classList.remove("hidden");
      } else {
        permsContainer.classList.add("hidden");
        resetAppPermissions(appsPerms, name);
        uncheckAllPerms(permsContainer);
      }
      updateScopesFromApps(els, appsPerms, state, updateVisibility);
    });

    els.appsList.appendChild(wrapper);
  });
  els.appsSection.classList.remove("hidden");
}

function buildPermissionCheckboxes(
  container: HTMLElement,
  appName: string,
  appsPerms: AppsPermissionsState,
  els: Elements,
  state: BodyFiltersState,
  updateVisibility: () => void,
): void {
  const perms = appsPerms[appName];

  const readRow = createPermRow("Lecture", "read-" + appName, function (checked) {
    perms.read = checked;
    updateScopesFromApps(els, appsPerms, state, updateVisibility);
  });
  container.appendChild(readRow);

  const deployRow = document.createElement("div");
  deployRow.className = "flex items-center gap-2 flex-wrap";
  const deployCb = createPermCheckbox("Déploiement", "deploy-" + appName, function (checked) {
    perms.deploy = checked;
    branchInput.classList.toggle("hidden", !checked);
    if (!checked) {
      perms.deployBranches = "";
      branchInput.value = "";
    }
    updateScopesFromApps(els, appsPerms, state, updateVisibility);
  });
  deployRow.appendChild(deployCb);
  const branchInput = document.createElement("input");
  branchInput.type = "text";
  branchInput.placeholder = "master, main";
  branchInput.className =
    "hidden rounded-md border border-gray-300 px-2 py-1 text-xs shadow-sm focus:border-fgp-500 focus:ring-1 focus:ring-fgp-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 w-40";
  branchInput.dataset.branches = appName;
  branchInput.addEventListener("input", function () {
    perms.deployBranches = branchInput.value;
    updateScopesFromApps(els, appsPerms, state, updateVisibility);
  });
  deployRow.appendChild(branchInput);
  container.appendChild(deployRow);

  const varsReadCb = createPermCheckbox(
    "Variables (lecture)",
    "vars-read-" + appName,
    function (checked) {
      perms.varsRead = checked;
      updateScopesFromApps(els, appsPerms, state, updateVisibility);
    },
  );
  const varsReadInput = varsReadCb.querySelector("input") as HTMLInputElement;
  varsReadInput.dataset.varsRead = appName;
  container.appendChild(varsReadCb);

  const varsWriteCb = createPermCheckbox(
    "Variables (écriture)",
    "vars-write-" + appName,
    function (checked) {
      perms.varsWrite = checked;
      if (checked) {
        perms.varsRead = true;
        varsReadInput.checked = true;
        varsReadInput.disabled = true;
        varsReadInput.title = "Requis par Variables écriture";
      } else {
        varsReadInput.disabled = false;
        varsReadInput.title = "";
      }
      updateScopesFromApps(els, appsPerms, state, updateVisibility);
    },
  );
  container.appendChild(varsWriteCb);

  const scaleRow = createPermRow(
    "Scale / Restart",
    "scale-" + appName,
    function (checked) {
      perms.scaleRestart = checked;
      updateScopesFromApps(els, appsPerms, state, updateVisibility);
    },
  );
  container.appendChild(scaleRow);
}

function createPermRow(
  label: string,
  id: string,
  onChange: (checked: boolean) => void,
): HTMLElement {
  return createPermCheckbox(label, id, onChange);
}

function createPermCheckbox(
  label: string,
  id: string,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = id;
  cb.className = "rounded border-gray-300 text-fgp-500 focus:ring-fgp-400 h-3.5 w-3.5";
  cb.addEventListener("change", function () {
    onChange(cb.checked);
  });
  const span = document.createElement("span");
  span.textContent = label;
  row.appendChild(cb);
  row.appendChild(span);
  return row;
}

function resetAppPermissions(appsPerms: AppsPermissionsState, appName: string): void {
  appsPerms[appName] = defaultAppPermissions();
}

function uncheckAllPerms(container: HTMLElement): void {
  const inputs = container.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
  inputs.forEach(function (cb) {
    cb.checked = false;
    cb.disabled = false;
    cb.title = "";
  });
  const branchInputs = container.querySelectorAll<HTMLInputElement>("input[type=text]");
  branchInputs.forEach(function (input) {
    input.value = "";
    input.classList.add("hidden");
  });
}

function hasAnyPermission(
  perms: {
    read: boolean;
    deploy: boolean;
    varsRead: boolean;
    varsWrite: boolean;
    scaleRestart: boolean;
  },
): boolean {
  return perms.read || perms.deploy || perms.varsRead || perms.varsWrite || perms.scaleRestart;
}

function parseBranches(raw: string): string[] {
  return raw
    .split(",")
    .map(function (b) {
      return b.trim();
    })
    .filter(Boolean)
    .filter(function (b, i, arr) {
      return arr.indexOf(b) === i;
    });
}

export function updateScopesFromApps(
  els: Elements,
  appsPerms: AppsPermissionsState,
  state: BodyFiltersState,
  updateVisibility: () => void,
): void {
  const checked = els.appsList.querySelectorAll<HTMLInputElement>(
    "input[data-app-checkbox]:checked",
  );

  const scopeLines: string[] = [];
  const newBodyFilters: Record<string, FilterData[]> = {};

  const deployFilterKeys = Object.keys(state.bodyFiltersData).filter(function (k) {
    return k.indexOf("/deployments") !== -1;
  });
  for (let di = 0; di < deployFilterKeys.length; di++) {
    delete state.bodyFiltersData[deployFilterKeys[di]];
  }

  checked.forEach(function (appCb) {
    const appName = appCb.value;
    const perms = appsPerms[appName];
    if (!perms) return;

    if (!hasAnyPermission(perms)) {
      scopeLines.push("GET:/v1/apps/" + appName + "/*");
      return;
    }

    if (perms.read) {
      scopeLines.push("GET:/v1/apps/" + appName);
      scopeLines.push("GET:/v1/apps/" + appName + "/*");
    }

    if (perms.deploy) {
      if (!perms.read) {
        scopeLines.push("GET:/v1/apps/" + appName);
      }
      const branches = parseBranches(perms.deployBranches);
      const deployScope = "POST:/v1/apps/" + appName + "/deployments";
      if (branches.length > 0) {
        const objectValues: SerializedFilterValue[] = branches.map(function (b) {
          if (b.indexOf("*") !== -1) {
            return { type: "stringwildcard" as const, value: b };
          }
          return { type: "any" as const, value: b };
        });
        const filterData: FilterData = {
          id: state.nextFilterId++,
          objectPath: "deployment.git_ref",
          filterType: branches.some(function (b) {
              return b.indexOf("*") !== -1;
            })
            ? "stringwildcard"
            : "any",
          values: branches,
          valueSubTypes: branches.map(function () {
            return "text";
          }),
        };
        newBodyFilters[deployScope] = [filterData];
        state.bodyFiltersData[deployScope] = [filterData];
      } else {
        scopeLines.push(deployScope);
      }
    }

    if (perms.varsRead && !perms.read) {
      scopeLines.push("GET:/v1/apps/" + appName + "/variables");
    } else if (perms.varsRead && perms.read) {
      // covered by GET:/v1/apps/{app}/*
    }

    if (perms.varsWrite) {
      if (!perms.read) {
        scopeLines.push("GET:/v1/apps/" + appName + "/variables");
      }
      scopeLines.push("POST:/v1/apps/" + appName + "/variables");
      scopeLines.push("PUT:/v1/apps/" + appName + "/variables/*");
      scopeLines.push("DELETE:/v1/apps/" + appName + "/variables/*");
    }

    if (perms.scaleRestart) {
      scopeLines.push("POST:/v1/apps/" + appName + "/scale");
      scopeLines.push("POST:/v1/apps/" + appName + "/restart");
      if (!perms.read) {
        scopeLines.push("GET:/v1/apps/" + appName + "/containers");
      }
    }
  });

  if (scopeLines.length > 0 || Object.keys(newBodyFilters).length > 0) {
    scopeLines.unshift("GET:/v1/apps");
  }

  const dedupedLines: string[] = [];
  for (let i = 0; i < scopeLines.length; i++) {
    if (dedupedLines.indexOf(scopeLines[i]) === -1) {
      dedupedLines.push(scopeLines[i]);
    }
  }

  els.scopesTextarea.value = dedupedLines.join("\n");
  updateVisibility();
}
