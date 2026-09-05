import { assertElement } from "./elements.ts";
import { buildScopes } from "./build-scopes.ts";
import { buildAuthPayload } from "./auth-mode.ts";
import type { AuthModeDeps } from "./auth-mode.ts";
import {
  type AccessVerdict,
  checkRequestAccess,
  type QueryDenial,
  type Scope,
  splitPathAndQuery,
} from "../../middleware/scopes.ts";
import type { ScopeFiltersData, SerializedScope } from "./types.ts";

const QUERY_NOTE_INFO_CLASS =
  "flex items-start gap-2 rounded-md border border-l-4 p-2 text-xs border-blue-200 border-l-blue-500 bg-blue-50 text-blue-800 dark:border-blue-700 dark:border-l-blue-500 dark:bg-blue-900/30 dark:text-blue-300";
const QUERY_NOTE_CAUTION_CLASS =
  "flex items-start gap-2 rounded-md border border-l-4 p-2 text-xs border-amber-200 border-l-amber-500 bg-amber-50 text-amber-800 dark:border-amber-700 dark:border-l-amber-500 dark:bg-amber-900/30 dark:text-amber-300";

const NOTE_UNCONSTRAINED =
  "La query n'est pas contrainte par les scopes : tous les param\u00e8tres passent.";

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
  if (scope.queryFilters && scope.queryFilters.length > 0) {
    label += ` [${scope.queryFilters.length} query filter(s)]`;
  }
  return label;
}

function scopePattern(scope: SerializedScope): string {
  if (typeof scope === "string") return scope;
  return `${scope.methods.join("|")}:${scope.pattern}`;
}

