import { registerAutomationPolicyIpc } from "./automationPolicyIpc";
import { registerProjectLocationIpc } from "./projectLocationIpc";
import { registerSystemPromptsIpc } from "./systemPromptsIpc";

export function registerSettingsIpc(): void {
  registerProjectLocationIpc();
  registerAutomationPolicyIpc();
  registerSystemPromptsIpc();
}
