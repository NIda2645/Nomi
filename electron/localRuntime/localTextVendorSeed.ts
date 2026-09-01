// 「本地模型」预设卡的内置供应商种子（无鉴权本地文本端点，默认关、用户显式连）。
//
// 与 ComfyuiLocalCard / Codex 本地生图同一模式：种子默认 enabled:false，用户在卡里连上后才翻真。
// baseUrl 用 `local://text` 这种非 http 约定，刻意**不参与 host 别名**（同 codex `local://codex`）——
// 真正连哪个端口由卡片探测后写进 vendor.baseUrlHint（Ollama 11434 / LM Studio 1234 / LocalAI 8080）。
//
// 只做**文本**：本地图像/视频已归 ComfyUI，不在此开并行版（P1）。
import type { VendorSeed } from "../catalog/builtinVendorSeeds";

/** 稳定契约：UI（LocalModelCard）与后端种子共用同一 key，避免并行定义漂移。 */
export const LOCAL_TEXT_VENDOR_KEY = "local-text";

export const LOCAL_TEXT_VENDOR_SEED: VendorSeed = {
  key: LOCAL_TEXT_VENDOR_KEY,
  name: "本地模型",
  baseUrl: "local://text",
  authType: "none",
  authHeader: null,
  enabled: false,
};
