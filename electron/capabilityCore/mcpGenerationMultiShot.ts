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
import type { VideoModelCandidate } from "../shared/videoCapabilities/recommendation";

/**
 * P4 S6.5 生产入口: a draft shot the multi-shot `create` entrance persists (candidate/role/included;
 * NO sub-contract — that is compiled at seal). This is what `plan`/`scriptText` create produces per shot.
 */
export type GenerationOperationDraftShot = Readonly<{
  shotId: string;
  role?: "anchor" | "shot";
  included?: boolean;
  candidate: PlanCandidate;
}>;

/** A sealed shot within the multi-shot bundle (candidate + its compiled sub-contract). */
export type SealedMultiShotEntry = Readonly<{
  shotId: string;
  role?: "anchor" | "shot";
  included?: boolean;
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
  // Shape matches the reducer's shotPricesFrom: [{ shotId, price: { known, amount? } }].
  shotPrices?: ReadonlyArray<{ shotId: string; price: { known: boolean; amount?: number } }>;
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
  moduleId?: string;
  providerId?: string;
  modelId?: string;
  mode?: string;
  variantId?: string;
  parameters?: Record<string, unknown>;
  references?: ReadonlyArray<{ assetId: string; contentHash: string; version: number; kind?: "image" | "video" | "audio"; role?: "character" | "first_frame" | "last_frame" | "reference" | "audio" }>;
}>;

export type StoryboardPlanResult = Readonly<{ shots: ReadonlyArray<StoryboardShotDraft> }>;

const SHOT_ROLES = new Set(["anchor", "shot"]);

/** P4 S6.5: validate a shot's role/included/shotId envelope. Shared by the `plan` and `scriptText` paths. */
function shotEnvelope(raw: Record<string, unknown>, index: number, fallbackId: string): { shotId: string; role?: "anchor" | "shot"; included?: boolean } {
  const rawShotId = typeof raw.shotId === "string" ? raw.shotId.trim() : "";
  const shotId = rawShotId || fallbackId;
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(shotId)) throw new Error(`Invalid shot id at ${index}`);
  const role = raw.role;
  if (role !== undefined && !SHOT_ROLES.has(String(role))) throw new Error(`Invalid shot role at ${index}`);
  const included = raw.included;
  if (included !== undefined && typeof included !== "boolean") throw new Error(`Invalid shot included flag at ${index}`);
  return { shotId, ...(role === undefined ? {} : { role: role as "anchor" | "shot" }), ...(included === undefined ? {} : { included }) };
}

/** Injected candidate parsers (they live in mcpGenerationTools and are also used by the single-shot path). */
export type MultiShotCandidateParsers = {
  candidateFrom: (value: unknown) => PlanCandidate;
  record: (value: unknown, label: string) => Record<string, unknown>;
};

/**
 * P4 S6.5 `plan` 入口: parse one client-supplied shot `{ shotId?, role?, included?, candidate }` into a
 * draft shot. The candidate is a FULL PlanCandidate (same shape single-shot create takes) — reusing
 * `candidateFrom` means the `plan` entrance shares the single-shot validation (no second parser).
 */
export function draftShotFromPlan(value: unknown, index: number, parsers: MultiShotCandidateParsers): GenerationOperationDraftShot {
  const raw = parsers.record(value, `generation shot ${index}`);
  const env = shotEnvelope(raw, index, `shot-${index + 1}`);
  const candidate = parsers.candidateFrom(raw.candidate);
  return { ...env, candidate };
}

/**
 * P4 S6.5 `scriptText` 入口: turn a planner shot draft into a full draft shot. The planner gives a prompt
 * (+ optional model/mode/refs); the handler fills module/provider/model defaults from the first configured
 * video candidate (single-provider v1 = APIMart). candidateId/revision are synthesized (draft-stable).
 */
