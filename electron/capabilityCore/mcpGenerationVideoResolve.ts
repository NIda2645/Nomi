// 能力核 · 视频模型解析纯函数（从 mcpGenerationTools.ts 抽出，守 800 行门岗 R9）。
//
// 这份文件把「一份 PlanCandidate ↔ 目录里的视频模型档案」的解析逻辑集中成一处：按 provider/model(+variant)
// 定位视频候选、归一 candidate 的 modelKey/variantId、把模式参数投影成 ParameterField schema、判模型有无参考图
// 槽 / candidate 带不带角色参考 / 时长估计。全是纯函数（吃 candidate + 候选快照，零副作用、零 provider 调用），
// preview/gate/多镜密封都靠它当单一真相源。mcpGenerationTools.ts 与 mcpGenerationMultiShot.ts 单向 import。

import { ContractCompilationError, type ExecutionContractCompileOptions, type PlanCandidate } from "./executionContract";
import type { ParameterField } from "./moduleManifest";
import type { ResolvedModule } from "./moduleRegistry";
import type {
  VideoGenerationRecommendationInput,
  VideoModelCandidate,
} from "../shared/videoCapabilities/recommendation";
import { canonicalVideoVariantId, effectiveVideoModes, recommendVideoGeneration, videoVariantIdsOf } from "../shared/videoCapabilities/recommendation";
import { modeTransportFor } from "../shared/videoCapabilities/modeTransport";
import type { ArchetypeMode, ModelParameterControl } from "../shared/videoCapabilities/types";

// Keep mode/task comparisons tolerant of the wire's kebab/snake aliases.  This
// local normalizer is intentionally dependency-free so candidate resolution
// cannot accidentally call a provider-specific helper (or an undefined symbol).
const normalizedMode = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "";

const CAMERA_INTENTS = new Set<NonNullable<VideoGenerationRecommendationInput["cameraIntent"]>>([
  "locked", "pan", "tilt", "dolly", "orbit", "handheld", "path",
]);

// 本文件是 `GENERATION_PLANNING_HINT_KEYS` 的唯一消费者：那张表列的就是下面
// `videoRecommendationInput` 从 `candidate.parameters` 里读走、且绝不上 wire 的那几个键。
// 两边的耦合由 `parameterAdmission.class.test.ts` **按行为**核（逐个键喂进去、看它有没有被读走），
// 不靠一个把常量再导出一遍的别名——那种断言比较的是它自己，永远绿。

export function videoRecommendationInput(candidate: PlanCandidate): VideoGenerationRecommendationInput | null {
  if (candidate.references.some((reference) => !reference.kind)) return null;
  const parameters = candidate.parameters;
  const durationSeconds = typeof parameters.duration === "number"
    ? parameters.duration
    : typeof parameters.durationSeconds === "number" ? parameters.durationSeconds : undefined;
  const aspectRatio = typeof parameters.aspectRatio === "string"
    ? parameters.aspectRatio
    : typeof parameters.aspect_ratio === "string" ? parameters.aspect_ratio
      : typeof parameters.size === "string" ? parameters.size : undefined;
  const quality = parameters.quality === "draft" || parameters.quality === "balanced" || parameters.quality === "final"
    ? parameters.quality
    : undefined;
  const cameraIntent = typeof parameters.cameraIntent === "string" && CAMERA_INTENTS.has(parameters.cameraIntent as NonNullable<VideoGenerationRecommendationInput["cameraIntent"]>)
    ? parameters.cameraIntent as NonNullable<VideoGenerationRecommendationInput["cameraIntent"]>
    : undefined;
  const goals: NonNullable<VideoGenerationRecommendationInput["goals"]> = {
    ...(typeof parameters.preserveCharacter === "boolean" ? { preserveCharacter: parameters.preserveCharacter } : {}),
    ...(typeof parameters.preserveTransition === "boolean" ? { preserveTransition: parameters.preserveTransition } : {}),
    ...(typeof parameters.useReferenceAudio === "boolean" ? { useReferenceAudio: parameters.useReferenceAudio } : {}),
    ...(typeof parameters.generate_audio === "boolean" ? { generateAudio: parameters.generate_audio } : {}),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(quality === undefined ? {} : { quality }),
  };
  return {
    prompt: candidate.prompt,
    references: candidate.references.map((reference) => ({ kind: reference.kind!, role: reference.role })),
    ...(cameraIntent === undefined ? {} : { cameraIntent }),
    ...(typeof parameters.preferredFamily === "string" ? { preferredFamily: parameters.preferredFamily } : {}),
    ...(Object.keys(goals).length === 0 ? {} : { goals }),
  };
}

