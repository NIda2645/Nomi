/**
 * 接模型的两个 App 级能力（方案 §4.1：一个工具 = 一种后果 = 动哪个状态 × 效果类别）。
 *
 * ── 为什么是两个而不是一个 ────────────────────────────────────────────────────────
 * 「连上一家 / 交一张卡 / 显示隐藏模型 / 取消」全是**可撤、本地、不花钱**的一格，合成一个工具；
 * 「永久删掉一条连接或几个模型」是另一格（irreversible），跨格必拆——合进去等于让一次「接模型」
 * 的调用和一次「删掉它」的调用在宿主的审批面上长得一样。
 *
 * ── 为什么是 App 级 ──────────────────────────────────────────────────────────────
 * 模型目录不住在任何一个项目里。硬要一个 `leaseHandle` 等于要求「先开个项目才能接模型」，
 * 而那正是 09-15 真机四轮零产出路上的闸之一（`CapabilityContract.scope`）。
 *
 * ── 地址不在入参里 ───────────────────────────────────────────────────────────────
 * `suggestedBaseUrl` 是**建议**：它只进贴 key 页的展示，永不落 vendor。密钥去向由用户在那一页
 * 按下保存时绑定（§6.1，`catalog/credentialBinding.ts`），`check:credential-origin` 盯着这张 schema。
 */
import { z } from "zod";

import type { CapabilityContract } from "./capabilityContract";

/** 一张声明卡最大 512KB（与旧 `proposal.adapterDraft` 同一上限，传输层用字符串承载）。 */
const MAX_DECLARATION_TEXT = 512 * 1024;

export const modelSetupInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connect_provider"),
    name: z.string().trim().min(1).max(240).optional(),
    vendorKey: z.string().trim().min(1).max(160).optional(),
    docs: z.string().max(65_536).optional(),
    suggestedBaseUrl: z.string().trim().min(1).max(2_000).optional(),
    suggestedAuthNote: z.string().trim().min(1).max(400).optional(),
    sourceUrl: z.string().trim().min(1).max(2_048).optional(),
    proxyEnabled: z.boolean().optional(),
    reissueKey: z.boolean().optional(),
  }).strict(),
  z.object({
    action: z.literal("submit_declaration"),
    setupId: z.string().trim().min(1).max(200),
    declaration: z.string().min(2).max(MAX_DECLARATION_TEXT),
  }).strict(),
  z.object({
    action: z.literal("show_models"),
    vendorKey: z.string().trim().min(1).max(160),
    modelKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(200),
    visible: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal("cancel"),
    setupId: z.string().trim().min(1).max(200),
  }).strict(),
]);

export const modelSetupResultSchema = z.unknown();

export const modelRemoveInputSchema = z.object({
  vendorKey: z.string().trim().min(1).max(160),
  modelKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(200).optional(),
  ifUnchanged: z.string().trim().min(1).max(200),
}).strict();

export const modelRemoveResultSchema = z.unknown();

export type ModelSetupInput = z.infer<typeof modelSetupInputSchema>;
export type ModelRemoveInput = z.infer<typeof modelRemoveInputSchema>;

export const MODEL_ONBOARDING_SETUP_CAPABILITY = {
  id: "model.onboarding.setup",
  version: 1,
  aliases: { pi: "connect_model_provider", mcp: "nomi_model_setup" },
  inputSchema: modelSetupInputSchema,
  outputSchema: modelSetupResultSchema,
  effect: "reversible_write",
  effectClass: "reversible_local",
  execution: { port: "model-catalog", availability: "main_or_renderer" },
  exposure: "mcp_safe",
  requiredScope: "models:write",
  targetKind: "app",
  scope: "app",
} as const satisfies CapabilityContract<ModelSetupInput, unknown>;

export const MODEL_ONBOARDING_REMOVE_CAPABILITY = {
  id: "model.onboarding.remove",
  version: 1,
  aliases: { pi: "remove_model_provider", mcp: "nomi_remove_provider" },
  inputSchema: modelRemoveInputSchema,
  outputSchema: modelRemoveResultSchema,
  effect: "destructive",
  effectClass: "irreversible",
  execution: { port: "model-catalog", availability: "main_or_renderer" },
  exposure: "mcp_safe",
  requiredScope: "models:write",
  targetKind: "app",
  scope: "app",
} as const satisfies CapabilityContract<ModelRemoveInput, unknown>;
