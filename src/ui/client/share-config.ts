import {
  decodePublicConfig,
  encodePublicConfig,
  type PublicConfig,
} from "../../crypto/share.ts";
import { buildScopes } from "./generate.ts";
import type { FilterData } from "./types.ts";

function readCurrentConfig(bodyFiltersData: Record<string, FilterData[]>): PublicConfig | null {
  const target = (document.getElementById("target") as HTMLInputElement | null)?.value ?? "";
  const authSelect = (document.getElementById("auth") as HTMLSelectElement | null)?.value ?? "";
  const authHeaderName =
    (document.getElementById("auth-header-name") as HTMLInputElement | null)?.value ?? "";
  const auth = authSelect === "header:" && authHeaderName
    ? `header:${authHeaderName}`
    : authSelect;

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  const rawLines = scopesTextarea?.value.split("\n").filter((l) => l.trim() !== "") ?? [];
  const scopes = scopesTextarea ? buildScopes(scopesTextarea, bodyFiltersData) : [];

  const ttlRadio = document.querySelector<HTMLInputElement>("input[name=ttl]:checked");
  let ttl = 86400;
  if (ttlRadio) {
    if (ttlRadio.value === "custom") {
      const customInput = document.getElementById("custom-ttl") as HTMLInputElement | null;
      ttl = customInput ? parseInt(customInput.value, 10) || 0 : 0;
    } else {
      ttl = parseInt(ttlRadio.value, 10) || 0;
    }
  }

  if (!target && rawLines.length === 0) return null;

  const testMethod = (document.getElementById("test-method") as HTMLSelectElement | null)?.value;
  const testPath = (document.getElementById("test-path") as HTMLInputElement | null)?.value;
  const testBody = (document.getElementById("test-body") as HTMLTextAreaElement | null)?.value;

  const test = testPath
    ? { method: testMethod ?? "GET", path: testPath, body: testBody || undefined }
    : undefined;

  return { target, auth, scopes, ttl, test };
}

function scopeToLine(scope: unknown): string {
  if (typeof scope === "string") return scope;
  const entry = scope as { methods?: string[]; pattern?: string };
  if (entry.methods && entry.pattern) {
    return `${entry.methods.join("|")}:${entry.pattern}`;
  }
  return String(scope);
}

function applyConfig(config: PublicConfig): void {
  const targetInput = document.getElementById("target") as HTMLInputElement | null;
  if (targetInput) targetInput.value = config.target;

  const authSelect = document.getElementById("auth") as HTMLSelectElement | null;
  const authHeaderName = document.getElementById("auth-header-name") as HTMLInputElement | null;
  if (authSelect) {
    if (config.auth.startsWith("header:") && config.auth.length > 7) {
      authSelect.value = "header:";
      if (authHeaderName) {
        authHeaderName.value = config.auth.slice(7);
        authHeaderName.classList.remove("hidden");
      }
    } else {
      authSelect.value = config.auth;
      if (authHeaderName) authHeaderName.classList.add("hidden");
    }
    authSelect.dispatchEvent(new Event("change"));
  }

  const scopesTextarea = document.getElementById("scopes") as HTMLTextAreaElement | null;
  if (scopesTextarea) {
    scopesTextarea.value = config.scopes.map(scopeToLine).join("\n");
    scopesTextarea.dispatchEvent(new Event("input"));
  }

  const ttlValue = String(config.ttl);
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

  if (config.test) {
    const testMethod = document.getElementById("test-method") as HTMLSelectElement | null;
    const testPath = document.getElementById("test-path") as HTMLInputElement | null;
    const testBody = document.getElementById("test-body") as HTMLTextAreaElement | null;
    if (testMethod) testMethod.value = config.test.method;
    if (testPath) testPath.value = config.test.path;
    if (testBody && config.test.body) testBody.value = config.test.body;
  }
}

async function updateShareUrl(bodyFiltersData: Record<string, FilterData[]>): Promise<void> {
  const config = readCurrentConfig(bodyFiltersData);
  if (!config) {
    const url = new URL(window.location.href);
    url.searchParams.delete("c");
    history.replaceState(null, "", url.toString());
    return;
  }

  const encoded = await encodePublicConfig(config);
  const url = new URL(window.location.href);
  url.searchParams.set("c", encoded);
  history.replaceState(null, "", url.toString());
}

export function setupShareConfig(bodyFiltersData: Record<string, FilterData[]>): void {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("c");
  if (encoded) {
    decodePublicConfig(encoded).then((config) => {
      applyConfig(config);
    }).catch(() => {
      // noop
    });
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleUpdate(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateShareUrl(bodyFiltersData);
    }, 500);
  }

  const fields = [
    "target", "auth", "auth-header-name", "scopes", "custom-ttl",
    "test-method", "test-path", "test-body",
  ];
  for (const id of fields) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", scheduleUpdate);
      el.addEventListener("change", scheduleUpdate);
    }
  }

  document.querySelectorAll<HTMLInputElement>("input[name=ttl]").forEach((radio) => {
    radio.addEventListener("change", scheduleUpdate);
  });
}