export const normalizedModelIdentity = (value: string): string => value.trim().toLowerCase();

/**
 * P4 S2: a shot's duration estimate in seconds from its selected parameters, or undefined when it
 * cannot be honestly estimated (plan §9: "估不出的诚实标未知"). Reads the same duration keys the
 * recommendation input reads (duration / durationSeconds), so the estimate matches the sealed request.
 */
export function shotDurationSeconds(candidate: Pick<PlanCandidate, "parameters">): number | undefined {
  const parameters = candidate.parameters ?? {};
  if (typeof parameters.duration === "number" && Number.isFinite(parameters.duration) && parameters.duration >= 0) return parameters.duration;
  if (typeof parameters.durationSeconds === "number" && Number.isFinite(parameters.durationSeconds) && parameters.durationSeconds >= 0) return parameters.durationSeconds;
  return undefined;
}

/**
 * P4 S2: whether the selected video model exposes a reference-image channel (a mode slot that accepts
 * image references). Used to flag the "该模型认不了脸" degradation for character shots on models with
 * no image-reference slot. When the model is not a known video candidate we cannot prove absence, so we
 * assume support (no false degradation warning).
 */
const IMAGE_REFERENCE_SLOT_KINDS = new Set(["image_ref", "first_frame", "last_frame"]);

export function modelSupportsReferenceImage(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[] | undefined): boolean {
  const selected = candidates ? videoCandidateForPlan(candidate, candidates) : null;
  if (!selected) return true;
  return effectiveVideoModes(selected.videoCandidate).some((mode) => mode.slots.some((slot) => IMAGE_REFERENCE_SLOT_KINDS.has(slot.kind)));
}

/** P4 S2: whether the candidate carries a character reference (role=character), i.e. a face to preserve. */
export function candidateHasCharacterReference(candidate: PlanCandidate): boolean {
  return candidate.references.some((reference) => reference.role === "character");
}

/**
 * Keep recommendations anchored to the model the user currently selected in
 * the GUI/MCP plan. The catalog may contain aliases for a model family, so an
 * exact catalog key wins before falling back to source-declared identifiers.
 * If the selected model is not in the catalog yet (for example, a provider
 * fixture or a newly configured adapter), preserve the existing cross-catalog
 * fallback rather than making preview unusable.
 */
