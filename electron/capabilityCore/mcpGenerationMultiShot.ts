import type { PlanAnchor, PlanShot } from '../shared/storyboard/storyboardPlan';
import { generationTaskReference } from '../shared/agentCapabilities/taskReference';
import { storyboardContentToken, storyboardSubjectFromCandidate, patchStoryboardSubject, storyboardReferenceSlot } from '../shared/storyboard/generationPlanEditorial';
import { resolveGenerationShotScope } from '../shared/agentCapabilities/generationShotScope';
import { storyboardAuthorFieldsSchema, type StoryboardAuthorFields } from '../shared/agentCapabilities/generationPlanSchemas';
import type { GenerationPlanEditorial } from '../shared/storyboard/generationPlanEditorial';
// 能力核 · P4 S6.5 语义多镜 create 入口逻辑（从 mcpGenerationTools.ts 抽出，守 800 行门岗 R9）。
//
// 这份文件是「语义多镜生产入口」的单一职责家：把 `nomi_operation_create` 收到的 `shots`（client 逐镜计划）
// 或 `scriptText`（剧本，经 planStoryboard 拟镜）解析成草稿 shots；gate_request 时把草稿 shots 编译成逐镜
// 子合同 + planHash + shotPrices 的密封包（reducer 冻结整批 + seal 时硬上限）。纯逻辑 + 一个工厂（注入 deps
// 与共享函数），不碰 electron。mcpGenerationTools.ts 单向 import 本模块（无环）。
//
// P1：单镜 create/seal 路径不经本模块（handler 里 shots/scriptText 都缺省时直接走旧单镜路径，逐字节等同）。

import crypto from "node:crypto";

import { compileExecutionContract, type ExecutionContractV1, type PlanCandidate } from "./executionContract";
import type { ModuleRegistry } from "./moduleRegistry";
import type { ParameterField } from "./moduleManifest";
import type { VideoModelCandidate } from "../shared/videoCapabilities/recommendation";
import { SINGLE_SHOT_GENERATION_MODULE_ID } from "../shared/generationModuleId";
import { generationShotEnvelopeOf, type GenerationShotEnvelope } from "../shared/generationShotEnvelope";
import type { GenerationDefaultTaskKind } from "../settings/generationModelDefaultsContract";
import {
  isLongFormGenerationRequest,
  requestedVideoDurationSeconds,
  semanticCandidateFromParams,
  type SemanticGenerationCandidateDeps,
} from "./semanticGenerationCandidate";
import type { ShotPrice } from "../productionRun/shotPricing";

/**
 * P4 S6.5 生产入口: a draft shot the multi-shot `create` entrance persists (candidate/role/included;
 * NO sub-contract — that is compiled at seal). This is what `plan`/`scriptText` create produces per shot.
 */
export type GenerationOperationDraftShot = Readonly<{
  shotId: string;
  role?: "anchor" | "shot";
  included?: boolean;
  /**
   * 模型拟的短标题。放在**信封**上而不是候选里：候选是「发给供应商的那一份」，标题一个字都不进
   * provider 请求；它是给人看的，随镜头走、改模型不丢。
   */
  title?: string;
  candidate: PlanCandidate;
  storyboard?: StoryboardAuthorFields;
}>;

/** A sealed shot within the multi-shot bundle (candidate + its compiled sub-contract). */
export type SealedMultiShotEntry = Readonly<{
  shotId: string;
  role?: "anchor" | "shot";
  included?: boolean;
  /** 模型拟的短标题（给人看，不进 provider 请求）。见 GenerationOperationDraftShot.title。 */
  title?: string;
  candidate: PlanCandidate;
  contract?: ExecutionContractV1;
}>;

/**
 * P4 S6.5: the sealed multi-shot bundle the handler hands the store at gate_request. Each included shot
 * carries its compiled sub-contract (its candidate.sealedContractHash matches, per reducer validation);
 * `planHash` freezes the whole batch; `shotPrices` (S2 derived) drives the reducer's seal-time hard cap.
 */
export type GenerationSealMultiShot = Readonly<{
  shots: ReadonlyArray<SealedMultiShotEntry>;
  planHash: string;
  // Shape matches the reducer's shotPricesFrom: [{ shotId, price: ShotPrice }].
  // ShotPrice is the canonical honest-unknown union (never a fabricated 0), shared with the
  // paid-gate precheck so assertKnownShotPrice can narrow it at the seal boundary.
  shotPrices?: ReadonlyArray<{ shotId: string; price: ShotPrice }>;
}>;

