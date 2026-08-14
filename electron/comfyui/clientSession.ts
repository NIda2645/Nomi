import crypto from "node:crypto";

/** 一个 Nomi 主进程会话一个 client id，避免多个窗口/实例都冒充固定的 "nomi"。 */
const clientId = `nomi-${crypto.randomUUID()}`;

export const COMFYUI_CLIENT_FEATURE_FLAGS = Object.freeze({
  supports_preview_metadata: true,
});

export function getComfyuiClientId(): string {
  return clientId;
}

export function isCanonicalPromptId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

/** 新服务端要求 canonical lowercase UUID；renderer 预生成的合法值优先，否则主进程补一个。 */
export function resolveComfyuiPromptId(value: unknown): string {
  return isCanonicalPromptId(value) ? value : crypto.randomUUID();
}