export function candidatesForCurrentVideoModel(
  candidate: PlanCandidate,
  candidates: readonly VideoModelCandidate[],
): readonly VideoModelCandidate[] {
  const providerCandidates = candidates.filter((item) => normalizedModelIdentity(item.provider) === normalizedModelIdentity(candidate.providerId));
  const modelId = normalizedModelIdentity(candidate.modelId);
  const variantsFor = (item: VideoModelCandidate) => item.archetype.variants ?? [];
  const variantForModelId = (item: VideoModelCandidate) => variantsFor(item).find((variant) =>
    normalizedModelIdentity(variant.modelKey) === modelId
      || (variant.identifierPatterns ?? []).some((identity) => normalizedModelIdentity(identity) === modelId),
  );
  const exactMatches = providerCandidates.filter((item) => normalizedModelIdentity(item.modelKey) === modelId || Boolean(variantForModelId(item)));
  const aliasMatches = providerCandidates.filter((item) => item.archetype.identifierPatterns
    .some((identity) => normalizedModelIdentity(identity) === modelId)
    || variantsFor(item).some((variant) => (variant.identifierPatterns ?? [])
      .some((identity) => normalizedModelIdentity(identity) === modelId)));
  const scoped = exactMatches.length > 0 ? exactMatches : aliasMatches;
  const selectedVariantId = (item: VideoModelCandidate): string | undefined => {
    const requested = typeof candidate.variantId === "string" ? candidate.variantId.trim() : "";
    const requestedCanonical = canonicalVideoVariantId(item.archetype, requested);
    return requestedCanonical || variantForModelId(item)?.id || item.variantId;
  };
  if (scoped.length > 0) return scoped.map((item) => ({ ...item, ...(selectedVariantId(item) ? { variantId: selectedVariantId(item) } : {}) }));
  return providerCandidates.length > 0 ? providerCandidates : candidates;
}

export function videoCandidateForPlan(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[]): { candidate: PlanCandidate; videoCandidate: VideoModelCandidate } | null {
  const provider = normalizedModelIdentity(candidate.providerId);
  const modelId = normalizedModelIdentity(candidate.modelId);
  const source = candidates.find((item) => normalizedModelIdentity(item.provider) === provider && (
    normalizedModelIdentity(item.modelKey) === modelId
      || (item.archetype.variants ?? []).some((variant) => normalizedModelIdentity(variant.modelKey) === modelId
        || (variant.identifierPatterns ?? []).some((identity) => normalizedModelIdentity(identity) === modelId))
  ));
  if (!source) return null;
  const inferredVariant = (source.archetype.variants ?? []).find((variant) => normalizedModelIdentity(variant.modelKey) === modelId
    || (variant.identifierPatterns ?? []).some((identity) => normalizedModelIdentity(identity) === modelId));
  const requested = typeof candidate.variantId === "string" ? candidate.variantId.trim() : "";
  const requestedCanonical = canonicalVideoVariantId(source.archetype, requested);
  if (requested && !requestedCanonical) {
    // 旧实现只说「Unknown video variant: X」——模型读完仍然不知道该填什么，于是下一轮换个名字再猜。
    // 拒绝必须自带出路（合法变体清单），与参数值层同一条纪律（`ParameterRejection`）。
    const allowedVariantIds = videoVariantIdsOf(source.archetype);
    throw new ContractCompilationError(
      `变体 ${requested} 不属于 ${candidate.providerId}/${candidate.modelId}。`
      + `该模型的变体：${allowedVariantIds.length ? allowedVariantIds.join("、") : "（这个模型没有变体，请不要传 variantId）"}。`,
      { code: "unknown_variant", path: "variantId", allowedVariantIds },
    );
  }
  const variantId = requestedCanonical ?? inferredVariant?.id ?? source.variantId ?? source.archetype.defaultVariantId;
  const baseModelId = source.archetype.catalogModelKey?.trim() || source.modelKey;
  return {
    candidate: { ...candidate, modelId: baseModelId, ...(variantId ? { variantId } : {}) },
    videoCandidate: { ...source, ...(variantId ? { variantId } : {}) },
  };
}

const normalizedTaskKind = (value: unknown): string => normalizedMode(value);

/**
 * Resolve the source-archetype mode without guessing a provider wire mode.
 * Several real models (Seedance, Wan, H3) expose multiple modes through the
 * same catalog task kind. A persisted `modeId` is authoritative; when older
 * drafts only carry the task kind, references/recommendation facts select a
 * mode. If the facts are insufficient we fail closed and ask for modeId.
 */