/**
 * P4 S6.5: what the storyboard planner returns for a `scriptText` create. Each shot is a partial candidate
 * declaration (the handler fills module/provider/model defaults + normalizes it into a full PlanCandidate).
 */
export type StoryboardShotDraft = Readonly<{
  shotId?: string;
  role?: "anchor" | "shot";
  included?: boolean;
  prompt: string;
  /** Planned duration for this provider clip (seconds). A long-form planner
   * must carry this through to the sealed candidate instead of pretending a
   * single provider clip can represent the whole requested movie. */
  durationSeconds?: number;
  moduleId?: string;
  providerId?: string;
  modelId?: string;
  mode?: string;
  modeId?: string;
  variantId?: string;
  parameters?: Record<string, unknown>;
  references?: ReadonlyArray<{ assetId: string; contentHash: string; version: number; kind?: "image" | "video" | "audio"; role?: "character" | "first_frame" | "last_frame" | "reference" | "audio" }>;
}>;

export type StoryboardPlanResult = Readonly<{
  shots: ReadonlyArray<StoryboardShotDraft>;
  /** Echo the requested total when the planner was given one. */
  targetDurationSeconds?: number;
}>;

const SHOT_ROLES = new Set(["anchor", "shot"]);

/** P4 S6.5: validate a shot's role/included/shotId envelope. Shared by the `plan` and `scriptText` paths. */
function shotEnvelope(raw: Record<string, unknown>, index: number, fallbackId: string): GenerationShotEnvelope {
  const rawShotId = typeof raw.shotId === "string" ? raw.shotId.trim() : "";
  const shotId = rawShotId || fallbackId;
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(shotId)) throw new Error(`Invalid shot id at ${index}`);
  const role = raw.role;
  if (role !== undefined && !SHOT_ROLES.has(String(role))) throw new Error(`Invalid shot role at ${index}`);
  const included = raw.included;
  if (included !== undefined && typeof included !== "boolean") throw new Error(`Invalid shot included flag at ${index}`);
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  if (rawTitle.length > 120) throw new Error(`Shot title at ${index} is longer than 120 characters`);
  return {
    shotId,
    ...(role === undefined ? {} : { role: role as "anchor" | "shot" }),
    ...(included === undefined ? {} : { included }),
    ...(rawTitle ? { title: rawTitle } : {}),
  };
}

/** Injected candidate parsers (they live in mcpGenerationTools and are also used by the single-shot path). */
export type MultiShotCandidateParsers = {
  candidateFrom: (value: unknown) => PlanCandidate;
  record: (value: unknown, label: string) => Record<string, unknown>;
};

/**
 * P4 §5.1.4 锚复用入口的**授权面守门**：一个 candidate 的参考素材（复用锚 = 已有资产作 character 参考）必须
 * **存在于本项目且属于本项目**。`candidateFrom` 只做结构校验（assetId 是串…），不认「这资产真在这项目里吗」——
 * 外来/不存在的 assetId 会被静默放行、编进子合同、发给 provider（对抗矩阵 #3）。这个可选注入把「归属」这层补上：
 * App 层用真解析器（查 listProjectAssets / Run 自有 artifacts）接线；抛人话 Error 即拒。未注入 = 逐字节等同今天
 * （不给不 seed 资产的老测试/路径强加依赖）。纯契约（不耦合 projectAssetStore），本模块保持不碰 electron。
 */
export type AssertReferencesResolvable = (projectId: string, references: ReadonlyArray<PlanCandidate["references"][number]>) => void;

