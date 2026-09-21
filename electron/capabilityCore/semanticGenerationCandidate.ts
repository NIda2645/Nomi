import { GENERATION_ARGUMENT_REFUSAL, refuseToModel } from "./transportFailure";
import type { GenerationDefaultTaskKind } from "../settings/generationModelDefaultsContract";
import type { PlanCandidate } from "./executionContract";

/**
 * The model-facing create tool intentionally accepts a short, natural request
 * (`{ prompt: "..." }`).  This module turns that request into the same
 * validated PlanCandidate used by the explicit candidate path.  Keeping this
 * boundary separate prevents the MCP handler from growing a second parser or
 * a provider-specific selection algorithm.
 */

export type SemanticGenerationCandidateParams = Readonly<Record<string, unknown>>;

export type SemanticGenerationDefault = Readonly<{
  moduleId: string;
  providerId: string;
  modelId: string;
  mode: string;
  modeId?: string;
  variantId?: string;
}>;

export type SemanticGenerationCandidateDeps = Readonly<{
  operationId: string;
  params: SemanticGenerationCandidateParams;
  candidateFrom: (value: unknown) => PlanCandidate;
  defaultModelForTaskKind?: (taskKind: GenerationDefaultTaskKind) => SemanticGenerationDefault | undefined;
  /** Structural snapshot only; the handler may expose a registry without a snapshot in tests. */
  registry?: { snapshot?: () => readonly unknown[] };
  /**
   * Test-only escape hatch for isolated registry fixtures. Production callers
   * must resolve the user's saved Workbench default (or pass an explicit
   * model); silently picking the first catalog row is not an acceptable user
   * experience or spend policy.
   */
  allowRegistryFallback?: boolean;
  /**
   * assetId → 可引用身份（内容哈希 + 版本）。生产装配点绑 `resolveProjectAssetReferenceIdentity`
   * 并把 projectId 闭进去。未注入 = 只接受已经带着身份来的参考（逐字节等同接线前），缺身份的当场
   * 拿到人话拒绝，而不是候选 schema 的 `Required`。
   */
  resolveAssetReferenceIdentity?: ResolveAssetReferenceIdentity;
}>;

/** 一份素材的可引用身份。真解析器住 `electron/assets/projectAssetStore.ts`（全仓唯一算它的地方）。 */
export type ResolveAssetReferenceIdentity = (assetId: string) => Readonly<{ contentHash: string; version: number }> | undefined;

const TASK_KINDS = new Set<GenerationDefaultTaskKind>([
  "text_to_image",
  "image_edit",
  "text_to_video",
  "image_to_video",
]);

/**
 * Long-form intent is deliberately derived from the user's goal, not from a
 * provider parameter. `parameters.duration` is usually the duration of one
 * provider clip (for example 5 seconds), so treating it as the requested
 * movie length would silently turn every short video into a storyboard.
 */
const VIDEO_INTENT = /(视频|短片|镜头|分镜|动画|成片|video|clip|film|animate|motion)/i;
const LONG_FORM_TERMS = /(长视频|长片|完整视频|成片|多镜|分镜|剧本|广告片|宣传片|纪录片|long[-\s]?form|feature[-\s]?length|multi[-\s]?shot|storyboard)/i;
const DURATION_TOKEN = /(\d+(?:\.\d+)?)\s*(小时|小時|h(?:ours?)?|分钟|分|min(?:ute)?s?|秒|s(?:ec(?:ond)?s?)?)/iu;

/** Parse a total video duration stated in a natural-language goal. */
export function requestedVideoDurationSeconds(params: SemanticGenerationCandidateParams): number | undefined {
  const explicit = [params.totalDurationSeconds, params.targetDurationSeconds].find((value) =>
    typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (typeof explicit === "number") return explicit;
  const prompt = [params.prompt, params.scriptText, params.goal]
    .map(text)
    .find((value) => value.length > 0) ?? "";
  const match = prompt.match(DURATION_TOKEN);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2].toLowerCase();
  if (unit === "小时" || unit === "小時" || unit.startsWith("h")) return amount * 3_600;
  if (unit === "分钟" || unit === "分" || unit.startsWith("min")) return amount * 60;
  return amount;
}

/**
 * Decide whether a natural create must enter the storyboard/multi-shot path.
 * A minute-scale duration or an explicit long-form/storyboard term is enough;
 * ordinary 3–30 second clips remain the compact single-shot path.
 */