export function videoModeForPlan(candidate: PlanCandidate, videoCandidate: VideoModelCandidate): ArchetypeMode {
  const modes = effectiveVideoModes(videoCandidate);
  const requestedModeId = typeof candidate.modeId === "string" ? candidate.modeId.trim() : "";
  if (requestedModeId) {
    const mode = modes.find((item) => normalizedMode(item.id) === normalizedMode(requestedModeId));
    if (!mode) throw new Error(`Unknown video mode: ${candidate.modeId}`);
    const requestedTransport = normalizedTaskKind(candidate.mode);
    if (requestedTransport && requestedTransport !== normalizedMode(mode.id) && requestedTransport !== normalizedTaskKind(mode.transportTaskKind)) {
      throw new Error(`Video mode ${candidate.modeId} does not match transport task ${candidate.mode}`);
    }
    return mode;
  }

  const byId = modes.find((item) => normalizedMode(item.id) === normalizedMode(candidate.mode));
  if (byId) return byId;
  const byTask = modes.filter((item) => normalizedTaskKind(item.transportTaskKind) === normalizedTaskKind(candidate.mode));
  if (byTask.length === 1) return byTask[0]!;
  if (byTask.length === 0) throw new Error(`Video mode is unsupported: ${candidate.mode}`);

  // Legacy drafts may not have modeId. Use the same recommendation facts as
  // preview, but only among modes that actually share this transport task.
  const recommendationInput = videoRecommendationInput(candidate);
  if (recommendationInput) {
    const recommended = recommendVideoGeneration(recommendationInput, [videoCandidate]).recommendations;
    const selected = recommended.find((item) => byTask.some((mode) => normalizedMode(mode.id) === normalizedMode(item.modeId)));
    if (selected) return byTask.find((mode) => normalizedMode(mode.id) === normalizedMode(selected.modeId))!;
  }

  // A mode with no reference requirements is a safe default only when the
  // archetype explicitly declares it as the default for this task kind.
  const declaredDefault = modes.find((mode) => normalizedMode(mode.id) === normalizedMode(videoCandidate.archetype.defaultModeId)
    && byTask.includes(mode));
  if (declaredDefault) return declaredDefault;
  throw new Error(`Video task ${candidate.mode} has multiple modes; specify modeId`);
}

/** Exact provider wire model used by the existing catalog mappings. */
export function videoTransportModelIdForPlan(candidate: PlanCandidate, videoCandidate: VideoModelCandidate, mode: ArchetypeMode): string {
  const variantId = candidate.variantId ?? videoCandidate.variantId ?? videoCandidate.archetype.defaultVariantId;
  const variant = videoCandidate.archetype.variants?.find((item) => item.id === variantId);
  return variant?.modelKey?.trim() || mode.modelEnum?.trim() || videoCandidate.modelKey;
}

/** 档案控件声明过的数值范围——带过来，准入层才判得了「越界」（没声明就不判，不许现编一个范围）。 */
function controlBounds(control: ModelParameterControl): Pick<ParameterField, "min" | "max"> {
  return {
    ...(typeof control.min === "number" && Number.isFinite(control.min) ? { min: control.min } : {}),
    ...(typeof control.max === "number" && Number.isFinite(control.max) ? { max: control.max } : {}),
  };
}

function parameterFieldForControl(control: ModelParameterControl): ParameterField {
  if (control.type === "select") {
    const optionValues = control.options.map((option) => option.value);
    if (optionValues.length > 0 && optionValues.every((value) => typeof value === "string")) return { type: "enum", enum: optionValues };
    if (optionValues.length > 0 && optionValues.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return { type: "number", enum: optionValues };
    }
    if (optionValues.length > 0 && optionValues.every((value) => typeof value === "boolean")) {
      return { type: "boolean", enum: optionValues };
    }
    return { type: control.options.some((option) => typeof option.value === "number") ? "number" : "string" };
  }
  if (control.type === "number") return { type: "number", ...controlBounds(control) };
  if (control.type === "boolean") return { type: "boolean" };
  return { type: "string" };
}