/**
 * P4 S6.5 `plan` 入口: parse one client-supplied shot into a draft shot.
 *
 * 一个镜可以**整只给 candidate**（PlanCandidate 原样，历史写法），也可以像单镜 create 那样只给语义字段
 * （`prompt` + 可选 `taskKind`/`modelId`/`modeId`/`parameters`/`references`）。两者都走
 * `semanticCandidateFromParams` ——它自己第一行就是「给了 candidate 就原样解析」，所以显式候选那条路逐字节
 * 不变；缺候选时由它按用户保存的默认模型合成，和单镜 create 同一台合成器、同一条报错。
 *
 * 为什么必须两种都收：单镜路早就修过这个毛病（`mcpGenerationTools.ts` 单镜分支的注释原话——「让模型不必去
 * 发明内部 candidate ID 和供应商接线，**之前的行为表现为一次假拒绝**」），但只修了 N=1 那个 arity。N≥2 这条
 * 仍然硬要 `candidate`，于是 lane 上的 `draft_shots` 一到多镜就被 zod 以 `Required` 拒掉——同一份镜头描述，
 * 一个镜收、两个镜拒。这里把那条不对称删掉，而不是再长一台合成器（P1）。
 *
 * `semantic` 不注入时行为仍然安全：显式 candidate 照常过，缺候选的镜头拿到人话「没有配置可用的模型」，
 * 而不是 zod 的 `Required`。
 *
 * 走同一台合成器还带来第二件事（2026-09-18 另一份根因合同的原话）：它「显式身份不借用默认模型的 mode」
 * 那条纪律，多镜路逐字继承——不是靠这里再抄一遍。
 */
export function draftShotFromPlan(
  value: unknown,
  index: number,
  parsers: MultiShotCandidateParsers,
  semantic?: Pick<SemanticGenerationCandidateDeps, "defaultModelForTaskKind" | "registry" | "allowRegistryFallback" | "resolveAssetReferenceIdentity">,
): GenerationOperationDraftShot {
  const raw = parsers.record(value, `generation shot ${index}`);
  const authored = raw.storyboard === undefined ? undefined : storyboardAuthorFieldsSchema.parse(raw.storyboard);
  const env = shotEnvelope(raw,index,`shot-${index+1}`);
  const candidate = semanticCandidateFromParams({
    // 逐镜 candidateId 跟着 shotId 走（与 `draftShotFromStoryboard` 同一约定），草稿改一镜不动其它镜。
    operationId: env.shotId,
    params: raw,
    candidateFrom: parsers.candidateFrom,
    ...(semantic?.defaultModelForTaskKind ? { defaultModelForTaskKind: semantic.defaultModelForTaskKind } : {}),
    ...(semantic?.registry ? { registry: semantic.registry } : {}),
    ...(semantic?.allowRegistryFallback ? { allowRegistryFallback: semantic.allowRegistryFallback } : {}),
    ...(semantic?.resolveAssetReferenceIdentity ? { resolveAssetReferenceIdentity: semantic.resolveAssetReferenceIdentity } : {}),
  });
  return { ...env, candidate, ...(authored ? { storyboard: authored } : {}) };
}

/**
 * P4 S6.5 `scriptText` 入口: turn a planner shot draft into a full draft shot. The planner gives a prompt
 * (+ optional model/mode/refs); the handler fills module/provider/model defaults from the first configured
 * video candidate (single-provider v1 = APIMart). candidateId/revision are synthesized (draft-stable).
 */
export function draftShotFromStoryboard(draft: StoryboardShotDraft, index: number, defaults: () => { moduleId: string; providerId: string; modelId: string; mode: string; modeId?: string }, parsers: MultiShotCandidateParsers): GenerationOperationDraftShot {
  const raw = draft as Record<string, unknown>;
  const env = shotEnvelope(raw, index, `shot-${index + 1}`);
  if (typeof draft.prompt !== "string" || !draft.prompt.trim()) throw new Error(`Storyboard shot ${index} needs a prompt`);
  if (draft.durationSeconds !== undefined
    && (!Number.isFinite(draft.durationSeconds) || draft.durationSeconds <= 0)) {
    throw new Error(`Storyboard shot ${index} has an invalid duration`);
  }
  // Resolve module/provider/model/mode defaults lazily — only when the planner left a field unset, so a
  // fully-specified board never requires a configured video model just to build defaults it won't use.
  const needsDefaults = draft.moduleId === undefined || draft.providerId === undefined || draft.modelId === undefined || draft.mode === undefined;
  const fallback = needsDefaults ? defaults() : { moduleId: "", providerId: "", modelId: "", mode: "" };
  const selectedModeId = draft.modeId ?? fallback.modeId;
  const candidate = parsers.candidateFrom({
    candidateId: `cand-${env.shotId}`,
    revision: 1,
    moduleId: draft.moduleId ?? fallback.moduleId,
    providerId: draft.providerId ?? fallback.providerId,
    modelId: draft.modelId ?? fallback.modelId,
    ...(selectedModeId ? { modeId: selectedModeId } : {}),
    ...(draft.variantId ? { variantId: draft.variantId } : {}),
    mode: draft.mode ?? fallback.mode,
    prompt: draft.prompt,
    parameters: {
      ...(draft.parameters ?? {}),
      // `durationSeconds` is a planner-level name; provider contracts use the
      // canonical `duration` field. An explicitly supplied parameter remains
      // authoritative and is validated by the selected model schema at seal.
      ...(draft.durationSeconds !== undefined
        && (draft.parameters?.duration === undefined && draft.parameters?.durationSeconds === undefined)
        ? { duration: draft.durationSeconds }
        : {}),
    },
    references: draft.references ?? [],
  });
  return { ...env, candidate };
}

