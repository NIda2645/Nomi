import { registerAutomationPolicyIpc } from "./automationPolicyIpc";
import { registerGenerationModelDefaultsIpc } from "./generationModelDefaultsIpc";
import { registerProjectLocationIpc } from "./projectLocationIpc";
import { registerSystemPromptsIpc } from "./systemPromptsIpc";

export function registerSettingsIpc(): void {
  registerProjectLocationIpc();
  registerAutomationPolicyIpc();
  registerSystemPromptsIpc();
  registerGenerationModelDefaultsIpc();
}