export function videoParameterSchema(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[] | undefined): Record<string, ParameterField> | undefined {
  // 参数表与变体清单是同一次档案解析的两个产物，主人是 videoCompileOptions；这里只取其中一样。
  return videoCompileOptions(candidate, candidates).parameterSchema;
}

export function normalizeVideoCandidate(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[] | undefined): PlanCandidate {
  const selected = candidates ? videoCandidateForPlan(candidate, candidates) : null;
  if (!selected) return candidate;
  const mode = videoModeForPlan(selected.candidate, selected.videoCandidate);
  const transportModelId = videoTransportModelIdForPlan(selected.candidate, selected.videoCandidate, mode);
  return {
    ...selected.candidate,
    // Transport bucket comes from the one helper (vendor specialization > mode > archetype):
    // the same model identity is a single kie endpoint but a distinct Runway image endpoint.
    // Falls back to the plan's own declared mode when the archetype declares no transport.
    mode: modeTransportFor(mode, selected.videoCandidate.archetype, selected.videoCandidate.provider)
      ?? selected.candidate.mode,
    modeId: mode.id,
    transportModelId,
  };
}

/**
 * 就地清掉候选身上这个新模型不接受的参数，返回被清掉的键。
 *
 * 换模型/换模式会把上一个模型的参数原封不动带过来。这些残留过去靠准入层「静默丢弃」消化掉
 * ——那正是本刀要杀的行为。残留该在**换模型这一刻**由调用方清掉并如实上报（进 changeset），
 * 而不是让校验层装聋（P2：修在最早的共享边界，不在最后一道闸打补丁）。
 */
export function stripParametersNotAccepted(
  candidate: PlanCandidate,
  registry: { resolve(input: { moduleId: string; providerId: string; modelId: string; mode: string }): ResolvedModule },
  candidates: readonly VideoModelCandidate[] | undefined,
): string[] {
  // 「哪些键合法」读的就是准入层那一份 schema（video 档案投影优先，否则 registry 的那份）——
  // 清理与校验不许各答一次。新模型此刻解析不出来（目录里没有 / 模式不对）→ 什么都不清：
  // 那不是「参数残留」问题，交给准入层去报它自己的错，这里不抢着替它解释。
  let accepted: Record<string, ParameterField>;
  try {
    accepted = videoParameterSchema(candidate, candidates)
      ?? registry.resolve({
        moduleId: candidate.moduleId, providerId: candidate.providerId,
        modelId: candidate.modelId, mode: candidate.mode,
      }).parameterSchema;
  } catch {
    return [];
  }
  const cleared = Object.keys(candidate.parameters).filter((key) => !(key in accepted)).sort();
  if (cleared.length === 0) return cleared;
  candidate.parameters = Object.fromEntries(
    Object.entries(candidate.parameters).filter(([key]) => !cleared.includes(key)),
  );
  return cleared;
}

/**
 * 编译执行契约时该带的那两样：这个模型此刻的参数表，以及它声明过的变体清单。
 * 三个编译点（单镜 preview / 单镜 gate_request / 多镜 seal）共用这一处，
 * 免得「preview 核了变体、gate 没核」这种两道闸不一致。
 */
export function videoCompileOptions(
  candidate: PlanCandidate,
  candidates: readonly VideoModelCandidate[] | undefined,
): ExecutionContractCompileOptions {
  // 一次解析出这个候选对应的视频档案，参数表与变体清单都从它来。认不出这个模型
  // （非视频模型 / 尚未接入）→ 两样都省略：那是**这条路拿不到清单**，不是「随便填都行」。
  const selected = candidates ? videoCandidateForPlan(candidate, candidates) : null;
  if (!selected) return {};
  return {
    parameterSchema: Object.fromEntries(
      videoModeForPlan(selected.candidate, selected.videoCandidate).params
        .map((control) => [control.key, parameterFieldForControl(control)]),
    ),
    allowedVariantIds: videoVariantIdsOf(selected.videoCandidate.archetype),
  };
}