// Les quatre causes ne se cumulent jamais : l'evaluation s'arrete au premier probleme, et le
// comptage des occurrences precede toujours l'examen des valeurs. Sans cet ordre, une requete
// dont toutes les valeurs sont correctes se verrait reprocher une valeur (\u00a712.5, \u00a719.2).
function queryDenialText(denial: QueryDenial): string {
  switch (denial.reason) {
    case "undeclared":
      return `Param\u00e8tre "${denial.param}" non d\u00e9clar\u00e9 : refus\u00e9 par d\u00e9faut d\u00e8s qu'un filtre ` +
        "query existe sur ce scope.";
    case "required_missing":
      return `Param\u00e8tre requis "${denial.param}" absent.`;
    case "too_many_occurrences":
      return `Plus de ${denial.cap} occurrences de "${denial.param}" : au-del\u00e0 de cette ` +
        "limite, la requ\u00eate est refus\u00e9e quelles que soient les valeurs. Pour filtrer " +
        "davantage d'occurrences, remplacez une valeur regex par stringwildcard si " +
        "possible : le plafond passe de 4 \u00e0 64.";
    case "value":
      return `Valeur de "${denial.param}" non autoris\u00e9e par ce filtre.`;
  }
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

// Le cas du surnombre d'occurrences ne se lit nulle part dans la configuration de l'auteur,
// contrairement aux trois autres : l'icone le distingue au survol d'une liste de resultats,
// sans jamais porter seule l'information, que le texte suffit a rendre (design \u00a76.3).
function createDetailRow(denial: QueryDenial): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "flex items-start gap-1 pl-5 text-xs text-gray-500 dark:text-gray-400";

  const connector = document.createElement("span");
  connector.setAttribute("aria-hidden", "true");
  connector.textContent = "\u2514";
  row.appendChild(connector);

  if (denial.reason === "too_many_occurrences") {
    const marker = document.createElement("span");
    marker.setAttribute("aria-hidden", "true");
    marker.className = "shrink-0 text-gray-400 dark:text-gray-500";
    marker.textContent = "\u24d8";
    row.appendChild(marker);
  }

  const text = document.createElement("span");
  text.textContent = queryDenialText(denial);
  row.appendChild(text);
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

export function setupTestScope(
  filtersData: ScopeFiltersData,
  authDeps: AuthModeDeps,
): void {
  const methodSelect = assertElement("test-method", HTMLSelectElement);
  const pathInput = assertElement("test-path", HTMLInputElement);
  const bodySection = assertElement("test-body-section", HTMLElement);
  const bodyTextarea = assertElement("test-body", HTMLTextAreaElement);
  const resultsContainer = assertElement("test-scope-results", HTMLElement);
  const btnTest = assertElement("btn-test-scope", HTMLButtonElement);
  const verdictSpan = assertElement("test-scope-verdict", HTMLElement);
  const jsonContainer = assertElement("test-scope-json", HTMLElement);
  const scopesTextarea = assertElement("scopes", HTMLTextAreaElement);
  const queryNote = assertElement("test-query-note", HTMLElement);
  const badge = document.getElementById("test-scope-badge");

  const queryNoteText = assertElement("test-query-note-text", HTMLElement);
  const queryNoteIconInfo = assertElement("test-query-note-icon-info", HTMLElement);
  const queryNoteIconCaution = assertElement("test-query-note-icon-caution", HTMLElement);

  // Trois etats, jamais deux. Afficher « contrainte » a cote d'un verdict « autorise » alors
  // que le scope qui a matche ne regarde rien dirait a l'auteur que sa query a ete validee
  // quand elle est passee sans controle : le mensonge permissif que ce module supprime
  // (§12.5, challenge testeur T2).
  function updateQueryNote(verdict: AccessVerdict | null, scopes: SerializedScope[]): void {
    const [, rawSearch] = splitPathAndQuery(pathInput.value);
    if (rawSearch.length === 0 || !verdict) {
      queryNote.hidden = true;
      return;
    }

    if (!verdict.queryConstrained && !verdict.queryConstrainedElsewhere) {
      setQueryNote(NOTE_UNCONSTRAINED, false);
      return;
    }

    // Sur un refus global il n'y a aucun scope accordant l'acces a nommer, et le detail par
    // scope porte deja une information plus precise qu'une note generique.
    if (!verdict.allowed || verdict.grantedBy === undefined) {
      queryNote.hidden = true;
      return;
    }

    const label = scopePattern(scopes[verdict.grantedBy]);
    if (verdict.queryConstrained) {
      setQueryNote(`La query est contrainte par le scope qui vous autorise : ${label}.`, false);
      return;
    }
    setQueryNote(
      `Autorisé par un scope qui ne contraint pas la query : ${label}. D'autres scopes ` +
        "de ce blob contraignent ce chemin, mais ce n'est pas celui qui a matché en premier.",
      true,
    );
  }

  // L'icone est decorative et sa couleur vient de la classe du bloc parent : la gravite tient
  // au texte seul, l'icone ne fait que suivre la rampe (§12.13).
  function setQueryNote(text: string, caution: boolean): void {
    queryNote.hidden = false;
    queryNote.className = caution ? QUERY_NOTE_CAUTION_CLASS : QUERY_NOTE_INFO_CLASS;
    queryNoteText.textContent = text;
    queryNoteIconInfo.hidden = caution;
    queryNoteIconCaution.hidden = !caution;
  }

  function updateBadge(): void {
    if (!badge) return;
    const path = pathInput.value.trim();
    if (path) {
      badge.textContent = `${methodSelect.value} ${path}`;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  function toggleBodySection(): void {
    const show = METHODS_WITH_BODY.includes(methodSelect.value);
    bodySection.classList.toggle("hidden", !show);
  }

  function doHighlight(): void {
    updateBadge();
    const rawScopes = readScopes(scopesTextarea);
    const method = methodSelect.value;
    const path = pathInput.value;

    jsonContainer.textContent = "";
    jsonContainer.classList.add("hidden");
    updateQueryNote(null, []);

    if (rawScopes.length === 0 || path.length === 0) {
      clearElement(resultsContainer);
      btnTest.disabled = false;
      verdictSpan.textContent = "";
      return;
    }

    const built = buildScopes(scopesTextarea.value, filtersData);
    // Tester un jeu de scopes ampute d'un filtre incomplet ferait afficher un verdict qui
    // ne correspond a aucun token generable : on nomme la saisie fautive et on s'arrete.
    if (built.errors.length > 0) {
      clearElement(resultsContainer);
      btnTest.disabled = true;
      verdictSpan.textContent = built.errors[0];
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }
    const scopes = built.scopes;
    const body = parseTestBody(bodyTextarea, method);

    clearElement(resultsContainer);

    // Une seule lecture des scopes, la meme que celle du proxy : c'est ce qui empeche
    // l'interface d'affirmer un refus la ou la production repond 200 (ADR-0009 §4). Le
    // verdict global se lit sur le jeu complet, exactement comme le proxy le calcule ; les
    // lignes par scope, elles, demandent un verdict par scope pour porter leur diagnostic.
    const global = checkRequestAccess(scopes as Scope[], method.toUpperCase(), path, body);

    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i] as Scope;
      const verdict = checkRequestAccess([scope], method.toUpperCase(), path, body);
      resultsContainer.appendChild(createResultRow(verdict.allowed, scopeLabel(scopes[i])));
      if (!verdict.allowed && verdict.denial?.axis === "query" && verdict.denial.query) {
        resultsContainer.appendChild(createDetailRow(verdict.denial.query));
      }
    }

    updateQueryNote(global, scopes);

    if (!global.allowed) {
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
    const built = buildScopes(scopesTextarea.value, filtersData);
    if (built.errors.length > 0) {
      verdictSpan.textContent = built.errors[0];
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }
    const scopes = built.scopes;
    const method = methodSelect.value;
    const path = pathInput.value;
    const tokenInput = document.getElementById("token") as HTMLInputElement | null;
    const targetInput = document.getElementById("target") as HTMLInputElement | null;
    const authSelect = document.getElementById("auth") as HTMLSelectElement | null;

    if (scopes.length === 0 || path.length === 0) return;

    const authResult = buildAuthPayload(authDeps);
    if (!authResult.ok) {
      verdictSpan.textContent = authResult.message;
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }
    if (!targetInput?.value || !authSelect?.value) {
      verdictSpan.textContent = "URL cible et mode d'auth requis";
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }
    if (authResult.requiresToken && !tokenInput?.value) {
      verdictSpan.textContent = "Token requis";
      verdictSpan.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }

    const payload: Record<string, unknown> = {
      method,
      path,
      scopes,
      target: targetInput.value,
      auth: authResult.auth,
    };
    if (authResult.requiresToken && tokenInput) payload.token = tokenInput.value;

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
      } else if (data.reason === "auth_addon_failed") {
        verdictSpan.textContent = "Proxy : \u00e9chec auth (token de base de donn\u00e9es)";
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