/** The shared derivations the multi-shot factory needs (all pure, all single source of truth from S2/S4). */
export type MultiShotHelperDeps = {
  /** `resolve` 是密封期用的；`snapshot` 是语义合成期用的（缺省即不做目录兜底）。 */
  registry: Pick<ModuleRegistry, "resolve"> & Partial<Pick<ModuleRegistry, "snapshot">>;
  videoModelCandidates?: readonly VideoModelCandidate[];
  planStoryboard?: (input: {
    projectId: string;
    scriptText: string;
    /** Present when a natural-language goal was promoted to a long-form plan. */
    minimumShots?: number;
    /** Total duration parsed from the user's goal, when it was explicit. */
    targetDurationSeconds?: number;
  }) => StoryboardPlanResult | Promise<StoryboardPlanResult>;
  parsers: MultiShotCandidateParsers;
  normalizeVideoCandidate: (candidate: PlanCandidate) => PlanCandidate;
  videoParameterSchema: (candidate: PlanCandidate) => Record<string, ParameterField> | undefined;
  priceForCandidate: (candidate: PlanCandidate) => ShotPrice;
  effectiveVideoModes: (candidate: VideoModelCandidate) => Array<{ id?: string; transportTaskKind?: string }>;
  /**
   * Saved Workbench model preferences projected into the semantic planner.
   * Optional for isolated legacy fixtures; production wiring always supplies
   * the catalog-backed resolver so scriptText never silently picks row zero.
   */
  defaultModelForTaskKind?: (taskKind: GenerationDefaultTaskKind) => {
    moduleId: string;
    providerId: string;
    modelId: string;
    mode: string;
    modeId?: string;
  } | undefined;
  /** Unit-fixture escape hatch only; production requires a saved default or
   * explicit per-shot model identity. */
  allowRegistryFallback?: boolean;
  /** P4 §5.1.4: 校验复用锚（references）存在且属于本项目。未注入 = 不校验（向后兼容）。 */
  assertReferencesResolvable?: AssertReferencesResolvable;
  /** assetId → 可引用身份。与单镜路同一台解析器；未注入 = 只收已经带身份的参考。 */
  resolveAssetReferenceIdentity?: (projectId: string, assetId: string) => Readonly<{ contentHash: string; version: number }> | undefined;
};

/** Minimal operation shape the seal helper reads (avoids importing the full GenerationOperation type). */
type OperationWithShots = { candidate?: PlanCandidate; editorial?: GenerationPlanEditorial; shots?: ReadonlyArray<GenerationOperationDraftShot> };

/**
 * P4 S6.5: build the multi-shot create/seal helpers bound to `deps`. `resolveCreateShots` turns a create's
 * `shots`/`scriptText` into draft shots; `sealMultiShotFor` compiles the sealed bundle at gate_request.
 * Extracted from the handler closure to keep mcpGenerationTools.ts under the 800-line shell gate (R9).
 */
