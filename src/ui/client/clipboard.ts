export function setupClipboard(): void {
  document.addEventListener("click", function (e: Event) {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>(".copy-btn");
    if (!btn) return;
    const targetId = btn.getAttribute("data-copy");
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    const text = (el as HTMLInputElement).value || el.textContent || "";
    navigator.clipboard.writeText(text).then(function () {
      const orig = btn.textContent;
      btn.textContent = "Copi\u00e9 !";
      setTimeout(function () {
        btn.textContent = orig;
      }, 1500);
    });
  });
}
