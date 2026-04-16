interface PublicConfig {
  target: string;
  auth: string;
  scopes: string[];
  ttl: number;
}

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function compressConfig(config: PublicConfig): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(config));
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(json);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const compressed = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }
  return base64UrlEncode(compressed);
}

async function decompressConfig(encoded: string): Promise<PublicConfig> {
  const compressed = base64UrlDecode(encoded);
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(compressed);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const decompressed = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    decompressed.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(decompressed));
}

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

  const encoded = await compressConfig(config);
  const url = new URL(window.location.href);
  url.searchParams.set("c", encoded);
  history.replaceState(null, "", url.toString());
}

export function setupShareConfig(): void {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("c");
  if (encoded) {
    decompressConfig(encoded).then((config) => {
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