export function createMultiShotCreateHelpers(deps: MultiShotHelperDeps) {
  const storyboardDefaults = (taskKind: GenerationDefaultTaskKind): { moduleId: string; providerId: string; modelId: string; mode: string; modeId?: string } => {
    const configured = deps.defaultModelForTaskKind?.(taskKind);
    if (configured) return configured;
    if (!deps.allowRegistryFallback) {
      throw new Error("没有配置该任务的默认视频模型，请先在设置中选择模型或在计划中指定模型");
    }
    const first = deps.videoModelCandidates?.[0];
    if (!first) throw new Error("没有可用的视频模型，无法从剧本自动拟镜（请先在 Nomi 配置一个视频模型）");
    const selectedMode = deps.effectiveVideoModes(first).find((item) => item.transportTaskKind === taskKind)
      ?? deps.effectiveVideoModes(first)[0];
    const mode = selectedMode?.transportTaskKind ?? "image-to-video";
    return { moduleId: SINGLE_SHOT_GENERATION_MODULE_ID, providerId: first.provider, modelId: first.modelKey, mode, ...(selectedMode?.id ? { modeId: selectedMode.id } : {}) };
  };

  /**
   * `params.shots` (client `plan` entrance) or `params.scriptText` (storyboard planner entrance) → draft
   * shots; neither → undefined (single-shot). Validation failures are human-readable (client-visible).
   * Enforces ≥1 video shot so a pure-anchor plan (nothing to render) is rejected up front.
   */
  const resolveCreateShots = async (projectId: string, params: Record<string, unknown>): Promise<GenerationOperationDraftShot[] | undefined> => {
    let shots: GenerationOperationDraftShot[];
    if (Array.isArray(params.shots)) {
      if (params.shots.length === 0) throw new Error("多镜生成需要至少一个镜头");
      shots = params.shots.map((shot, index) => draftShotFromPlan(shot, index, deps.parsers, {
        ...(deps.defaultModelForTaskKind ? { defaultModelForTaskKind: deps.defaultModelForTaskKind } : {}),
        ...(deps.registry.snapshot ? { registry: deps.registry } : {}),
        ...(deps.allowRegistryFallback ? { allowRegistryFallback: deps.allowRegistryFallback } : {}),
        ...(deps.resolveAssetReferenceIdentity
          ? { resolveAssetReferenceIdentity: (assetId: string) => deps.resolveAssetReferenceIdentity!(projectId, assetId) }
          : {}),
      }));
    } else if (typeof params.scriptText === "string" || isLongFormGenerationRequest(params)) {
      // A minute-scale natural-language request must not silently collapse to
      // one provider clip. Promote it to the same storyboard seam as an
      // explicit scriptText request; the planner is still the sole owner of
      // script→shot semantics and model selection.
      const scriptText = typeof params.scriptText === "string"
        ? params.scriptText.trim()
        : typeof params.prompt === "string" ? params.prompt.trim() : "";
      if (!scriptText) throw new Error("剧本文本为空，无法拟镜");
      if (!deps.planStoryboard) throw new Error("当前未启用「剧本自动拟镜」，请改为直接提供逐镜计划（shots）");
      const longForm = typeof params.scriptText !== "string" && isLongFormGenerationRequest(params);
      const targetDurationSeconds = requestedVideoDurationSeconds(params);
      const board = await deps.planStoryboard({
        projectId,
        scriptText,
        ...(longForm ? { minimumShots: 2 } : {}),
        ...(targetDurationSeconds !== undefined ? { targetDurationSeconds } : {}),
      });
      if (!board || !Array.isArray(board.shots) || board.shots.length === 0) throw new Error("拟镜没有产出任何镜头，请检查剧本内容");
      if (longForm && board.shots.length < 2) {
        throw new Error("长视频请求必须先拆成至少两个镜头；请让 Agent 重新拟定剧本和分镜");
      }
      if (targetDurationSeconds !== undefined) {
        const durations = board.shots
          .filter((shot) => shot.role !== "anchor" && shot.included !== false)
          .map((shot) => shot.durationSeconds ?? shot.parameters?.duration ?? shot.parameters?.durationSeconds);
        const plannedDuration = durations.reduce((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0), 0);
        if (durations.length === 0 || durations.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0) || plannedDuration < targetDurationSeconds) {
          throw new Error(`拟镜未覆盖目标时长 ${targetDurationSeconds} 秒；每个视频镜头必须带有效 duration`);
        }
      }
      // A natural-language multi-shot request can still carry the same model,
      // mode, references, and parameter choices as an explicit candidate. Keep
      // those user choices when expanding the request into shot drafts; the
      // planner only owns shot text/duration, while catalog normalization and
      // sealing continue to validate the inherited identity. Total-duration
      // fields are deliberately omitted from per-shot parameters once a target
      // was parsed: `duration: 5` in "5 minutes" is a clip hint, not permission
      // to shrink every planned shot back to five seconds.
      const explicit = {
        ...(typeof params.moduleId === "string" && params.moduleId.trim() ? { moduleId: params.moduleId.trim() } : {}),
        ...(typeof params.providerId === "string" && params.providerId.trim() ? { providerId: params.providerId.trim() } : {}),
        ...(typeof params.modelId === "string" && params.modelId.trim() ? { modelId: params.modelId.trim() } : {}),
        ...(typeof params.mode === "string" && params.mode.trim() ? { mode: params.mode.trim() } : {}),
        ...(typeof params.modeId === "string" && params.modeId.trim() ? { modeId: params.modeId.trim() } : {}),
        ...(typeof params.variantId === "string" && params.variantId.trim() ? { variantId: params.variantId.trim() } : {}),
      };
      const sharedParameters = params.parameters === undefined
        ? {}
        : deps.parsers.record(params.parameters, "generation parameters");
      const sharedReferences = params.references === undefined
        ? undefined
        : (() => {
          if (!Array.isArray(params.references)) throw new Error("references must be an array");
          return params.references;
        })();
      const inheritedParameters = targetDurationSeconds === undefined
        ? sharedParameters
        : Object.fromEntries(Object.entries(sharedParameters).filter(([key]) => key !== "duration" && key !== "durationSeconds"));
      shots = board.shots.map((shot, index) => {
        const hasReferences = (shot.references ?? sharedReferences)?.length > 0;
        const requestedTaskKind = typeof params.taskKind === "string" ? params.taskKind.trim() : "";
        const taskKind: GenerationDefaultTaskKind = shot.role === "anchor"
          ? "text_to_image"
          : (requestedTaskKind === "image_to_video" || requestedTaskKind === "text_to_video"
            ? requestedTaskKind
            : (hasReferences ? "image_to_video" : "text_to_video"));
        const inherited = {
          ...shot,
          ...Object.fromEntries(Object.entries(explicit).filter(([key]) => shot[key as keyof StoryboardShotDraft] === undefined)),
          ...(shot.parameters || Object.keys(inheritedParameters).length > 0
            ? { parameters: { ...inheritedParameters, ...(shot.parameters ?? {}) } }
            : {}),
          ...(shot.references === undefined && sharedReferences !== undefined ? { references: sharedReferences } : {}),
        } as StoryboardShotDraft;
        return draftShotFromStoryboard(inherited, index, () => storyboardDefaults(taskKind), deps.parsers);
      });
    } else {
      return undefined;
    }
    const ids = new Set<string>();
    for (const shot of shots) {
      if (ids.has(shot.shotId)) throw new Error(`镜头 id 重复：${shot.shotId}`);
      ids.add(shot.shotId);
      // P4 §5.1.4 锚复用授权面：每个镜的参考素材（复用锚）必须存在且属于本项目（对抗矩阵 #3）。
      if (deps.assertReferencesResolvable && shot.candidate.references.length > 0) {
        deps.assertReferencesResolvable(projectId, shot.candidate.references);
      }
    }
    if (!shots.some((shot) => shot.role !== "anchor")) throw new Error("多镜计划至少需要一个视频镜头（不能只有形象参考）");
    return shots;
  };

  /**
   * Compile the sealed multi-shot bundle from the sealed operation's draft shots. Each INCLUDED shot gets
   * its sub-contract (candidate.sealedContractHash set to match — reducer sealGenerationShots requires
   * this); excluded shots carry no sub-contract. planHash = a deterministic digest over the included +
   * anchor sub-contract hashes in order (covers the whole batch, §1). shotPrices = the S2 derived per-shot
   * prices so the reducer enforces the seal-time hard cap. Returns undefined for a single-shot op.
   */
  const sealMultiShotFor = (operation: OperationWithShots): GenerationSealMultiShot | undefined => {
    if (!operation.shots || operation.shots.length === 0) return undefined;
    const sealedShots: SealedMultiShotEntry[] = operation.shots.map((shot) => {
      const included = shot.included !== false;
      if (!included) return { ...generationShotEnvelopeOf(shot), included: false, candidate: shot.candidate };
      const normalized = deps.normalizeVideoCandidate(shot.candidate);
      const contract = compileExecutionContract(normalized, deps.registry, { parameterSchema: deps.videoParameterSchema(normalized) });
      return {
        ...generationShotEnvelopeOf(shot),
        candidate: { ...normalized, sealedContractHash: contract.contractHash },
        contract,
      };
    });
    // planHash covers every sealed unit (anchors + included video shots) in their declared order so the
    // plan-level receipt is bound to the exact batch (a shot add/remove/edit changes the hash → re-gate).
    const planHash = crypto.createHash("sha256")
      .update(sealedShots.filter((shot) => shot.contract).map((shot) => `${shot.shotId}:${shot.contract!.contractHash}`).join("|"))
      .digest("hex");
    const shotPrices = sealedShots
      .filter((shot) => shot.contract)
      .map((shot) => { const price = deps.priceForCandidate(shot.candidate); return { shotId: shot.shotId, price: price.known ? { known: true as const, amount: price.amount } : { known: false as const } }; });
    return { shots: sealedShots, planHash, shotPrices };
  };

  return { resolveCreateShots, sealMultiShotFor };
}

