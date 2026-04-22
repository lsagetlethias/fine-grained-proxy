import { assertElement } from "./elements.ts";

const ACTIVE = ["border-fgp-600", "text-fgp-700", "dark:text-fgp-300", "dark:border-fgp-400"];
const INACTIVE = [
  "border-transparent",
  "text-gray-500",
  "hover:text-gray-700",
  "dark:text-gray-400",
  "dark:hover:text-gray-200",
];

export function setupTabs(): void {
  const tabs = [
    assertElement("tab-doc", HTMLButtonElement),
    assertElement("tab-examples", HTMLButtonElement),
    assertElement("tab-changelog", HTMLButtonElement),
    assertElement("tab-logs", HTMLButtonElement),
  ];
  const panels = [
    assertElement("panel-doc", HTMLElement),
    assertElement("panel-examples", HTMLElement),
    assertElement("panel-changelog", HTMLElement),
    assertElement("panel-logs", HTMLElement),
  ];

  function activate(index: number): void {
    for (let i = 0; i < tabs.length; i++) {
      const isActive = i === index;
      const tab = tabs[i];
      const panel = panels[i];

      tab.setAttribute("aria-selected", String(isActive));
      tab.setAttribute("tabindex", isActive ? "0" : "-1");

      for (const cls of ACTIVE) tab.classList.toggle(cls, isActive);
      for (const cls of INACTIVE) tab.classList.toggle(cls, !isActive);

      panel.classList.toggle("hidden", !isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    }
    tabs[index].focus();
  }

  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", () => activate(i));
  }

  tabs[0].parentElement?.addEventListener("keydown", (e: KeyboardEvent) => {
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      activate((current + 1) % tabs.length);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      activate((current - 1 + tabs.length) % tabs.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      activate(0);
    } else if (e.key === "End") {
      e.preventDefault();
      activate(tabs.length - 1);
    }
  });

  for (let i = 1; i < tabs.length; i++) {
    tabs[i].setAttribute("tabindex", "-1");
    panels[i].setAttribute("aria-hidden", "true");
  }
}