export function isLongFormGenerationRequest(params: SemanticGenerationCandidateParams): boolean {
  const explicitTaskKind = normalized(params.taskKind);
  if (explicitTaskKind === "text_to_image" || explicitTaskKind === "image_edit") return false;
  const prompt = [params.prompt, params.scriptText, params.goal]
    .map(text)
    .find((value) => value.length > 0) ?? "";
  const video = explicitTaskKind === "text_to_video" || explicitTaskKind === "image_to_video" || VIDEO_INTENT.test(prompt);
  if (!video) return false;
  const duration = requestedVideoDurationSeconds(params);
  return (duration !== undefined && duration >= 60) || LONG_FORM_TERMS.test(prompt);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown): string {
  return text(value).toLowerCase().replace(/[-\s]/g, "_");
}

function isTaskKind(value: unknown): value is GenerationDefaultTaskKind {
  return typeof value === "string" && TASK_KINDS.has(value as GenerationDefaultTaskKind);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) refuseToModel(GENERATION_ARGUMENT_REFUSAL, `${label} must be an object`);
  return { ...(value as Record<string, unknown>) };
}

/**
 * 参考素材：模型给的是 `assetId`，**身份由宿主补**。
 *
 * 2026-09-18 根因：以前这里只是原样拷一遍，于是缺 `contentHash`/`version` 的那条直接撞上候选
 * schema 的 `Required`——而那两个字段模型根本拿不到。已经带着身份来的（外部宿主、面板自己那条路）
 * 逐字节不变；缺身份又没接解析器时，报的是人话而不是一个模型看不懂的字段名。
 */
/**
 * 一条参考素材的身份补齐。**全仓唯一的那一份**。
 *
 * 2026-09-22 之前这条规则有两份实现：create 走这里，patch 走 `mcpGenerationTools.pinReference`——
 * 逐字一样的两段，连那句中文提示都抄了一遍。它们一起被 adapter 的兜底吃掉时，我只改了其中一份，
 * 回归测试当场报出另一份还在（这正是「同一个语义有几份定义」那一族缺陷的长相）。现在 patch 那条
 * 调的就是这个函数，改措辞只有一个地方。
 */
export function pinAssetReference(item: unknown, resolve?: ResolveAssetReferenceIdentity): unknown {
  if (!item || typeof item !== "object") return item;
  const reference = { ...(item as Record<string, unknown>) };
  if (typeof reference.contentHash === "string" && reference.contentHash && reference.version !== undefined) return reference;
  const assetId = text(reference.assetId);
  if (!assetId) refuseToModel(GENERATION_ARGUMENT_REFUSAL, "参考素材需要 assetId（来自 look_at_media）");
  const identity = resolve?.(assetId);
  if (!identity) {
    // 模型最常见的两种错法，分开说：给了一个**镜头 id**（说明书曾经说这里收镜头 id，见 writeVerbs 的
    // `references`），和给了一个**根本不在库里的 assetId**。两种的下一步不一样，合成一句话等于两种都没说清。
    refuseToModel(GENERATION_ARGUMENT_REFUSAL, /^(gen-v2-|shot-)/.test(assetId)
      ? `${assetId} 看起来是画布上的一个镜头/节点 id，不是素材库里的文件。references 只收 look_at_media 给出的 assetId；要复用另一镜的形象，把它写进 storyboard.anchorIds。`
      : `参考素材 ${assetId} 不在这个项目的素材库里，请先用 look_at_media 找到它的 assetId`);
  }
  return { ...reference, contentHash: identity.contentHash, version: identity.version };
}

function references(value: unknown, resolve?: ResolveAssetReferenceIdentity): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) refuseToModel(GENERATION_ARGUMENT_REFUSAL, "references must be an array of asset ids.");
  return value.map((item) => pinAssetReference(item, resolve));
}

/** Infer only the semantic task family; model/mode selection remains catalog-owned. */
export function inferGenerationTaskKind(params: SemanticGenerationCandidateParams): GenerationDefaultTaskKind {
  const explicit = params.taskKind;
  if (explicit !== undefined) {
    if (!isTaskKind(explicit)) refuseToModel(GENERATION_ARGUMENT_REFUSAL, "taskKind must be text_to_image, image_edit, text_to_video or image_to_video");
    return explicit;
  }
  const mode = normalized(params.mode);
  if (isTaskKind(mode)) return mode;
  const prompt = text(params.prompt).toLowerCase();
  const hasReferences = Array.isArray(params.references) && params.references.length > 0;
  const videoIntent = /(视频|短片|镜头|分镜|动画|video|clip|film|animate|motion)/i.test(prompt);
  if (videoIntent) return hasReferences ? "image_to_video" : "text_to_video";
  return hasReferences ? "image_edit" : "text_to_image";
}