/** Creation adapter only: execution remains owned by the original renderer runner. */
export function editorialFromDraftSubjects(subjects: readonly GenerationOperationDraftShot[], projectId: string,
  resolveUrl?: (projectId:string,reference:PlanCandidate['references'][number])=>string): GenerationPlanEditorial {
  const plan: GenerationPlanEditorial = {title:subjects[0].candidate.prompt.split('\n')[0].slice(0,500),anchors:[],shots:[]};
  subjects.forEach((subject,index)=>{
    const urls=Object.fromEntries(subject.candidate.references.map(reference=>[reference.assetId,resolveUrl?.(projectId,reference) ?? '']));
    const authored=storyboardSubjectFromCandidate(subject,index+1,subject.storyboard,urls);
    if ('description' in authored) plan.anchors.push(authored); else plan.shots.push(authored);
  });
  return plan;
}

export async function presentStoryboardAuthoring(current: {candidate:PlanCandidate;editorial?:GenerationPlanEditorial;sourceDocumentId?:string},
  projectId:string,runId:string,requested:unknown,request?: (op:string,payload:unknown)=>Promise<unknown>) {
  if (!current.editorial || !request || !current.sourceDocumentId) throw new Error('storyboard_renderer_required');
  const ids=[...current.editorial.anchors.map(anchor=>anchor.id),...current.editorial.shots.map(shot=>shot.shotId).filter((id):id is string=>Boolean(id))];
  const shotIds=resolveGenerationShotScope(ids,requested);
  const reply=await request('storyboard.present',{projectId,runId,sourceDocumentId:current.sourceDocumentId,expectedContentToken:storyboardContentToken({generationPlan:current}),shotIds});
  const receipt=reply as {status?:unknown;runId?:unknown;shotIds?:unknown} | null;
  if (!receipt || receipt.status!=='presented' || receipt.runId!==runId || JSON.stringify(receipt.shotIds)!==JSON.stringify(shotIds)) throw new Error('storyboard_presentation_receipt_mismatch');
  return {taskRef:generationTaskReference(runId),status:'presented',shots:shotIds,nextAction:'inspect_canvas'};
}

