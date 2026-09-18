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

const setupIdField = z.string().trim().min(1).max(200)
  .describe("The setup handle returned by connect_provider; nomi_read target=setup reports its state.");

/**
 * 同一个对外工具里同名字段必须**同形**（`projectMcpTool` 的 mergeFieldSchema 装配期抛）——
 * 那条规则不是审美：两个动词对同一个字段各写一份描述，模型读到的就是两种说法。
 */
const vendorKeyField = z.string().trim().min(1).max(160)
  .describe("Connection id, exactly as nomi_read target=models returned it.");

/**
 * 每个 action 模型要填的那一部分（**带描述**）。
 *
 * 动词声明（`verbs/onboardingVerbs.ts`）与契约的 `inputSchema` 都从这里派生——以前两边各写一遍
 * 同样的字段与约束（Ponytail 2026-09-18），那正是「同一件事两份定义」：其中一份改了约束，
 * 另一份不会红，而模型读的是前者、运行时判的是后者。
 */
export const MODEL_SETUP_ACTION_FIELDS = {
  connect_provider: z.object({
    name: z.string().trim().min(1).max(240).optional().describe("Provider display name, required when connecting a new one."),
    vendorKey: vendorKeyField.optional(),
    docs: z.string().max(65_536).optional().describe("API documentation: the text itself, or one http(s) URL per line."),
    suggestedBaseUrl: z.string().trim().min(1).max(2_000).optional().describe("Address suggestion. It is only pre-filled on the credential page; the user confirms it by saving, and Nomi binds the key to it."),
    suggestedAuthNote: z.string().trim().min(1).max(400).optional().describe("One sentence on how this provider wants the key sent, shown next to the address."),
    sourceUrl: z.string().trim().min(1).max(2_048).optional().describe("Documentation page the suggestion was read from; shown to the user."),
    proxyEnabled: z.boolean().optional().describe("Turn this connection's already-saved proxy on or off. The proxy URL itself is never an argument."),
    reissueKey: z.boolean().optional().describe("Reopen the credential page for an existing connection so the user can paste a new key."),
  }).strict(),
  submit_declaration: z.object({
    setupId: setupIdField,
    declaration: z.string().min(2).max(MAX_DECLARATION_TEXT).describe("The declaration card as JSON text. Its shape is the contractSchema returned by nomi_read target=setup."),
  }).strict(),
  show_models: z.object({
    vendorKey: vendorKeyField,
    modelKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(200).describe("Exact model ids from nomi_read target=models."),
    visible: z.boolean().describe("true shows them in the pickers, false hides them."),
  }).strict(),
  cancel: z.object({ setupId: setupIdField }).strict(),
} as const;

/** 契约的语义输入：上面那几份 + 各自的 `action` 判别字段。 */
export const modelSetupInputSchema = z.discriminatedUnion("action", [
  MODEL_SETUP_ACTION_FIELDS.connect_provider.extend({ action: z.literal("connect_provider") }),
  MODEL_SETUP_ACTION_FIELDS.submit_declaration.extend({ action: z.literal("submit_declaration") }),
  MODEL_SETUP_ACTION_FIELDS.show_models.extend({ action: z.literal("show_models") }),
  MODEL_SETUP_ACTION_FIELDS.cancel.extend({ action: z.literal("cancel") }),
]);

export const modelRemoveInputSchema = z.object({
  vendorKey: vendorKeyField,
  modelKeys: z.array(z.string().trim().min(1).max(160)).min(1).max(200).optional()
    .describe("Exact model ids to delete. Omit to delete the whole connection and its saved key."),
  ifUnchanged: z.string().trim().min(1).max(200)
    .describe("Fingerprint from the nomi_read that listed these; the delete is refused if anything changed since."),
}).strict();

export type ModelSetupInput = z.infer<typeof modelSetupInputSchema>;
export type ModelRemoveInput = z.infer<typeof modelRemoveInputSchema>;

export const MODEL_ONBOARDING_SETUP_CAPABILITY = {
  id: "model.onboarding.setup",
  version: 1,
  aliases: { pi: "connect_model_provider", mcp: "nomi_model_setup" },
  inputSchema: modelSetupInputSchema,
  // 结果形状由信封（`capabilityCore/modelOnboarding/envelope.ts`）说了算，契约这一层不再复述一遍。
  outputSchema: z.unknown(),
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
  outputSchema: z.unknown(),
  effect: "destructive",
  effectClass: "irreversible",
  execution: { port: "model-catalog", availability: "main_or_renderer" },
  exposure: "mcp_safe",
  requiredScope: "models:write",
  targetKind: "app",
  scope: "app",
} as const satisfies CapabilityContract<ModelRemoveInput, unknown>;
