// 改草稿那一刀的合并规则：把 patch 并进候选、清掉换模型带来的残留、把调用方这一次点名的
// 参数当场判掉，并算出要报给调用方的 changeset。
//
// 为什么单独成文件：`mcpGenerationTools.ts` 贴着 800 行门岗（R9），而这段逻辑本身是一个
// 完整的单元（两种参数两种待遇那条分界线就住在这里），拆出来比塞在 handler 里更好读、可单测。
import { compileExecutionContract, type PlanCandidate } from "./executionContract";
import { normalizeVideoCandidate, stripParametersNotAccepted, videoCompileOptions } from "./mcpGenerationVideoResolve";
import type { ModuleRegistry } from "./moduleRegistry";
import type { VideoModelCandidate } from "../shared/videoCapabilities/recommendation";

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
    compileExecutionContract(normalizedCandidate, registry, videoCompileOptions(normalizedCandidate, videoModelCandidates));
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
