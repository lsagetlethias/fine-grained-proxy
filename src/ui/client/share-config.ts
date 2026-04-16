import {
  decodePublicConfig,
  encodePublicConfig,
  type PublicConfig,
} from "../../crypto/share.ts";

function readCurrentConfig(): PublicConfig | null {
  const target = (document.getElementById("target") as HTMLInputElement | null)?.value ?? "";
  const authSelect = (document.getElementById("auth") as HTMLSelectElement | null)?.value ?? "";
  const authHeaderName =
    (document.getElementById("auth-header-name") as HTMLInputElement | null)?.value ?? "";
  const auth = authSelect === "header:" && authHeaderName
    ? `header:${authHeaderName}`
    : authSelect;
  const scopesRaw = (document.getElementById("scopes") as HTMLTextAreaElement | null)?.value ?? "";
  const scopes = scopesRaw.split("\n").filter((l) => l.trim() !== "");

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

  if (!target && scopes.length === 0) return null;

  return { target, auth, scopes, ttl };
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
    scopesTextarea.value = config.scopes.join("\n");
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
}

async function updateShareUrl(): Promise<void> {
  const config = readCurrentConfig();
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

export function setupShareConfig(): void {
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
      updateShareUrl();
    }, 500);
  }

  const fields = ["target", "auth", "auth-header-name", "scopes", "custom-ttl"];
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
