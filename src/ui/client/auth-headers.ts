import { checkHeaderName, MAX_AUTH_HEADERS } from "../../auth/spec.ts";
import { assertElement } from "./elements.ts";

export interface HeaderEntry {
  name: string;
  value: string;
}

const MAX_VALUE_LENGTH = 1024;

const NAME_MESSAGES: Record<string, string> = {
  empty: "Le nom du header est obligatoire.",
  "too-long": "Nom de header limité à 64 caractères.",
  invalid: "Nom de header invalide : espaces et caractères spéciaux interdits.",
  reserved: "Header réservé, il ne peut pas être surchargé.",
};

const ERROR_ICON =
  '<svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>';

export interface AuthHeadersApi {
  readEntries(): HeaderEntry[];
  setEntries(entries: HeaderEntry[], redacted: boolean): void;
  validate(): boolean;
  reset(): void;
}

export function setupAuthHeaders(): AuthHeadersApi {
  const list = assertElement("custom-headers-list", HTMLElement);
  const btnAdd = assertElement("btn-add-header", HTMLButtonElement);
  const counter = assertElement("custom-headers-count", HTMLElement);
  const btnToggle = assertElement("btn-toggle-header-values", HTMLButtonElement);
  const hint = assertElement("custom-headers-hint", HTMLElement);
  const singleNote = assertElement("custom-headers-single-note", HTMLElement);
  const status = assertElement("custom-headers-status", HTMLElement);

  const baseHint = hint.textContent ?? "";
  const template = list.querySelector<HTMLElement>("[data-header-row]")!.cloneNode(
    true,
  ) as HTMLElement;
  let nextUid = 2;
  let valuesVisible = false;
  let lastStatus = "";

  function rows(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>("[data-header-row]"));
  }

  function nameInput(row: HTMLElement): HTMLInputElement {
    return row.querySelector<HTMLInputElement>("[data-header-name]")!;
  }

  function valueInput(row: HTMLElement): HTMLInputElement {
    return row.querySelector<HTMLInputElement>("[data-header-value]")!;
  }

  function removeButton(row: HTMLElement): HTMLButtonElement {
    return row.querySelector<HTMLButtonElement>("[data-header-remove]")!;
  }

  function announce(message: string): void {
    status.textContent = message === lastStatus ? message + "​" : message;
    lastStatus = status.textContent;
  }

  function renumber(): void {
    const all = rows();
    all.forEach((row, index) => {
      const position = index + 1;
      const uid = row.dataset.headerUid ?? `h${position}`;
      const name = nameInput(row);
      const value = valueInput(row);
      const remove = removeButton(row);

      name.id = `header-name-${uid}`;
      value.id = `header-value-${uid}`;
      const nameLabel = row.querySelector<HTMLLabelElement>(`label[for^="header-name-"]`);
      const valueLabel = row.querySelector<HTMLLabelElement>(`label[for^="header-value-"]`);
      if (nameLabel) {
        nameLabel.htmlFor = name.id;
        nameLabel.textContent = `Nom du header ${position}`;
      }
      if (valueLabel) {
        valueLabel.htmlFor = value.id;
        valueLabel.textContent = `Valeur du header ${position}`;
      }

      const suffix = name.value.trim() ? `, ${name.value.trim()}` : "";
      remove.setAttribute("aria-label", `Supprimer le header ${position}${suffix}`);
      remove.disabled = all.length === 1;
      if (all.length === 1) {
        remove.title = "Au moins un header est requis";
      } else {
        remove.removeAttribute("title");
      }
    });

    counter.textContent = `${all.length} / ${MAX_AUTH_HEADERS}`;
    btnAdd.disabled = all.length >= MAX_AUTH_HEADERS;
    hint.textContent = all.length >= MAX_AUTH_HEADERS
      ? "Maximum de 8 headers atteint. Supprimez une ligne pour en ajouter une autre."
      : baseHint;
    singleNote.hidden = all.length !== 1;
  }

  function clearRowError(row: HTMLElement): void {
    const existing = row.querySelector<HTMLElement>("[data-header-error]");
    if (existing) existing.remove();
    for (const input of [nameInput(row), valueInput(row)]) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  function setRowError(row: HTMLElement, input: HTMLInputElement, message: string): void {
    clearRowError(row);
    const uid = row.dataset.headerUid ?? "h";
    const paragraph = document.createElement("p");
    paragraph.id = `header-error-${uid}`;
    paragraph.setAttribute("data-header-error", "");
    paragraph.className =
      "w-full flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300";
    paragraph.innerHTML = `${ERROR_ICON}<span></span>`;
    paragraph.querySelector("span")!.textContent = message;
    row.appendChild(paragraph);
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", paragraph.id);
  }

  function validateRow(row: HTMLElement, all: HTMLElement[]): boolean {
    clearRowError(row);
    const name = nameInput(row);
    const value = valueInput(row);
    const rawName = name.value.trim();

    const issue = checkHeaderName(rawName);
    if (issue) {
      setRowError(row, name, NAME_MESSAGES[issue]);
      return false;
    }

    const duplicateIndex = all.findIndex((other) =>
      other !== row && nameInput(other).value.trim().toLowerCase() === rawName.toLowerCase()
    );
    if (duplicateIndex !== -1 && all.indexOf(row) > duplicateIndex) {
      setRowError(row, name, `Ce header est déjà défini (ligne ${
        duplicateIndex + 1
      }).`);
      return false;
    }

    if (value.value.length === 0) {
      setRowError(row, value, "La valeur du header est obligatoire.");
      return false;
    }
    if (value.value.length > MAX_VALUE_LENGTH) {
      setRowError(row, value, "Valeur limitée à 1024 caractères.");
      return false;
    }
    if (/[\r\n]/.test(value.value)) {
      setRowError(row, value, "La valeur ne peut pas contenir de saut de ligne.");
      return false;
    }
    return true;
  }

  function validateAll(): boolean {
    const all = rows();
    let firstInvalid: HTMLInputElement | null = null;
    for (const row of all) {
      if (validateRow(row, all)) continue;
      if (!firstInvalid) {
        firstInvalid = row.querySelector<HTMLInputElement>('[aria-invalid="true"]');
      }
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }
    return true;
  }

  function applyVisibility(): void {
    for (const row of rows()) {
      valueInput(row).type = valuesVisible ? "text" : "password";
    }
    btnToggle.setAttribute("aria-pressed", valuesVisible ? "true" : "false");
    const label = btnToggle.querySelector<HTMLElement>("[data-toggle-label]");
    if (label) {
      label.textContent = valuesVisible ? "Masquer les valeurs" : "Afficher les valeurs";
    }
  }

  function wireRow(row: HTMLElement): void {
    const name = nameInput(row);
    const value = valueInput(row);
    name.addEventListener("blur", () => {
      const all = rows();
      for (const other of all) validateRow(other, all);
      renumber();
    });
    value.addEventListener("blur", () => validateRow(row, rows()));
    removeButton(row).addEventListener("click", () => removeRow(row));
  }

  function addRow(focusNew: boolean): HTMLElement {
    const row = template.cloneNode(true) as HTMLElement;
    const uid = `h${nextUid++}`;
    row.dataset.headerUid = uid;
    const name = nameInput(row);
    const value = valueInput(row);
    name.value = "";
    value.value = "";
    name.removeAttribute("aria-invalid");
    value.removeAttribute("aria-invalid");
    const existingError = row.querySelector("[data-header-error]");
    if (existingError) existingError.remove();
    list.appendChild(row);
    wireRow(row);
    renumber();
    applyVisibility();
    if (focusNew) {
      name.focus();
      announce(`Header ${rows().length} ajouté. ${rows().length} headers sur 8.`);
    }
    return row;
  }

  function removeRow(row: HTMLElement): void {
    const all = rows();
    if (all.length <= 1) return;
    const index = all.indexOf(row);
    const fallback = all[index + 1] ?? all[index - 1];
    row.remove();
    renumber();
    const remaining = rows();
    if (remaining.length === 1) {
      btnAdd.focus();
    } else if (fallback && fallback.isConnected) {
      removeButton(fallback).focus();
    } else {
      btnAdd.focus();
    }
    announce(`Header ${index + 1} supprimé. ${remaining.length} headers sur 8.`);
  }

  btnAdd.addEventListener("click", () => {
    if (rows().length >= MAX_AUTH_HEADERS) {
      announce("Maximum de 8 headers atteint.");
      return;
    }
    addRow(true);
  });

  btnToggle.addEventListener("click", () => {
    valuesVisible = !valuesVisible;
    applyVisibility();
  });

  for (const row of rows()) wireRow(row);
  renumber();

  return {
    readEntries(): HeaderEntry[] {
      return rows()
        .map((row) => ({
          name: nameInput(row).value.trim(),
          value: valueInput(row).value,
        }))
        .filter((entry) => entry.name.length > 0 || entry.value.length > 0);
    },
    setEntries(entries: HeaderEntry[], redacted: boolean): void {
      const all = rows();
      for (let i = 1; i < all.length; i++) all[i].remove();
      const first = all[0];
      nameInput(first).value = "";
      valueInput(first).value = "";
      clearRowError(first);

      const wanted = entries.length > 0 ? entries : [{ name: "", value: "" }];
      wanted.forEach((entry, index) => {
        const row = index === 0 ? first : addRow(false);
        nameInput(row).value = entry.name;
        valueInput(row).value = entry.value;
        if (redacted) {
          valueInput(row).placeholder = "Valeur à ressaisir";
        }
      });
      renumber();
      if (redacted) {
        hint.textContent = baseHint +
          " Les valeurs ne sont jamais renvoyées par le serveur, ressaisissez-les avant de régénérer.";
      }
    },
    validate: validateAll,
    reset(): void {
      const all = rows();
      for (let i = 1; i < all.length; i++) all[i].remove();
      const first = all[0];
      nameInput(first).value = "";
      valueInput(first).value = "";
      valueInput(first).placeholder = "Secret envoyé à l'API cible";
      clearRowError(first);
      valuesVisible = false;
      applyVisibility();
      renumber();
    },
  };
}
