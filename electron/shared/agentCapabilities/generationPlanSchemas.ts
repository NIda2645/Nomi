import { z } from "zod";

export const GENERATION_RECONCILE_OUTCOMES = ["found", "not_found"] as const;

/**
 * 一条**已钉住**的参考：内容哈希与版本都在，执行契约按它签名（`contractHash` 覆盖 references）。
 * 它是候选里存的形状，不是模型填的形状。
 */
const reference = z.lazy(() => z.object({
  assetId: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  version: z.number().int().min(1),
  kind: z.enum(["image", "video", "audio"]).optional(),
  role: z.enum(["character", "first_frame", "last_frame", "reference", "audio"]).optional(),
}).strict());

/**
 * 一条**模型填的**参考：只要 assetId。
 *
 * 2026-09-18 根因：这里原本就是上面那条已钉住的形状，于是 `draft_shots` 只要带一张参考图就
 * 100% 被判 `generation_input_invalid` —— 而 `contentHash` / `version` 是模型**拿不到**的东西
 * （`look_at_media` 与 `look_at_canvas` 都不返回它们）。「宿主要求动词给不出的字段」与多镜那次
 * 硬要整只 `candidate` 是同一类，解法也同一条：模型给语义（哪份素材、当什么用），身份由宿主按
 * 项目素材库补（`resolveProjectAssetReferenceIdentity`）。已经钉好的调用方照常直接给，逐字节不变。
 */
const planReferenceInput = z.lazy(() => z.object({
  assetId: z.string().trim().min(1),
  contentHash: z.string().trim().min(1).optional(),
  version: z.number().int().min(1).optional(),
  kind: z.enum(["image", "video", "audio"]).optional(),
  role: z.enum(["character", "first_frame", "last_frame", "reference", "audio"]).optional(),
}).strict());

/** JSON values retain arbitrary nesting; the selected model catalog validates named parameters. */
type GenerationJsonValue = string | number | boolean | null | GenerationJsonValue[] | { [key: string]: GenerationJsonValue };
const generationJsonValueSchema: z.ZodType<GenerationJsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(generationJsonValueSchema), z.record(generationJsonValueSchema),
]));
const parameters = z.record(generationJsonValueSchema);

/** The explicit candidate accepted by the generation domain owner. */
export const generationCandidateSchema = z.object({
  candidateId: z.string().trim().min(1), revision: z.number().int().min(1),
  moduleId: z.string().trim(), providerId: z.string().trim(), modelId: z.string().trim(),
  mode: z.string().trim(), modeId: z.string().trim().min(1).optional(),
  variantId: z.string().trim().min(1).optional(), prompt: z.string(),
  parameters: parameters.default({}), references: z.array(reference).default([]),
}).strip();

const candidatePatch = z.object({
  prompt: z.string().optional(),
  taskKind: z.enum(["text_to_image", "image_edit", "text_to_video", "image_to_video"]).optional(),
  moduleId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  mode: z.string().optional(),
  modeId: z.string().optional(),
  variantId: z.string().optional(),
  parameters: parameters.optional(),
  references: z.array(planReferenceInput).optional(),
}).strict();

