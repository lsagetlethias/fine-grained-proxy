import { assertElement } from "./elements.ts";

export function setupLogsTab(): () => { enabled: boolean; detailed: boolean } | null {
  const enabledBox = assertElement("logs-enabled", HTMLInputElement);
  const detailedBox = assertElement("logs-detailed", HTMLInputElement);
  const detailedLabel = assertElement("logs-detailed-label", HTMLLabelElement);
  const warning = assertElement("logs-detailed-warning", HTMLElement);
  const featureOff = assertElement("logs-feature-off", HTMLElement);

  let featureEnabled = true;

  fetch("/logs/health")
    .then((r) => r.json())
    .then((data: { enabled?: boolean }) => {
      featureEnabled = data.enabled === true;
      if (!featureEnabled) {
        featureOff.hidden = false;
        enabledBox.disabled = true;
        detailedBox.disabled = true;
        detailedLabel.classList.add("opacity-50");
      }
    })
    .catch(() => {
      // keep default: assume enabled
    });

  function refreshDetailedAvailability(): void {
    const on = enabledBox.checked && featureEnabled;
    detailedBox.disabled = !on;
    if (!on) {
      detailedBox.checked = false;
      detailedLabel.classList.add("opacity-50");
    } else {
      detailedLabel.classList.remove("opacity-50");
    }
    warning.hidden = !detailedBox.checked;
  }

  enabledBox.addEventListener("change", refreshDetailedAvailability);
  detailedBox.addEventListener("change", refreshDetailedAvailability);
  refreshDetailedAvailability();

  return () => {
    if (!enabledBox.checked) return null;
    return { enabled: true, detailed: detailedBox.checked };
  };
}
