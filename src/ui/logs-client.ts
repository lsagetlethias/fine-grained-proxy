(function () {
  "use strict";

  const MAX_NETWORK_ITEMS = 200;
  const MAX_DETAILED_ITEMS = 50;
  const MAX_RECONNECTS = 3;
  const RECONNECT_DELAYS = [1000, 3000, 10_000];
  const ANNOUNCE_INTERVAL_MS = 2000;

  type NetworkEntry = {
    type: "network";
    ts: number;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    ipPrefix: string;
  };

  type DetailedEntry =
    | {
      type: "detailed";
      ts: number;
      method: string;
      path: string;
      truncated: false;
      bodyEncrypted: string;
    }
    | {
      type: "detailed";
      ts: number;
      method: string;
      path: string;
      truncated: true;
    };

  type LogEntry = NetworkEntry | DetailedEntry;

  const STORAGE_BLOB = "fgp-logs-blob";
  const STORAGE_KEY = "fgp-logs-key";

  function qs<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) throw new Error("missing element: " + id);
    return el as T;
  }

  const authState = qs<HTMLElement>("logs-auth-state");
  const streamState = qs<HTMLElement>("logs-stream-state");
  const errorState = qs<HTMLElement>("logs-error-state");
  const form = qs<HTMLFormElement>("logs-auth-form");
  const blobInput = qs<HTMLInputElement>("logs-blob");
  const keyInput = qs<HTMLInputElement>("logs-key");
  const keyToggleBtn = qs<HTMLButtonElement>("logs-key-toggle");
  const connectBtn = qs<HTMLButtonElement>("logs-connect");
  const authStatus = qs<HTMLElement>("logs-auth-status");
  const statusBadge = qs<HTMLElement>("logs-status");
  const statusDot = qs<HTMLElement>("logs-status-dot");
  const statusLabel = qs<HTMLElement>("logs-status-label");
  const disconnectBtn = qs<HTMLButtonElement>("logs-disconnect");
  const retryBtn = qs<HTMLButtonElement>("logs-retry");
  const backBtn = qs<HTMLButtonElement>("logs-back-to-form");
  const errMessage = qs<HTMLElement>("logs-error-message");
  const blobIdEl = qs<HTMLElement>("logs-blob-id");
  const blobNameEl = qs<HTMLElement>("logs-blob-name");
  const blobSeparatorEl = qs<HTMLElement>("logs-blob-separator");
  const announceEl = qs<HTMLElement>("logs-announce");
  const networkList = qs<HTMLUListElement>("logs-network-list");
  const networkEmpty = qs<HTMLElement>("logs-network-empty");
  const detailedList = qs<HTMLUListElement>("logs-detailed-list");
  const detailedCount = qs<HTMLElement>("logs-detailed-count");
  const resumeScrollBtn = qs<HTMLButtonElement>("logs-resume-scroll");

  let abortController: AbortController | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: number | undefined;
  let lastTs = 0;
  let derivedKey: CryptoKey | null = null;
  let saltCache: string | null = null;
  let announcePending = 0;
  let announceTimer: number | undefined;
  let autoScroll = true;
  let detailedEnabledForBlob = false;

  keyToggleBtn.addEventListener("click", () => {
    keyInput.type = keyInput.type === "password" ? "text" : "password";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const blob = blobInput.value.trim();
    const key = keyInput.value.trim();
    if (!blob || !key) return;
    connect(blob, key).catch(() => {});
  });

  disconnectBtn.addEventListener("click", () => {
    handleDisconnect();
  });

  backBtn.addEventListener("click", () => {
    handleDisconnect();
  });

  retryBtn.addEventListener("click", () => {
    const blob = sessionStorage.getItem(STORAGE_BLOB);
    const key = sessionStorage.getItem(STORAGE_KEY);
    if (!blob || !key) {
      handleDisconnect();
      return;
    }
    showState("auth");
    connect(blob, key).catch(() => {});
  });

  resumeScrollBtn.addEventListener("click", () => {
    autoScroll = true;
    networkList.scrollTop = 0;
    resumeScrollBtn.hidden = true;
  });

  networkList.addEventListener("scroll", () => {
    if (networkList.scrollTop > 4) {
      autoScroll = false;
      resumeScrollBtn.hidden = false;
    } else {
      autoScroll = true;
      resumeScrollBtn.hidden = true;
    }
  });

  bootstrap();

  function bootstrap(): void {
    const blob = sessionStorage.getItem(STORAGE_BLOB);
    const key = sessionStorage.getItem(STORAGE_KEY);
    if (blob && key) {
      blobInput.value = blob;
      keyInput.value = key;
      connect(blob, key).catch(() => {});
    }
  }

  async function connect(blob: string, key: string): Promise<void> {
    connectBtn.disabled = true;
    authStatus.textContent = "Connexion en cours...";
    clearError();
    clearTimeouts();
    reconnectAttempts = 0;
    lastTs = 0;
    derivedKey = null;
    clearLists();

    sessionStorage.setItem(STORAGE_BLOB, blob);
    sessionStorage.setItem(STORAGE_KEY, key);

    const blobId = await sha256Hex16(blob);
    try {
      const salt = await fetchSalt();
      derivedKey = await deriveAesKey(key, salt);
    } catch {
      showError("Salt indisponible. Réessayez plus tard.", false);
      return;
    }

    const config = await tryDecryptLocalBlob(blob, key);
    detailedEnabledForBlob = config?.logs?.detailed === true;
    setHeader(config?.name, blobId);
    setDetailedDisabledNotice(!detailedEnabledForBlob);

    await openStream(blob, key, blobId, undefined);
  }

  async function openStream(
    blob: string,
    key: string,
    blobId: string,
    since: number | undefined,
  ): Promise<void> {
    abortController = new AbortController();

    const url = since !== undefined ? `/logs/stream?since=${since}` : "/logs/stream";

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          "X-FGP-Blob": blob,
          "X-FGP-Key": key,
          "Accept": "text/event-stream",
        },
        signal: abortController.signal,
      });
    } catch (_e) {
      scheduleReconnect(blob, key, blobId);
      return;
    }

    if (!response.ok) {
      await handleErrorResponse(response);
      return;
    }

    if (!response.body) {
      showError("Flux de logs vide — déconnecté.", false);
      return;
    }

    showState("stream");
    setStatus("connected");
    connectBtn.disabled = false;
    authStatus.textContent = "";
    reconnectAttempts = 0;

    await readSse(response.body, blob, key, blobId);
  }

  async function readSse(
    body: ReadableStream<Uint8Array>,
    blob: string,
    key: string,
    blobId: string,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          handleSseBlock(raw);
        }
      }
      scheduleReconnect(blob, key, blobId);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      scheduleReconnect(blob, key, blobId);
    }
  }

  function handleSseBlock(raw: string): void {
    const lines = raw.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (event === "ping") return;
    if (event === "log" && data) {
      try {
        const entry = JSON.parse(data) as LogEntry;
        if (typeof entry.ts === "number" && entry.ts > lastTs) lastTs = entry.ts;
        renderEntry(entry);
        scheduleAnnounce();
      } catch {
        // skip
      }
    }
  }

  function scheduleReconnect(blob: string, key: string, blobId: string): void {
    if (reconnectAttempts >= MAX_RECONNECTS) {
      showError("Connexion perdue. Cliquez sur Réessayer.", true);
      return;
    }
    const delay = RECONNECT_DELAYS[reconnectAttempts] ?? 10_000;
    reconnectAttempts++;
    setStatus("reconnecting");
    reconnectTimer = setTimeout(() => {
      openStream(blob, key, blobId, lastTs > 0 ? lastTs : undefined).catch(() => {});
    }, delay) as unknown as number;
  }

  async function handleErrorResponse(response: Response): Promise<void> {
    let code = "unknown";
    try {
      const body = await response.json();
      if (typeof body.error === "string") code = body.error;
    } catch {
      // no json
    }

    const { message, retryable } = mapError(response.status, code);
    showError(message, retryable);
  }

  function mapError(status: number, code: string): { message: string; retryable: boolean } {
    if (status === 400 && code === "invalid_request") {
      return { message: "Paramètre de reconnexion invalide.", retryable: false };
    }
    if (status === 401) {
      return { message: "Blob ou clé invalide — impossible de déchiffrer.", retryable: false };
    }
    if (status === 403 && code === "logs_not_enabled") {
      return {
        message:
          "Les logs ne sont pas activés pour ce blob. Activez-les dans la configuration avant de réessayer.",
        retryable: false,
      };
    }
    if (status === 404) {
      return { message: "Les logs sont désactivés sur cette instance.", retryable: false };
    }
    if (status === 409) {
      return {
        message:
          "Un flux de logs est déjà actif pour ce blob. Fermez l'autre onglet avant de réessayer.",
        retryable: true,
      };
    }
    if (status === 410) {
      return { message: "Ce blob est expiré.", retryable: false };
    }
    return { message: `Erreur ${status} ${code}`, retryable: false };
  }

  function showError(message: string, retryable: boolean): void {
    clearTimeouts();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    errMessage.textContent = message;
    retryBtn.hidden = !retryable;
    showState("error");
    connectBtn.disabled = false;
    authStatus.textContent = message;
  }

  function clearError(): void {
    errMessage.textContent = "";
    retryBtn.hidden = true;
  }

  function showState(state: "auth" | "stream" | "error"): void {
    authState.hidden = state !== "auth";
    streamState.hidden = state !== "stream";
    errorState.hidden = state !== "error";
  }

  function setStatus(state: "connected" | "reconnecting" | "error"): void {
    statusBadge.classList.remove(
      "bg-green-50",
      "text-green-700",
      "dark:bg-green-900/30",
      "dark:text-green-400",
      "bg-amber-50",
      "text-amber-700",
      "dark:bg-amber-900/30",
      "dark:text-amber-400",
      "bg-red-50",
      "text-red-700",
      "dark:bg-red-900/30",
      "dark:text-red-400",
    );
    statusDot.classList.remove(
      "bg-green-500",
      "dark:bg-green-400",
      "bg-amber-500",
      "bg-red-500",
      "animate-pulse",
    );
    if (state === "connected") {
      statusBadge.classList.add(
        "bg-green-50",
        "text-green-700",
        "dark:bg-green-900/30",
        "dark:text-green-400",
      );
      statusDot.classList.add("bg-green-500", "dark:bg-green-400");
      statusLabel.textContent = "Connecté";
    } else if (state === "reconnecting") {
      statusBadge.classList.add(
        "bg-amber-50",
        "text-amber-700",
        "dark:bg-amber-900/30",
        "dark:text-amber-400",
      );
      statusDot.classList.add("bg-amber-500", "animate-pulse");
      statusLabel.textContent = "Reconnexion...";
    } else {
      statusBadge.classList.add(
        "bg-red-50",
        "text-red-700",
        "dark:bg-red-900/30",
        "dark:text-red-400",
      );
      statusDot.classList.add("bg-red-500");
      statusLabel.textContent = "Erreur";
    }
  }

  function handleDisconnect(): void {
    clearTimeouts();
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    sessionStorage.removeItem(STORAGE_BLOB);
    sessionStorage.removeItem(STORAGE_KEY);
    blobInput.value = "";
    keyInput.value = "";
    derivedKey = null;
    clearLists();
    clearError();
    authStatus.textContent = "";
    showState("auth");
  }

  function clearTimeouts(): void {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    if (announceTimer !== undefined) {
      clearTimeout(announceTimer);
      announceTimer = undefined;
    }
    announcePending = 0;
  }

  function clearLists(): void {
    networkList.replaceChildren();
    networkList.hidden = true;
    networkEmpty.hidden = false;
    detailedList.replaceChildren();
    detailedCount.textContent = "0";
  }

  function setHeader(name: string | undefined, blobId: string): void {
    const short = blobId.slice(0, 8);
    blobIdEl.textContent = short;
    blobIdEl.setAttribute("title", blobId);
    const hasName = !!(name && name.trim().length > 0);
    if (hasName) {
      blobNameEl.textContent = name!;
      blobNameEl.hidden = false;
    } else {
      blobNameEl.textContent = "";
      blobNameEl.hidden = true;
    }
    blobSeparatorEl.hidden = !hasName;
  }

  function setDetailedDisabledNotice(disabled: boolean): void {
    const notice = document.getElementById("logs-detailed-disabled");
    if (notice) notice.hidden = !disabled;
  }

  function renderEntry(entry: LogEntry): void {
    if (entry.type === "network") {
      renderNetwork(entry);
    } else {
      renderDetailed(entry).catch(() => {});
    }
  }

  function renderNetwork(entry: NetworkEntry): void {
    networkEmpty.hidden = true;
    networkList.hidden = false;

    const li = document.createElement("li");
    li.className = "px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/70";
    li.setAttribute("aria-hidden", "true");

    const row1 = document.createElement("div");
    row1.className = "flex items-center gap-3 text-xs";
    const timeEl = document.createElement("time");
    timeEl.className = "font-mono text-gray-500 dark:text-gray-400 shrink-0";
    timeEl.textContent = formatTime(entry.ts);
    const methodEl = document.createElement("span");
    methodEl.className =
      "inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200";
    methodEl.textContent = entry.method;
    const pathEl = document.createElement("span");
    pathEl.className = "font-mono text-gray-900 dark:text-gray-100 truncate";
    pathEl.textContent = entry.path;
    pathEl.setAttribute("title", entry.path);
    row1.append(timeEl, methodEl, pathEl);

    const row2 = document.createElement("div");
    row2.className = "mt-1 flex items-center gap-3 text-xs pl-20";
    const statusEl = document.createElement("span");
    statusEl.className = "inline-flex items-center rounded px-1.5 py-0.5 font-mono font-medium " +
      statusColor(entry.status);
    statusEl.textContent = String(entry.status);
    const durEl = document.createElement("span");
    durEl.className = "text-gray-500 dark:text-gray-400";
    durEl.textContent = entry.durationMs + "ms";
    const ipEl = document.createElement("span");
    ipEl.className = "text-gray-400 dark:text-gray-500 font-mono";
    ipEl.textContent = entry.ipPrefix;
    row2.append(statusEl, durEl, ipEl);

    li.append(row1, row2);

    networkList.prepend(li);
    while (networkList.childElementCount > MAX_NETWORK_ITEMS) {
      networkList.lastElementChild?.remove();
    }

    if (autoScroll) networkList.scrollTop = 0;
  }

  async function renderDetailed(entry: DetailedEntry): Promise<void> {
    const li = document.createElement("li");
    li.className = "px-4 py-3 space-y-2";
    li.setAttribute("aria-hidden", "true");

    const row1 = document.createElement("div");
    row1.className = "flex items-center gap-3 text-xs";
    const timeEl = document.createElement("time");
    timeEl.className = "font-mono text-gray-500 dark:text-gray-400";
    timeEl.textContent = formatTime(entry.ts);
    const methodEl = document.createElement("span");
    methodEl.className = "font-mono font-medium text-fgp-700 dark:text-fgp-400";
    methodEl.textContent = entry.method;
    const pathEl = document.createElement("span");
    pathEl.className = "font-mono text-gray-900 dark:text-gray-100 truncate";
    pathEl.textContent = entry.path;
    pathEl.setAttribute("title", entry.path);
    row1.append(timeEl, methodEl, pathEl);
    li.append(row1);

    if (entry.truncated) {
      const note = document.createElement("div");
      note.className =
        "rounded-md border border-dashed border-gray-300 p-3 text-xs italic text-gray-500 dark:border-gray-600 dark:text-gray-400";
      note.textContent = "Body trop volumineux — non stocké";
      li.append(note);
    } else {
      try {
        if (!derivedKey) throw new Error("no-key");
        const plain = await decryptDetailed(entry.bodyEncrypted, derivedKey);
        const pre = document.createElement("pre");
        pre.className =
          "rounded-md bg-gray-100 dark:bg-gray-800/80 p-3 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre";
        pre.textContent = prettyJson(plain);
        li.append(pre);
      } catch {
        const err = document.createElement("div");
        err.className =
          "rounded-md border border-dashed border-red-300 p-3 text-xs italic text-red-700 dark:border-red-800 dark:text-red-400";
        err.textContent = "Déchiffrement impossible — vérifiez votre clé";
        li.append(err);
      }
    }

    detailedList.prepend(li);
    while (detailedList.childElementCount > MAX_DETAILED_ITEMS) {
      detailedList.lastElementChild?.remove();
    }
    detailedCount.textContent = String(detailedList.childElementCount);
  }

  function prettyJson(plain: string): string {
    try {
      return JSON.stringify(JSON.parse(plain), null, 2);
    } catch {
      return plain;
    }
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  }

  function statusColor(status: number): string {
    if (status >= 500) {
      return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    }
    if (status >= 400) {
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    }
    if (status >= 300) {
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    }
    return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }

  function scheduleAnnounce(): void {
    announcePending++;
    if (announceTimer !== undefined) return;
    announceTimer = setTimeout(() => {
      const n = announcePending;
      announcePending = 0;
      announceTimer = undefined;
      if (n === 1) announceEl.textContent = "Nouvelle requête";
      else if (n > 1) announceEl.textContent = n + " nouvelles requêtes";
    }, ANNOUNCE_INTERVAL_MS) as unknown as number;
  }

  async function fetchSalt(): Promise<string> {
    if (saltCache !== null) return saltCache;
    const res = await fetch("/api/salt");
    if (!res.ok) throw new Error("salt fetch failed");
    const data = await res.json();
    saltCache = String(data.salt);
    return saltCache;
  }

  async function deriveAesKey(clientKey: string, salt: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(clientKey + salt),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function decryptDetailed(b64url: string, key: CryptoKey): Promise<string> {
    const raw = base64UrlDecode(b64url);
    const iv = raw.slice(0, 12);
    const cipher = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const gunzipped = await gunzip(new Uint8Array(decrypted));
    return new TextDecoder().decode(gunzipped);
  }

  async function tryDecryptLocalBlob(
    blob: string,
    key: string,
  ): Promise<{ name?: string; logs?: { detailed?: boolean } } | null> {
    try {
      const salt = await fetchSalt();
      const aesKey = await deriveAesKey(key, salt);
      const raw = base64UrlDecode(blob);
      const iv = raw.slice(0, 12);
      const cipher = raw.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipher);
      const decompressed = await gunzip(new Uint8Array(decrypted));
      const json = new TextDecoder().decode(decompressed);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function gunzip(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
      new DecompressionStream("gzip"),
    );
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function sha256Hex16(blob: string): Promise<string> {
    const data = new TextEncoder().encode(blob);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex.slice(0, 16);
  }

  function base64UrlDecode(str: string): Uint8Array {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
})();
