// 自定义调用的 IPC 面（main.ts 800 行门：域逻辑住这里，main 只两行接线——同 comfyuiIpc 模式）。
// 三条通道：契约（编辑器变量表/模板）、AI 生成指令（主进程拼好给渲染层文本脑）、试跑（真调）。
import { ipcMain } from "electron";
import { trim } from "../jsonUtils";
import {
  buildCustomCallAiInstruction,
  CUSTOM_CALL_TEMPLATES,
  CUSTOM_CALL_VARIABLES,
} from "./customCallContract";
import { CustomCallScriptError, runCustomCallScript, type CustomCallTranscriptEntry } from "./customCallRunner";
import { readCatalog } from "./catalogStore";
import { decryptApiKeyRecord } from "./secrets";

export type CustomCallTestRunResult = {
  ok: boolean;
  /** 成功时的产物（URL/dataURL；试跑不落项目资产，仅供面板预览）。 */
  assets: string[];
  /** 文本模型 `return { text }` 的试跑结果；与资产结果分开，避免把正文当 URL。 */
  text?: string;
  errorMessage?: string;
  transcript: CustomCallTranscriptEntry[];
  durationMs: number;
};

function resolveTarget(vendorKey: string, modelKey: string) {
  const state = readCatalog();
  const vendor = state.vendors.find((v) => v.key === vendorKey);
  if (!vendor) throw new Error(`供应商不存在：${vendorKey}`);
  const model = state.models.find((m) => m.vendorKey === vendorKey && m.modelKey === modelKey);
  if (!model) throw new Error(`模型不存在：${vendorKey}/${modelKey}`);
  const apiKey = decryptApiKeyRecord(state.apiKeysByVendor[vendorKey]) || "";
  return { vendor, model, apiKey };
}

/** 试跑用的最小 canned 请求：够上游成一次最便宜的活，不带参考素材。 */
function cannedTestInput(kind: string): { prompt: string; params: Record<string, unknown> } {
  if (kind === "video") {
    return { prompt: "a red apple rolling on a wooden table, soft daylight", params: { duration: 5, n: 1 } };
  }
  return { prompt: "a red apple on a wooden table, soft daylight, studio photo", params: { n: 1 } };
}

/** 试跑的 saveFile 只做小结果预览，不把数据写进项目，也不让视频变成巨型 data URL。 */
const TEST_SAVE_FILE_MAX_BYTES = 4 * 1024 * 1024;
async function previewSavedFile(bytes: Buffer, contentType: string): Promise<string> {
  if (bytes.byteLength > TEST_SAVE_FILE_MAX_BYTES) {
    throw new Error("试跑 saveFile 收到的文件太大，不能在面板里拼 data URL；请直接保存后在真实任务里验证");
  }
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

export function registerCustomCallIpc(registerSyncIpc: (channel: string, handler: (...args: never[]) => unknown) => void): void {
  registerSyncIpc("nomi:model-catalog:custom-call:contract", () => ({
    variables: CUSTOM_CALL_VARIABLES.map((v) => ({ name: v.name, type: v.type })),
    templates: CUSTOM_CALL_TEMPLATES,
  }));

  registerSyncIpc("nomi:model-catalog:custom-call:ai-instruction", ((payload: unknown) => {
    const raw = (payload || {}) as Record<string, unknown>;
    const vendorKey = trim(raw.vendorKey);
    const modelKey = trim(raw.modelKey);
    const { vendor, model } = resolveTarget(vendorKey, modelKey);
    return buildCustomCallAiInstruction({
      modelKey: model.modelAlias || model.modelKey,
      kind: model.kind,
      baseUrl: String(vendor.baseUrlHint || ""),
      material: String(raw.material || ""),
      currentScript: trim(raw.currentScript) || undefined,
      lastError: trim(raw.lastError) || undefined,
    });
  }) as (...args: never[]) => unknown);

  ipcMain.handle("nomi:model-catalog:custom-call:test-run", async (_event, payload): Promise<CustomCallTestRunResult> => {
    const raw = (payload || {}) as Record<string, unknown>;
    const vendorKey = trim(raw.vendorKey);
    const modelKey = trim(raw.modelKey);
    const script = typeof raw.script === "string" ? raw.script : "";
    const started = Date.now();
    try {
      const { vendor, model, apiKey } = resolveTarget(vendorKey, modelKey);
      if (!script.trim()) throw new Error("脚本为空——先写点内容或让 AI 生成");
      const canned = cannedTestInput(model.kind);
      const executed = await runCustomCallScript({
        vendor,
        model,
        apiKey,
        script,
        prompt: canned.prompt,
        params: canned.params,
        timeoutMs: model.kind === "video" ? 10 * 60 * 1000 : 3 * 60 * 1000,
        saveFile: (bytes, _ext, contentType) => previewSavedFile(bytes, contentType),
      });
      return { ok: true, assets: executed.assets, ...(executed.text !== undefined ? { text: executed.text } : {}), transcript: executed.transcript, durationMs: Date.now() - started };
    } catch (error) {
      const transcript = error instanceof CustomCallScriptError ? error.transcript : [];
      return {
        ok: false,
        assets: [],
        errorMessage: error instanceof Error ? error.message : String(error),
        transcript,
        durationMs: Date.now() - started,
      };
    }
  });
}
