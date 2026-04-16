import { assertElement } from "./elements.ts";
import { buildScopes } from "./generate.ts";
import { checkAccess, type Scope } from "../../middleware/scopes.ts";
import type { FilterData, SerializedScope } from "./types.ts";

function clearElement(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function readScopes(scopesTextarea: HTMLTextAreaElement): string[] {
  return scopesTextarea.value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function scopeLabel(scope: SerializedScope): string {
  if (typeof scope === "string") return scope;
  const methods = scope.methods.join("|");
  let label = `${methods}:${scope.pattern}`;
  if (scope.bodyFilters && scope.bodyFilters.length > 0) {
    label += ` [${scope.bodyFilters.length} body filter(s)]`;
  }
  return label;
}

function createResultRow(match: boolean, text: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "flex items-center gap-2 text-xs font-mono";

  const icon = document.createElement("span");
  icon.className = match ? "text-green-500" : "text-red-400";
  icon.textContent = match ? "\u2713" : "\u2717";
  icon.setAttribute("role", "img");
  icon.setAttribute("aria-label", match ? "Scope autoris\u00e9" : "Scope refus\u00e9");

  const label = document.createElement("span");
  label.textContent = text;

  row.appendChild(icon);
  row.appendChild(label);
  return row;
}

const METHODS_WITH_BODY = ["POST", "PUT", "PATCH"];

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function parseTestBody(bodyTextarea: HTMLTextAreaElement, method: string): unknown {
  const bodyValue = bodyTextarea.value.trim();
  if (bodyValue.length === 0 || !METHODS_WITH_BODY.includes(method)) return undefined;
  try {
    return JSON.parse(bodyValue);
  } catch {
    return undefined;
  }
}

export function setupTestScope(bodyFiltersData: Record<string, FilterData[]>): void {
  const methodSelect = assertElement("test-method", HTMLSelectElement);
  const pathInput = assertElement("test-path", HTMLInputElement);
  const bodySection = assertElement("test-body-section", HTMLElement);
  const bodyTextarea = assertElement("test-body", HTMLTextAreaElement);
  const resultsContainer = assertElement("test-scope-results", HTMLElement);
  const btnTest = assertElement("btn-test-scope", HTMLButtonElement);
  const verdictSpan = assertElement("test-scope-verdict", HTMLElement);
  const jsonContainer = assertElement("test-scope-json", HTMLElement);
  const scopesTextarea = assertElement("scopes", HTMLTextAreaElement);

  function toggleBodySection(): void {
    const show = METHODS_WITH_BODY.includes(methodSelect.value);
    bodySection.classList.toggle("hidden", !show);
  }

  function doHighlight(): void {
    const rawScopes = readScopes(scopesTextarea);
    const method = methodSelect.value;
    const path = pathInput.value;

    jsonContainer.textContent = "";
    jsonContainer.classList.add("hidden");

    if (rawScopes.length === 0 || path.length === 0) {
      clearElement(resultsContainer);
      btnTest.disabled = false;
      verdictSpan.textContent = "";
      return;
    }

    const scopes = buildScopes(scopesTextarea, bodyFiltersData);
    const body = parseTestBody(bodyTextarea, method);

    clearElement(resultsContainer);
    let anyMatch = false;

    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i] as Scope;
      const matched = checkAccess([scope], method.toUpperCase(), path, body);
      if (matched) anyMatch = true;
      resultsContainer.appendChild(createResultRow(matched, scopeLabel(scopes[i])));
    }

    if (!anyMatch) {
      btnTest.disabled = true;
      verdictSpan.textContent = "Proxy : acc\u00e8s refus\u00e9";
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
    } else {
      btnTest.disabled = false;
      verdictSpan.textContent = "";
    }
  }

  const debouncedHighlight = debounce(doHighlight, 150);

  methodSelect.addEventListener("change", () => {
    toggleBodySection();
    debouncedHighlight();
  });
  pathInput.addEventListener("input", debouncedHighlight);
  scopesTextarea.addEventListener("input", debouncedHighlight);
  bodyTextarea.addEventListener("input", debouncedHighlight);

  btnTest.addEventListener("click", async () => {
    const scopes = buildScopes(scopesTextarea, bodyFiltersData);
    const method = methodSelect.value;
    const path = pathInput.value;
    const tokenInput = document.getElementById("token") as HTMLInputElement | null;
    const targetInput = document.getElementById("target") as HTMLInputElement | null;
    const authSelect = document.getElementById("auth") as HTMLSelectElement | null;

    if (scopes.length === 0 || path.length === 0) return;
    if (!tokenInput?.value || !targetInput?.value || !authSelect?.value) {
      verdictSpan.textContent = "Token, URL cible et mode d'auth requis";
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }

    let auth = authSelect.value;
    if (auth === "header:") {
      const headerName = document.getElementById("auth-header-name") as HTMLInputElement | null;
      if (!headerName?.value) {
        verdictSpan.textContent = "Nom du header requis";
        verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
        return;
      }
      auth = "header:" + headerName.value;
    }

    const payload: Record<string, unknown> = {
      method,
      path,
      scopes,
      token: tokenInput.value,
      target: targetInput.value,
      auth,
    };

    const bodyValue = bodyTextarea.value.trim();
    if (bodyValue.length > 0 && METHODS_WITH_BODY.includes(method)) {
      try {
        payload.body = JSON.parse(bodyValue);
      } catch {
        verdictSpan.textContent = "Body JSON invalide";
        verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
        return;
      }
    }

    btnTest.disabled = true;
    btnTest.textContent = "Test\u2026";
    jsonContainer.textContent = "";
    jsonContainer.classList.add("hidden");

    try {
      const res = await fetch("/api/test-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        verdictSpan.textContent = `Erreur ${res.status}`;
        verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
        return;
      }

      const data = await res.json() as {
        allowed: boolean;
        reason?: string;
        upstream?: { status: number; body: unknown };
      };

      if (!data.allowed) {
        verdictSpan.textContent = "Proxy : acc\u00e8s refus\u00e9 (scope)";
        verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      } else if (data.reason === "auth_exchange_failed") {
        verdictSpan.textContent = "Proxy : \u00e9chec auth (token exchange)";
        verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      } else if (data.reason === "upstream_unreachable") {
        verdictSpan.textContent = "API cible injoignable";
        verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      } else if (data.upstream) {
        const ok = data.upstream.status >= 200 && data.upstream.status < 400;
        verdictSpan.textContent = `API cible : ${data.upstream.status}`;
        verdictSpan.className = ok
          ? "text-sm font-medium text-green-600 dark:text-green-400"
          : "text-sm font-medium text-red-600 dark:text-red-400";
        jsonContainer.textContent = JSON.stringify(data.upstream.body, null, 2);
        jsonContainer.classList.remove("hidden");
      }
    } catch {
      verdictSpan.textContent = "Erreur r\u00e9seau";
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
    } finally {
      btnTest.disabled = false;
      btnTest.textContent = "Tester";
    }
  });

  toggleBodySection();
}
