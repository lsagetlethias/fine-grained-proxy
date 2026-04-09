import type { Elements } from "./elements.ts";

export function setupTtl(els: Elements): void {
  document.querySelectorAll<HTMLInputElement>("input[name=ttl]").forEach(function (radio) {
    radio.addEventListener("change", function () {
      els.customTtlWrapper.classList.toggle("hidden", radio.value !== "custom");
      els.ttlWarning.classList.toggle("hidden", radio.value !== "0");
    });
  });
}