function modeFromSnapshot(
  deps: SemanticGenerationCandidateDeps,
  selected: SemanticGenerationDefault,
  taskKind: GenerationDefaultTaskKind,
): string {
  const manifests = deps.registry?.snapshot?.() ?? [];
  const manifest = manifests.find((item): item is { moduleId: string; modes?: readonly unknown[]; providers?: readonly unknown[] } =>
    Boolean(item && typeof item === "object" && (item as { moduleId?: unknown }).moduleId === selected.moduleId));
  const providers = Array.isArray(manifest?.providers) ? manifest.providers : [];
  const provider = providers.find((item): item is { providerId: string; models?: readonly unknown[] } =>
    Boolean(item && typeof item === "object" && (item as { providerId?: unknown }).providerId === selected.providerId));
  const models = Array.isArray(provider?.models) ? provider.models : [];
  const model = models.find((item): item is { modelId: string; modes?: readonly unknown[] } =>
    Boolean(item && typeof item === "object" && (item as { modelId?: unknown }).modelId === selected.modelId));
  const modelModes = Array.isArray(model?.modes) ? model.modes.filter((mode): mode is string => typeof mode === "string") : [];
  const manifestModes = Array.isArray(manifest?.modes) ? manifest.modes.filter((mode): mode is string => typeof mode === "string") : [];
  const wanted = normalized(selected.mode) || normalized(taskKind);
  const declared = modelModes.find((mode) => normalized(mode) === wanted)
    ?? modelModes.find((mode) => normalized(mode) === normalized(taskKind))
    ?? manifestModes.find((mode) => normalized(mode) === wanted)
    ?? manifestModes.find((mode) => normalized(mode) === normalized(taskKind));
  return declared ?? selected.mode;
}

function fallbackFromSnapshot(
  deps: SemanticGenerationCandidateDeps,
  taskKind: GenerationDefaultTaskKind,
): SemanticGenerationDefault | undefined {
  for (const manifest of deps.registry?.snapshot?.() ?? []) {
    if (!manifest || typeof manifest !== "object") continue;
    const moduleId = text((manifest as { moduleId?: unknown }).moduleId);
    const providers = (manifest as { providers?: unknown }).providers;
    if (!moduleId || !Array.isArray(providers)) continue;
    for (const provider of providers) {
      if (!provider || typeof provider !== "object") continue;
      const providerId = text((provider as { providerId?: unknown }).providerId);
      const models = (provider as { models?: unknown }).models;
      if (!providerId || !Array.isArray(models)) continue;
      const model = models.find((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        const modes = (candidate as { modes?: unknown }).modes;
        return Array.isArray(modes) && modes.some((mode) => normalized(mode) === normalized(taskKind));
      }) as { modelId?: unknown; modes?: unknown } | undefined;
      if (model) {
        const modes = Array.isArray(model.modes) ? model.modes.filter((candidate): candidate is string => typeof candidate === "string") : [];
        const mode = modes.find((candidate) => normalized(candidate) === normalized(taskKind)) ?? modes[0];
        const modelId = text(model.modelId);
        if (mode && modelId) return { moduleId, providerId, modelId, mode };
      }
    }
  }
  return undefined;
}

/**
 * 显式点名的模型在目录里属于谁。Agent 照 `list_models` 给出 `modelKey`（宿主面 `modelId`）时，providerId/moduleId
 * 本来就是目录里那一行的事实，不该要求用户另外「保存过默认模型」才能带出来（2026-09-18 金路径真机红：
 * 三镜都指名了图片模型，宿主仍答「没有配置可用的图片模型」）。只认目录里真有的行：查不到就返回
 * undefined，让下面那条拒绝照旧成立——绝不替它编一个供应商。给了 providerId 就只在那家里找。
 */
function identityForNamedModel(
  deps: SemanticGenerationCandidateDeps,
  modelId: string,
  providerId: string,
  taskKind: GenerationDefaultTaskKind,
): SemanticGenerationDefault | undefined {
  let loose: SemanticGenerationDefault | undefined;
  for (const manifest of deps.registry?.snapshot?.() ?? []) {
    if (!manifest || typeof manifest !== "object") continue;
    const moduleId = text((manifest as { moduleId?: unknown }).moduleId);
    const providers = (manifest as { providers?: unknown }).providers;
    if (!moduleId || !Array.isArray(providers)) continue;
    for (const provider of providers) {
      if (!provider || typeof provider !== "object") continue;
      const candidateProviderId = text((provider as { providerId?: unknown }).providerId);
      if (!candidateProviderId || (providerId && candidateProviderId !== providerId)) continue;
      const models = (provider as { models?: unknown }).models;
      if (!Array.isArray(models)) continue;
      const model = models.find((candidate) => candidate && typeof candidate === "object" && text((candidate as { modelId?: unknown }).modelId) === modelId) as { modes?: unknown } | undefined;
      if (!model) continue;
      const modes = Array.isArray(model.modes) ? model.modes.filter((candidate): candidate is string => typeof candidate === "string") : [];
      const mode = modes.find((candidate) => normalized(candidate) === normalized(taskKind));
      const identity = { moduleId, providerId: candidateProviderId, modelId, mode: mode ?? modes[0] ?? taskKind };
      // 声明了这个任务模式的那一行优先；同名模型别家只声明了别的模式时才退到它（仍是目录事实）。
      if (mode) return identity;
      loose ??= identity;
    }
  }
  return loose;
}

