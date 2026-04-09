import type { Elements } from "./elements.ts";

export function setupApps(
  els: Elements,
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
      renderApps(els, apps, updateVisibility);
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
  updateVisibility: () => void,
): void {
  els.appsList.textContent = "";
  apps.forEach(function (name: string) {
    const label = document.createElement("label");
    label.className =
      "flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.className = "rounded border-gray-300 text-fgp-600 focus:ring-fgp-500";
    cb.addEventListener("change", function () {
      updateScopesFromApps(els, updateVisibility);
    });
    const span = document.createElement("span");
    span.textContent = name;
    label.appendChild(cb);
    label.appendChild(span);
    els.appsList.appendChild(label);
  });
  els.appsSection.classList.remove("hidden");
}

function updateScopesFromApps(
  els: Elements,
  updateVisibility: () => void,
): void {
  const checked = els.appsList.querySelectorAll<HTMLInputElement>("input:checked");
  const lines: string[] = [];
  checked.forEach(function (cb) {
    lines.push("GET:/v1/apps/" + cb.value + "/*");
  });
  if (lines.length > 0) {
    lines.unshift("GET:/v1/apps");
  }
  els.scopesTextarea.value = lines.join("\n");
  updateVisibility();
}