export async function patchStoryboardAuthoring<Result>(current: {editorial?:GenerationPlanEditorial}, params:Record<string,unknown>, projectId:string,operationId:string,now:string,
  operations: { patch(projectId: string, operationId: string, patch: { storyboard: PlanAnchor | PlanShot }, now: string, shotId: string, target?: import('../shared/agentCapabilities/generationInvocationContext').StoryboardRequestTarget): Result | Promise<Result> },
  resolveReferences:(projectId:string,value:unknown)=>PlanCandidate['references'],
  resolveUrl:((projectId:string,reference:PlanCandidate['references'][number])=>string) | undefined,
  target: import('../shared/agentCapabilities/generationInvocationContext').GenerationInvocationContext['storyboardTarget']) {
  if (!current.editorial || typeof params.shotId!=='string') throw new Error('storyboard_shot_id_required');
  if (!params.patch || typeof params.patch!=='object' || Array.isArray(params.patch)) throw new Error('Invalid generation patch');
  const patch=params.patch as Record<string,unknown>;
  const references:Record<string,Array<{url:string}>> | undefined=patch.references===undefined ? undefined : {};
  for (const reference of patch.references===undefined ? [] : resolveReferences(projectId,patch.references)) {
    const url=resolveUrl?.(projectId,reference);
    if (!url) throw new Error('storyboard_reference_preview_unavailable');
    (references![storyboardReferenceSlot(reference)] ??= []).push({url});
  }
  const storyboard=patchStoryboardSubject(current.editorial,params.shotId,patch,references);
  return operations.patch(projectId,operationId,{storyboard},now,params.shotId,target);
}