/**
 * Build the canonical candidate for a short semantic create request.  An
 * explicit `candidate` is still authoritative and is parsed unchanged; the
 * short path only fills omitted identity fields from saved Workbench defaults
 * or the live module registry.
 */
export function semanticCandidateFromParams(deps: SemanticGenerationCandidateDeps): PlanCandidate {
  if (deps.params.candidate !== undefined) {
    // 显式候选也走同一条参考解析：否则「给了 candidate」这条路又变成一份不补身份的平行版（P1）。
    const explicit = record(deps.params.candidate, "candidate");
    return deps.candidateFrom(explicit.references === undefined
      ? explicit
      : { ...explicit, references: references(explicit.references, deps.resolveAssetReferenceIdentity) });
  }
  const prompt = text(deps.params.prompt);
  if (!prompt) refuseToModel(GENERATION_ARGUMENT_REFUSAL, "prompt is required when candidate is omitted");

  const taskKind = inferGenerationTaskKind(deps.params);
  const configured = deps.defaultModelForTaskKind?.(taskKind);
  // A production semantic request must never infer a spend-bearing model from
  // catalog row order. The only implicit identity is the saved Workbench
  // default; registry fallback is opt-in for no-provider unit fixtures only.
  const fallback = configured ?? (deps.allowRegistryFallback ? fallbackFromSnapshot(deps, taskKind) : undefined);
  // 显式点名的模型：它的供应商/模块是目录事实，从目录里取；只有没点名时才落到保存的默认。
  const namedModelId = text(deps.params.modelId);
  const named = namedModelId && (!text(deps.params.providerId) || !text(deps.params.moduleId))
    ? identityForNamedModel(deps, namedModelId, text(deps.params.providerId), taskKind)
    : undefined;
  const moduleId = text(deps.params.moduleId) || named?.moduleId || fallback?.moduleId;
  const providerId = text(deps.params.providerId) || named?.providerId || fallback?.providerId;
  const modelId = namedModelId || fallback?.modelId;
  if (!moduleId || !providerId || !modelId) {
    // 这句话有两个读者，得同时说得通（2026-09-18 真机实测）：用户能去设置里选，**而 Agent 不能**。
    // 只写「请先在设置中选择模型」时，DeepSeek 连着调了 6 次 `draft_shots`、每次收到同一句话，
    // 它看得见 `list_models` 里那个能用的模型却不知道自己可以点名它——一条本可恢复的路被说成了死路。
    const kind = taskKind.includes("video") ? "视频" : "图片";
    refuseToModel(GENERATION_ARGUMENT_REFUSAL, `没有配置可用的${kind}模型。请在设置里选一个默认${kind}模型；`
      + `或者在这次调用里直接点名要用的模型（candidate: { providerId, modelId }，取自 list_models）。`);
  }
  // A saved mode/variant belongs to the saved provider+model identity.  If the
  // user explicitly chooses another model, carrying those fields across can
  // silently select an incompatible transport variant (or fail much later at
  // provider execution).  Only inherit the fallback's mode metadata when the
  // effective identity is still the fallback identity.
  const fallbackIdentityMatches = Boolean(fallback)
    && providerId === fallback?.providerId
    && modelId === fallback?.modelId;
  const selectedMode = text(deps.params.mode) || (fallbackIdentityMatches ? fallback?.mode : undefined) || taskKind;
  const selectedModeId = text(deps.params.modeId) || (fallbackIdentityMatches ? fallback?.modeId : undefined);
  const selectedVariantId = text(deps.params.variantId) || (fallbackIdentityMatches ? fallback?.variantId : undefined);
  const selected: SemanticGenerationDefault = {
    moduleId,
    providerId,
    modelId,
    mode: selectedMode,
    ...(selectedModeId ? { modeId: selectedModeId } : {}),
    ...(selectedVariantId ? { variantId: selectedVariantId } : {}),
  };
  const mode = modeFromSnapshot(deps, selected, taskKind);
  return deps.candidateFrom({
    candidateId: `cand-${deps.operationId}`,
    revision: 1,
    moduleId: selected.moduleId,
    providerId: selected.providerId,
    modelId: selected.modelId,
    mode,
    ...(selected.modeId ? { modeId: selected.modeId } : {}),
    ...(selected.variantId ? { variantId: selected.variantId } : {}),
    prompt,
    parameters: record(deps.params.parameters, "parameters"),
    references: references(deps.params.references, deps.resolveAssetReferenceIdentity),
  });
}
