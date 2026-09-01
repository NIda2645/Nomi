// 「本地模型」预设卡的 IPC 面（探端口 + 能力预检）。
// 语义：两个都是异步网络问询（ipcMain.handle）；纯装配已有原语，不新造运行时。
import { ipcMain } from "electron";
import { assertTrustedSender } from "../ipcSenderGuard";
import { probeLocalTextEndpoints } from "./localTextEndpoints";
import { probeLocalTextCapability } from "./localTextCapabilityProbe";

export function registerLocalTextEndpointIpc(): void {
  // 端口探测（卡片进入/刷新时调用；直连 localhost /v1/models，不走系统代理）。
  ipcMain.handle("nomi:local-text:probe", (event) => {
    assertTrustedSender(event);
    return probeLocalTextEndpoints();
  });
  // 能力预检（用户对某个探到的模型点「检查能力」时调用）：一次最小工具调用探针。
  ipcMain.handle("nomi:local-text:capability", (event, payload: unknown) => {
    assertTrustedSender(event);
    const raw = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const baseUrl = String(raw.baseUrl || "").trim();
    const modelId = String(raw.modelId || "").trim();
    if (!/^https?:\/\//i.test(baseUrl) || !modelId) {
      return Promise.resolve({ verdict: "unknown" as const, detail: "invalid_request" });
    }
    return probeLocalTextCapability({ baseUrl, modelId });
  });
}
