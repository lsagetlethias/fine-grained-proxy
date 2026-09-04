const RETURN_ID = "doc-return";

function panelOf(target: HTMLElement): HTMLElement | null {
  return target.closest<HTMLElement>("[role=tabpanel]");
}

function openAncestorDetails(target: HTMLElement): void {
  // Le parcours demarre sur la cible elle-meme : une cible qui EST un <details>
  // resterait repliee si on partait de son parent.
  let node: HTMLElement | null = target;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }
}

function removeReturn(): void {
  document.getElementById(RETURN_ID)?.remove();
}

function insertReturn(target: HTMLElement, origin: HTMLElement, label: string): void {
  removeReturn();
  const button = document.createElement("button");
  button.type = "button";
  button.id = RETURN_ID;
  button.className =
    "mb-2 inline-flex items-center gap-1 text-xs font-medium text-fgp-600 hover:text-fgp-800 focus:outline-none focus:underline dark:text-fgp-400 dark:hover:text-fgp-200";
  button.textContent = `← Revenir à ${label}`;
  button.addEventListener("click", () => {
    removeReturn();
    origin.scrollIntoView({ behavior: "smooth", block: "center" });
    origin.focus();
  });

  const title = target.querySelector("dt, h3, summary");
  if (title && title.parentElement === target) title.after(button);
  else target.prepend(button);
}

export function setupDocLinks(): void {
  document.addEventListener("click", (event) => {
    const origin = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-goto-doc]");
    if (!origin) return;

    const target = document.getElementById(origin.dataset.gotoDoc ?? "");
    if (!target) return;

    // Ordre contraignant : activate() dans tabs.ts finit par focus() sur l'onglet.
    // Deplacer le focus avant la bascule le ferait atterrir sur le bouton d'onglet.
    const panel = panelOf(target);
    if (panel) document.getElementById(panel.getAttribute("aria-labelledby") ?? "")?.click();

    openAncestorDetails(target);

    const label = origin.dataset.returnLabel;
    if (label) insertReturn(target, origin, label);

    // Une cible sans tabindex (un <details> par exemple) n'est pas focusable : sans ce
    // garde, le changement de contenu se produirait sans que le focus suive.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus();
  });

  // Un seul retour vivant a la fois : la bascule manuelle d'onglet le retire.
  for (const tab of document.querySelectorAll<HTMLElement>("[role=tab]")) {
    tab.addEventListener("click", () => {
      if (!document.getElementById(RETURN_ID)) return;
      setTimeout(removeReturn, 0);
    });
  }
}