export function draftShotFromStoryboard(draft: StoryboardShotDraft, index: number, defaults: () => { moduleId: string; providerId: string; modelId: string; mode: string }, parsers: MultiShotCandidateParsers): GenerationOperationDraftShot {
  const raw = draft as Record<string, unknown>;
  const env = shotEnvelope(raw, index, `shot-${index + 1}`);
  if (typeof draft.prompt !== "string" || !draft.prompt.trim()) throw new Error(`Storyboard shot ${index} needs a prompt`);
  // Resolve module/provider/model/mode defaults lazily — only when the planner left a field unset, so a
  // fully-specified board never requires a configured video model just to build defaults it won't use.
  const needsDefaults = draft.moduleId === undefined || draft.providerId === undefined || draft.modelId === undefined || (draft.mode === undefined && env.role !== "anchor");
  const fallback = needsDefaults ? defaults() : { moduleId: "", providerId: "", modelId: "", mode: "" };
  const candidate = parsers.candidateFrom({
    candidateId: `cand-${env.shotId}`,
    revision: 1,
    moduleId: draft.moduleId ?? fallback.moduleId,
    providerId: draft.providerId ?? fallback.providerId,
    modelId: draft.modelId ?? fallback.modelId,
    ...(draft.variantId ? { variantId: draft.variantId } : {}),
    mode: draft.mode ?? (env.role === "anchor" ? "text-to-image" : fallback.mode),
    prompt: draft.prompt,
    parameters: draft.parameters ?? {},
    references: draft.references ?? [],
  });
  return { ...env, candidate };
}

/** The shared derivations the multi-shot factory needs (all pure, all single source of truth from S2/S4). */
export type MultiShotHelperDeps = {
  registry: Pick<ModuleRegistry, "resolve">;
  videoModelCandidates?: readonly VideoModelCandidate[];
  planStoryboard?: (input: { projectId: string; scriptText: string }) => StoryboardPlanResult | Promise<StoryboardPlanResult>;
  parsers: MultiShotCandidateParsers;
  normalizeVideoCandidate: (candidate: PlanCandidate) => PlanCandidate;
  videoParameterSchema: (candidate: PlanCandidate) => Record<string, unknown> | undefined;
  priceForCandidate: (candidate: PlanCandidate) => { known: boolean; amount?: number };
  effectiveVideoModes: (candidate: VideoModelCandidate) => Array<{ transportTaskKind?: string }>;
};

/** Minimal operation shape the seal helper reads (avoids importing the full GenerationOperation type). */
type OperationWithShots = { shots?: ReadonlyArray<GenerationOperationDraftShot> };

/**
 * P4 S6.5: build the multi-shot create/seal helpers bound to `deps`. `resolveCreateShots` turns a create's
 * `shots`/`scriptText` into draft shots; `sealMultiShotFor` compiles the sealed bundle at gate_request.
 * Extracted from the handler closure to keep mcpGenerationTools.ts under the 800-line shell gate (R9).
 */
export function createMultiShotCreateHelpers(deps: MultiShotHelperDeps) {
  const storyboardDefaults = (): { moduleId: string; providerId: string; modelId: string; mode: string } => {
    const first = deps.videoModelCandidates?.[0];
    if (!first) throw new Error("没有可用的视频模型，无法从剧本自动拟镜（请先在 Nomi 配置一个视频模型）");
    const mode = deps.effectiveVideoModes(first)[0]?.transportTaskKind ?? "image-to-video";
    return { moduleId: "generation.single-shot", providerId: first.provider, modelId: first.modelKey, mode };
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
      shots = params.shots.map((shot, index) => draftShotFromPlan(shot, index, deps.parsers));
    } else if (typeof params.scriptText === "string") {
      const scriptText = params.scriptText.trim();
      if (!scriptText) throw new Error("剧本文本为空，无法拟镜");
      if (!deps.planStoryboard) throw new Error("当前未启用「剧本自动拟镜」，请改为直接提供逐镜计划（shots）");
      const board = await deps.planStoryboard({ projectId, scriptText });
      if (!board || !Array.isArray(board.shots) || board.shots.length === 0) throw new Error("拟镜没有产出任何镜头，请检查剧本内容");
      shots = board.shots.map((shot, index) => draftShotFromStoryboard(shot, index, storyboardDefaults, deps.parsers));
    } else {
      return undefined;
    }
    const ids = new Set<string>();
    for (const shot of shots) {
      if (ids.has(shot.shotId)) throw new Error(`镜头 id 重复：${shot.shotId}`);
      ids.add(shot.shotId);
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
      if (!included) return { shotId: shot.shotId, ...(shot.role ? { role: shot.role } : {}), included: false, candidate: shot.candidate };
      const normalized = deps.normalizeVideoCandidate(shot.candidate);
      const contract = compileExecutionContract(normalized, deps.registry, { parameterSchema: deps.videoParameterSchema(normalized) as never });
      return {
        shotId: shot.shotId,
        ...(shot.role ? { role: shot.role } : {}),
        ...(shot.included !== undefined ? { included: shot.included } : {}),
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