const createFields = {
  prompt: z.string().trim().min(1).optional(),
  taskKind: z.enum(["text_to_image", "image_edit", "text_to_video", "image_to_video"]).optional(),
  moduleId: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  modelId: z.string().trim().min(1).optional(),
  mode: z.string().trim().min(1).optional(),
  modeId: z.string().trim().min(1).optional(),
  variantId: z.string().trim().min(1).optional(),
  parameters: parameters.optional(),
  references: z.array(planReferenceInput).optional(),
  candidate: generationCandidateSchema.optional(),
  shots: z.array(z.object({
    shotId: z.string().trim().min(1).optional(),
    role: z.enum(["anchor", "shot"]).optional(),
    included: z.boolean().optional(),
    /**
     * 这一镜给人看的短标题（模型自己拟，如「日落前的一分钟」）。两个终点在等它：画布节点的标签，
     * 以及花钱确认卡上那行「#1 〈标题〉· 模型 · 价格」。上限 120 与 `sceneOneLiner` 的截断长度同源。
     */
    title: z.string().trim().min(1).max(120).optional(),
    candidate: generationCandidateSchema.optional(),
    prompt: z.string().trim().min(1).optional(),
    taskKind: z.enum(["text_to_image", "image_edit", "text_to_video", "image_to_video"]).optional(),
    /**
     * 2026-09-18 扫描：这两个字段**合成器早就在读**（`semanticCandidateFromParams` 按 `params.moduleId`
     * / `params.providerId` 取身份），只有这份 `.strict()` 的 shots 元素没声明它们。于是模型按目录点名
     * 「用 apimart 的 image-1」时，多镜那条路要么被整条拒收、要么把点名悄悄丢掉、落回用户的默认模型——
     * 一次**花钱**的调用用错模型且没有任何人报错。补齐的是声明，不是新能力。
     *
     * 换一个角度说同一件事（两份根因合同同一天各自挖到）：一镜能点名模型却点不了它的供应商，
     * 身份就只剩一半——没有 `providerId`，「这一笔花在哪个模型上」在多镜路上根本无法表达。
     */
    moduleId: z.string().trim().min(1).optional(),
    providerId: z.string().trim().min(1).optional(),
    modelId: z.string().trim().min(1).optional(),
    mode: z.string().trim().min(1).optional(),
    modeId: z.string().trim().min(1).optional(),
    variantId: z.string().trim().min(1).optional(),
    parameters: parameters.optional(),
    references: z.array(planReferenceInput).optional(),
  }).strict()).optional(),
  scriptText: z.string().trim().min(1).optional(),
  /**
   * 建草稿时先不把报价卡摆到用户面前（`draft_shots` 动词：草稿落画布、带单价角标、不出卡、不花钱）；
   * `present` 再翻成可见。缺省 = 卡立刻可见（外部 MCP 宿主与面板自己的路径，行为逐字不变）。
   */
  cardHidden: z.boolean().optional(),
} as const;

/**
 * 一次生成运行的 id。**上限是宿主这一侧的准入约束，不是模型面的装饰**：这个值直接当
 * `.nomi/runs/<operationId>/` 的目录名用（`mcpGenerationTools.ts` 里没给就发一个 `op-<uuid>`＝39 字），
 * 外部调用方给一个无界长串就是一条无界路径。2026-09-18 投影化之前这条上限只写在模型面上——
 * 也就是写在**最拦不住的那一层**（R17）；搬到宿主之后模型面从它派生，两边不可能再各写一份。
 */
const operationId = z.string().trim().min(1).max(160);

export const generationPlanInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("context"),
    taskKind: createFields.taskKind, scope: z.enum(["summary", "full"]).optional(),
  }).strict(),
  z.object({ operation: z.literal("create"), ...createFields }).strict(),
  /** `shotId`：改多镜草稿里的**一镜**（`draft_shots` 带 draftId + shotId）；缺省 = 顶层候选（单镜草稿）。 */
  z.object({ operation: z.literal("patch"), operationId, shotId: z.string().trim().min(1).optional(), patch: candidatePatch }).strict(),
  z.object({ operation: z.literal("preview"), operationId }).strict(),
  /** `generate` 动词：把已建草稿的报价卡摆到用户面前；`shotIds` 只把卡限定在这几镜（缺省全部）。 */
  z.object({ operation: z.literal("present"), operationId, shotIds: z.array(z.string().trim().min(1).max(160)).max(40).optional() }).strict(),
  // Strategy resolution is the separate GENERATION_RESOLVE_CAPABILITY owner.
]);

export const generationStatusInputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), operationId }).strict(),
  z.object({ operation: z.literal("cancel"), operationId }).strict(),
  z.object({ operation: z.literal("reconcile"), operationId, outcome: z.enum(GENERATION_RECONCILE_OUTCOMES) }).strict(),
]);

/** Host capability projection retains the canonical branches, never a parallel schema. */
export function generationPlanSchemaForHost(host: { preview: boolean }) {
  const [context, create, patch, , present] = generationPlanInputSchema.options;
  return host.preview ? generationPlanInputSchema : z.discriminatedUnion('operation', [context, create, patch, present]);
}

export const GENERATION_CREATE_EXAMPLE = {
  operation: 'create', taskKind: 'text_to_image',
  candidate: { candidateId: 'candidate-1', revision: 1, moduleId: 'image', providerId: 'from-context',
    modelId: 'from-context', mode: 'from-context', prompt: '海上日出' },
} as const;
