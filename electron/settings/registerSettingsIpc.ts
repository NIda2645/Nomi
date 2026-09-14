import { registerCanvasMenuPreferenceIpc } from "./canvasMenuPreferenceIpc";
import { registerAutomationPolicyIpc } from "./automationPolicyIpc";
import { registerGenerationModelDefaultsIpc } from "./generationModelDefaultsIpc";
import { registerVendorPreferenceIpc } from "./vendorPreferenceIpc";
import { registerModelBoxPreferenceIpc } from "./modelBoxPreferenceIpc";
import { registerProjectLocationIpc } from "./projectLocationIpc";
import { registerSystemPromptsIpc } from "./systemPromptsIpc";
import { hydrateAssetRelayRuntime } from "./assetRelaySettings";
import { registerAssetRelaySettingsIpc } from "./assetRelaySettingsIpc";
import { registerTelemetryIpc } from "./telemetryIpc";
import { registerDiagnosticsIpc } from "../diagnostics/diagnosticsIpc";
import { registerAgentTraceIpc } from "../diagnostics/agentTraceIpc";
import { flushPendingFeedback, registerFeedbackIpc } from "../feedback/feedbackIpc";

import { registerAttentionSoundIpc } from "./attentionSoundIpc";

export function registerSettingsIpc(): void {
  hydrateAssetRelayRuntime();
  registerProjectLocationIpc();
  registerAutomationPolicyIpc();
  registerAssetRelaySettingsIpc();
  registerSystemPromptsIpc();
  registerGenerationModelDefaultsIpc();
  registerVendorPreferenceIpc();
  registerModelBoxPreferenceIpc();
  registerCanvasMenuPreferenceIpc();
  registerTelemetryIpc();
  registerAttentionSoundIpc();
  // 「隐私与诊断」那一格的另一半：遥测是「发不发出去」，诊断包是「出事时怎么把证据交出来」。
  // 两者同住一个设置区块，接线也放在一起。
  registerDiagnosticsIpc();
  registerAgentTraceIpc();
  // 一键反馈**不受**「帮 Nomi 变好」开关管（用户主动点的），但接线仍住这一格：
  // 用户找「我的数据去哪了」时，三件事在同一个地方说得清。
  registerFeedbackIpc();
  // 上次没发出去的补发掉。失败无声——用户已经拿到过回执编号。
  flushPendingFeedback();
}
