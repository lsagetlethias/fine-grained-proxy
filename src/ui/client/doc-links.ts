const RETURN_ID = "doc-return";

let switchingForDocLink = false;

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
    if (panel) {
      // Sans ce drapeau, le nettoyage declenche par la bascule supprimerait le bouton de
      // retour que insertReturn() vient tout juste de poser, deux renvois de suite.
      switchingForDocLink = true;
      document.getElementById(panel.getAttribute("aria-labelledby") ?? "")?.click();
      switchingForDocLink = false;
    }

    openAncestorDetails(target);

    const label = origin.dataset.returnLabel;
    if (label) insertReturn(target, origin, label);

    // Une cible sans tabindex (un <details> par exemple) n'est pas focusable : sans ce
    // garde, le changement de contenu se produirait sans que le focus suive.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus();
  });

  // Un seul retour vivant a la fois : la bascule manuelle d'onglet le retire, mais pas
  // celle qu'un renvoi vient de declencher, sinon il supprimerait son propre remplacant.
  for (const tab of document.querySelectorAll<HTMLElement>("[role=tab]")) {
    tab.addEventListener("click", () => {
      if (switchingForDocLink) return;
      removeReturn();
    });
  }
}
