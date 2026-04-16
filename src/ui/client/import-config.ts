import { assertElement } from "./elements.ts";

interface DecodeResponse {
  target: string;
  auth: string;
  scopes: unknown[];
  ttl: number;
  createdAt: number;
  version: number;
  tokenRedacted: string;
}

interface ScopeEntry {
  methods: string[];
  pattern: string;
  bodyFilters?: unknown[];
}

function extractBlob(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) return segments[0];
  } catch {
    // not a URL, treat as raw blob
  }
  return trimmed;
}

function scopeToString(scope: unknown): string {
  if (typeof scope === "string") return scope;
  const entry = scope as ScopeEntry;
  const methods = entry.methods.join("|");
  return `${methods}:${entry.pattern}`;
}

function applyDecodedConfig(data: DecodeResponse): void {
  const targetInput = document.getElementById("target") as HTMLInputElement | null;
  if (targetInput) targetInput.value = data.target;

  const authSelect = document.getElementById("auth") as HTMLSelectElement | null;
  const authHeaderName = document.getElementById("auth-header-name") as HTMLInputElement | null;
  if (authSelect) {
    if (data.auth.startsWith("header:") && data.auth.length > 7) {
      authSelect.value = "header:";
      if (authHeaderName) {
        authHeaderName.value = data.auth.slice(7);
        authHeaderName.classList.remove("hidden");
      }
    } else {
      authSelect.value = data.auth;
      if (authHeaderName) authHeaderName.classList.add("hidden");
    }
    authSelect.dispatchEvent(new Event("change"));
  }

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  if (scopesTextarea) {
    scopesTextarea.value = data.scopes.map(scopeToString).join("\n");
    scopesTextarea.dispatchEvent(new Event("input"));
  }

  const tokenInput = document.getElementById("token") as HTMLInputElement | null;
  if (tokenInput) tokenInput.value = "";

  const ttlValue = String(data.ttl);
  const ttlRadios = document.querySelectorAll<HTMLInputElement>("input[name=ttl]");
  let matched = false;
  ttlRadios.forEach((radio) => {
    if (radio.value === ttlValue) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change"));
      matched = true;
    }
  });
  if (!matched) {
    const customRadio = document.querySelector<HTMLInputElement>("input[name=ttl][value=custom]");
    if (customRadio) {
      customRadio.checked = true;
      customRadio.dispatchEvent(new Event("change"));
      const customInput = document.getElementById("custom-ttl") as HTMLInputElement | null;
      if (customInput) customInput.value = ttlValue;
    }
  }
}

export function setupImportConfig(): void {
  const importBlobInput = assertElement("import-blob", HTMLInputElement);
  const importKeyInput = assertElement("import-key", HTMLInputElement);
  const btnDecode = assertElement("btn-import-decode", HTMLButtonElement);
  const importStatus = assertElement("import-status", HTMLElement);

  btnDecode.addEventListener("click", async () => {
    const blobRaw = importBlobInput.value;
    const key = importKeyInput.value.trim();

    if (!blobRaw || !key) {
      importStatus.textContent = "Blob et cl\u00e9 requis";
      importStatus.className = "text-sm font-medium text-red-600 dark:text-red-400";
      return;
    }

    const blob = extractBlob(blobRaw);

    btnDecode.disabled = true;
    btnDecode.textContent = "D\u00e9codage\u2026";
    importStatus.textContent = "";

    try {
      const res = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blob, key }),
      });

      if (!res.ok) {
        const err = await res.json() as { message?: string };
        importStatus.textContent = err.message ?? `Erreur ${res.status}`;
        importStatus.className = "text-sm font-medium text-red-600 dark:text-red-400";
        return;
      }

      const data = await res.json() as DecodeResponse;
      applyDecodedConfig(data);

      importStatus.textContent =
        `Config import\u00e9e \u2014 token: ${data.tokenRedacted} (fournir le token pour g\u00e9n\u00e9rer/tester)`;
      importStatus.className = "text-sm font-medium text-green-600 dark:text-green-400";
    } catch {
      importStatus.textContent = "Erreur r\u00e9seau";
      importStatus.className = "text-sm font-medium text-red-600 dark:text-red-400";
    } finally {
      btnDecode.disabled = false;
      btnDecode.textContent = "D\u00e9coder";
    }
  });
}
