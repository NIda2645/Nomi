// 改草稿那一刀的合并规则：把 patch 并进候选、清掉换模型带来的残留、把调用方这一次点名的
// 参数当场判掉，并算出要报给调用方的 changeset。
//
// 为什么单独成文件：`mcpGenerationTools.ts` 贴着 800 行门岗（R9），而这段逻辑本身是一个
// 完整的单元（两种参数两种待遇那条分界线就住在这里），拆出来比塞在 handler 里更好读、可单测。
import { admitPlanCandidate, type PlanCandidate } from "./executionContract";
import { normalizeVideoCandidate, stripParametersNotAccepted, videoCompileOptions } from "./mcpGenerationVideoResolve";
import type { ModuleRegistry } from "./moduleRegistry";
import type { VideoModelCandidate } from "../shared/videoCapabilities/recommendation";

/** 读盘归一只需要草稿的这几样（避免把 handler 的大类型拖进来）。 */
type GenerationOperationLike = {
  state: string;
  candidate: PlanCandidate;
  shots?: ReadonlyArray<{ shotId: string; candidate: PlanCandidate }>;
};

const normalizedModelIdentity = (value: string): string => value.trim().toLowerCase();

export type PlanPatchResolution = {
  normalizedPatch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>;
  changeset?: Record<string, unknown>;
};

/**
 * 两种参数，两种待遇（这条分界线是本刀的核心）：
 *  · 调用方**这一次点名**的参数 → 当场判，错了就结构化拒绝（模型才有得自纠）；
 *  · 换模型带来的**上个模型的残留** → 清掉并如实上报，不拒（它不是谁刚写错的）。
 */
export function resolvePlanPatch(input: {
  baseCandidate: PlanCandidate;
  userPatch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>;
  registry: Pick<ModuleRegistry, "resolve">;
  videoModelCandidates?: readonly VideoModelCandidate[];
}): PlanPatchResolution {
  const { baseCandidate, userPatch, registry, videoModelCandidates } = input;
  const nextProviderId = typeof userPatch.providerId === "string" ? userPatch.providerId : baseCandidate.providerId;
  const nextModelId = typeof userPatch.modelId === "string" ? userPatch.modelId : baseCandidate.modelId;
  const modelChanged = normalizedModelIdentity(nextProviderId) !== normalizedModelIdentity(baseCandidate.providerId)
    || normalizedModelIdentity(nextModelId) !== normalizedModelIdentity(baseCandidate.modelId);
  const modeChanged = typeof userPatch.mode === "string" && normalizedModelIdentity(userPatch.mode) !== normalizedModelIdentity(baseCandidate.mode);
  const mergedCandidate = {
    ...baseCandidate,
    ...userPatch,
    ...(modelChanged && userPatch.variantId === undefined ? { variantId: undefined } : {}),
    ...((modelChanged || modeChanged) && userPatch.modeId === undefined ? { modeId: undefined } : {}),
    parameters: userPatch.parameters ?? baseCandidate.parameters,
    references: userPatch.references ?? baseCandidate.references,
  } as PlanCandidate;
  const stripped = userPatch.parameters === undefined
    ? stripParametersNotAccepted(mergedCandidate, registry, videoModelCandidates)
    : { candidate: mergedCandidate, cleared: [] as string[] };
  const clearedParameters = stripped.cleared;
  const normalizedCandidate = normalizeVideoCandidate(stripped.candidate, videoModelCandidates);
  // 判的是**归一之后**的候选：变体别名（`fast-face` → `fast`）要先被认成正名，
  // 否则合法的别名会被自己的变体清单拒掉。
  if (userPatch.parameters !== undefined) {
    // 只做**准入**那一趟，不做提示词投影：plan 这条路拿不到 `referenceSourceUrls`，
    // 整份合同编译一遍会让任何一份 prompt 里带 `@[asset:…]` 的草稿改一次参数就被
    // 「投影不出 @image1」打回。判据与 preview/gate_request 是同一趟（`admitPlanCandidate`）。
    admitPlanCandidate(normalizedCandidate, registry, videoCompileOptions(normalizedCandidate, videoModelCandidates));
  }
  return {
    normalizedPatch: {
      ...userPatch,
      // 清理过就必须**连同清理后的参数一起落盘**。漏掉这一行时清理只是算了一遍、报了一遍，
      // 存的还是旧参数——「不上报 clearedParameters」那个变异当时因此杀不掉（2026-09-22 验收）。
      ...(clearedParameters.length ? { parameters: stripped.candidate.parameters } : {}),
      ...(normalizedCandidate.variantId ? { variantId: normalizedCandidate.variantId } : { variantId: undefined }),
      ...(normalizedCandidate.modeId ? { modeId: normalizedCandidate.modeId } : { modeId: undefined }),
    },
    ...(modelChanged || modeChanged ? {
      changeset: {
        modelChanged, modeChanged,
        ...(modelChanged && userPatch.variantId === undefined && baseCandidate.variantId ? { clearedVariantId: baseCandidate.variantId } : {}),
        ...((modelChanged || modeChanged) && userPatch.modeId === undefined && baseCandidate.modeId ? { clearedModeId: baseCandidate.modeId } : {}),
        ...(clearedParameters.length ? { clearedParameters } : {}),
        previousModel: `${baseCandidate.providerId}/${baseCandidate.modelId}`,
        nextModel: `${nextProviderId}/${nextModelId}`,
      },
    } : {}),
  };
}

/**
 * **读盘归一**：把一张**存量草稿**身上这个模型已经不接受的参数清掉，并**落盘一次**。
 *
 * 为什么在读点做而不是逐入口补（2026-09-22 第二轮验收）：上一轮只在 `plan` 那条路清理，
 * 于是 `preview` 算了一遍但不回写、`gate_request` 压根不清——同一张未改动的草稿
 * **预览看得见、点确认时炸**（`unknown_parameter`）。破坏没关闭，只是从预览挪到了付费闸。
 * 所有 capability 都经 `operations.read` 这一个读点，所以归一放这里：
 * 读出来的就是干净的，下游不必各自记得清一次。
 *
 * 只动 `draft`：已密封/已提交的操作是花钱闸的凭据，一个字都不能改。
 */
export async function normalizeStoredDraft(input: {
  operation: GenerationOperationLike;
  projectId: string;
  operationId: string;
  now: string;
  registry: Pick<ModuleRegistry, "resolve">;
  videoModelCandidates?: readonly VideoModelCandidate[];
  patch: (projectId: string, operationId: string, patch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>, now: string, shotId?: string) => GenerationOperationLike | Promise<GenerationOperationLike>;
}): Promise<{ operation: GenerationOperationLike; clearedParameters: string[] }> {
  const { operation, registry, videoModelCandidates } = input;
  if (operation.state !== "draft") return { operation, clearedParameters: [] };
  const cleared = new Set<string>();
  let current = operation;
  // 顶层候选与每一镜是同一段逻辑，走同一个循环（`shotId` 缺省 = 顶层）。
  const units = [{ candidate: operation.candidate, shotId: undefined as string | undefined }, ...(operation.shots ?? [])];
  for (const unit of units) {
    const stripped = stripParametersNotAccepted(unit.candidate, registry, videoModelCandidates);
    if (stripped.cleared.length === 0) continue;
    for (const key of stripped.cleared) cleared.add(key);
    current = await input.patch(input.projectId, input.operationId, { parameters: stripped.candidate.parameters }, input.now, unit.shotId);
  }
  return { operation: current, clearedParameters: [...cleared].sort() };
}
