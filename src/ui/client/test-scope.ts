import { assertElement } from "./elements.ts";

interface ParsedScope {
  methods: string[];
  pattern: string;
}

function parseScope(scope: string): ParsedScope {
  const colonIdx = scope.indexOf(":");
  if (colonIdx === -1) {
    return { methods: ["*"], pattern: scope };
  }
  const methodPart = scope.slice(0, colonIdx);
  const pattern = scope.slice(colonIdx + 1);
  const methods = (methodPart.includes("|") ? methodPart.split("|") : [methodPart]).map((m) =>
    m.toUpperCase()
  );
  return { methods, pattern };
}

function matchPath(pattern: string, path: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === path;

  const segments = pattern.split("*");
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (i === 0) {
      if (!path.startsWith(seg)) return false;
      cursor = seg.length;
      continue;
    }

    const remaining = path.slice(cursor);
    if (remaining.length === 0) return false;

    if (i === segments.length - 1 && seg === "") {
      return true;
    }

    const idx = remaining.indexOf(seg);
    if (idx < 1) return false;

    cursor += idx + seg.length;
  }

  if (segments[segments.length - 1] !== "") {
    return cursor === path.length;
  }

  return true;
}

interface ScopeResult {
  raw: string;
  match: boolean;
  bodyMatch?: boolean;
}

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

function highlightScopes(
  method: string,
  path: string,
  scopes: string[],
  resultsContainer: HTMLElement,
): boolean {
  clearElement(resultsContainer);
  if (scopes.length === 0 || path.length === 0) return false;

  const upperMethod = method.toUpperCase();
  let anyMatch = false;

  for (const raw of scopes) {
    const parsed = parseScope(raw);
    const methodMatch = parsed.methods.includes("*") || parsed.methods.includes(upperMethod);
    const pathMatch = matchPath(parsed.pattern, path);
    const match = methodMatch && pathMatch;
    if (match) anyMatch = true;

    resultsContainer.appendChild(createResultRow(match, raw));
  }

  return anyMatch;
}

function renderResults(
  results: ScopeResult[],
  allowed: boolean,
  resultsContainer: HTMLElement,
  verdictSpan: HTMLElement,
  jsonContainer: HTMLElement,
): void {
  clearElement(resultsContainer);

  for (const r of results) {
    let text = r.raw;
    if (r.bodyMatch !== undefined) {
      text += r.bodyMatch ? " (body OK)" : " (body refus\u00e9)";
    }
    resultsContainer.appendChild(createResultRow(r.match, text));
  }

  verdictSpan.textContent = allowed
    ? "Proxy : acc\u00e8s autoris\u00e9"
    : "Proxy : acc\u00e8s refus\u00e9";
  verdictSpan.className = allowed
    ? "text-sm font-medium text-green-600 dark:text-green-400"
    : "text-sm font-medium text-red-600 dark:text-red-400";
}

const METHODS_WITH_BODY = ["POST", "PUT", "PATCH"];

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export function setupTestScope(): void {
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
    const scopes = readScopes(scopesTextarea);
    const path = pathInput.value;
    const anyMatch = highlightScopes(methodSelect.value, path, scopes, resultsContainer);

    jsonContainer.textContent = "";
    jsonContainer.classList.add("hidden");

    if (scopes.length === 0 || path.length === 0) {
      btnTest.disabled = false;
      verdictSpan.textContent = "";
      return;
    }

    if (!anyMatch) {
      btnTest.disabled = true;
      verdictSpan.textContent = "Proxy : acc\u00e8s refus\u00e9 (aucun scope ne matche)";
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

  btnTest.addEventListener("click", async () => {
    const scopes = readScopes(scopesTextarea);
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
