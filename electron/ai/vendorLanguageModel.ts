// 按 catalog 里的 Vendor/Model 造一个 AI SDK LanguageModelV1。
//
// 单一真相源(P1):对话引擎(agentChatV2)与文本任务引擎(streamTextTask)都从这里取
// 模型构造,不再各写一份「vendor → baseURL/headers → buildAiSdkModel」的拼装。
import type { LanguageModelV1 } from "ai";
import { buildAiSdkModel } from "./buildAiSdkModel";
import { extractVendorExtraHeaders, normalizeProviderKind } from "../catalog/catalogStore";
import type { Model, Vendor } from "../catalog/types";

export function buildLanguageModelForVendor(vendor: Vendor, model: Model, apiKey: string): LanguageModelV1 {
  const providerKind = normalizeProviderKind(vendor.providerKind);
  // SDK 自己追加资源名；显式 API base（如 Gemini /v1beta/openai、/api/v3）不能再补 /v1。
  // 仅裸 host 使用 OpenAI 默认版本，catalog 的完整 operation path 拼接不受此规则影响。
  const baseURL = providerKind === "anthropic"
    ? (vendor.baseUrlHint || "").trim()
    : resolveSdkBaseUrl(vendor);
  const headers = extractVendorExtraHeaders(vendor);
  return buildAiSdkModel({
    kind: providerKind,
    baseURL,
    apiKey,
    authType: vendor.authType,
    modelId: model.modelAlias || model.modelKey,
    ...(headers ? { headers } : {}),
  });
}

function resolveSdkBaseUrl(vendor: Vendor): string {
  const base = (vendor.baseUrlHint || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error(`Base URL missing: ${vendor.key}`);
  try {
    const url = new URL(base);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/v1";
      return url.toString();
    }
  } catch {
    // 无效地址仍交给既有 SDK / 配置验证报告，不能臆造一个新地址。
  }
  return base;
}
