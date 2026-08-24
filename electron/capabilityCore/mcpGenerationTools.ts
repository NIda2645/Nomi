import crypto from "node:crypto";

import {
  applyPlanCandidatePatch,
  compileExecutionContract,
  type ExecutionContractV1,
  type PlanCandidate,
} from "./executionContract";
import type { ModuleRegistry } from "./moduleRegistry";
import type { ParameterField } from "./moduleManifest";
import type { ProjectLeaseV1 } from "./projectLease";
import {
  classifyGenerationProviderCapabilities,
  type GenerationProviderCapabilityProfile,
} from "./generationProviderCapabilities";
import { GenerationProviderCapabilityError } from "./generationRuntimeAdapter";
import type {
  VideoGenerationRecommendationInput,
  VideoGenerationRecommendationResult,
  VideoModelCandidate,
} from "../shared/videoCapabilities/recommendation";
import { canonicalVideoVariantId, effectiveVideoModes } from "../shared/videoCapabilities/recommendation";
import type { ModelParameterControl } from "../shared/videoCapabilities/types";

/**
 * The semantic MCP surface is deliberately data-only.  These tools are the
 * same vocabulary a GUI adapter uses; neither the catalog nor this handler
 * knows a vendor-specific parameter or calls a provider.
 */
export const MCP_GENERATION_TOOL_CATALOG = [
  {
    name: "nomi_session_open",
    description: "打开当前项目的安全会话；只返回一个可短期使用的项目句柄。",
    inputSchema: {
      type: "object",
      properties: {
        projectSelectionHandle: { type: "string" },
        bootstrap: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["current_project"] },
            clientSessionNonce: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    method: "nomi_session_open",
    build: (args: Record<string, unknown>) => ({
      ...(typeof args.projectSelectionHandle === "string" ? { projectSelectionHandle: args.projectSelectionHandle } : {}),
      ...(args.bootstrap !== undefined ? { bootstrap: args.bootstrap } : {}),
    }),
  },
  {
    name: "nomi_get_generation_context",
    description: "读取当前项目可用的生成模块、模型、模式和参考素材；不调用模型。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" } },
      required: ["leaseHandle"],
      additionalProperties: false,
    },
    method: "nomi_get_generation_context",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle }),
  },
  {
    name: "nomi_operation_create",
    description: "创建一份可编辑的生成草稿；此时不提交、不花额度。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, candidate: { type: "object" } },
      required: ["leaseHandle", "candidate"],
      additionalProperties: false,
    },
    method: "nomi_operation_create",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, candidate: args.candidate }),
  },
  {
    name: "nomi_submit_generation_plan",
    description: "保存当前草稿的编辑结果；仍不调用模型，返回最新草稿版本。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" }, patch: { type: "object" } },
      required: ["leaseHandle", "operationId", "patch"],
      additionalProperties: false,
    },
    method: "nomi_submit_generation_plan",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId, patch: args.patch }),
  },
  {
    name: "nomi_preview_execution",
    description: "预览将使用的模型、模式、参数和参考素材，并显示不支持字段；不调用模型。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_preview_execution",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId }),
  },
  {
    name: "nomi_request_generation_gate",
    description: "请求一次简短的真人确认预览；确认前不会提交模型。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_request_generation_gate",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId }),
  },
  {
    name: "nomi_decide_generation_gate",
    description: "提交当前客户端已完成的真人确认凭据；裸 confirm/approved 不被接受。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" }, attempt: { type: "integer", minimum: 1 }, receiptId: { type: "string" }, receiptToken: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_decide_generation_gate",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId, attempt: args.attempt, receiptId: args.receiptId, receiptToken: args.receiptToken }),
  },
  {
    name: "nomi_start_generation",
    description: "在计划已封存且确认有效后开始生成；提交只走统一 Runtime Adapter。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" }, receiptId: { type: "string" }, receiptToken: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_start_generation",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId, receiptId: args.receiptId, receiptToken: args.receiptToken }),
  },
  {
    name: "nomi_operation_read",
    description: "读取生成草稿或 Run 的当前状态。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_operation_read",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId }),
  },
  {
    name: "nomi_cancel_generation",
    description: "取消尚未提交的生成草稿；已提交任务只进入可核账的取消流程。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_cancel_generation",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId }),
  },
  {
    name: "nomi_reconcile_generation",
    description: "核对提交状态；未知结果不会盲目再次提交。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" }, outcome: { type: "string", enum: ["found", "not_found"] } },
      required: ["leaseHandle", "operationId", "outcome"],
      additionalProperties: false,
    },
    method: "nomi_reconcile_generation",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId, outcome: args.outcome }),
  },
] as const;

export type GenerationOperationState = "draft" | "sealed" | "cancelled" | "submitted";

export type GenerationOperation = Readonly<{
  operationId: string;
  projectId: string;
  candidate: PlanCandidate;
  state: GenerationOperationState;
  contract?: ExecutionContractV1;
  approvedReceiptId?: string;
  updatedAt: string;
}>;

export type GenerationOperationStore = {
  create(input: { operationId: string; projectId: string; candidate: PlanCandidate; now: string; origin?: { host: string; actorId?: string } }): GenerationOperation | Promise<GenerationOperation>;
  read(projectId: string, operationId: string): GenerationOperation | null | Promise<GenerationOperation | null>;
  patch(projectId: string, operationId: string, patch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>, now: string): GenerationOperation | Promise<GenerationOperation>;
  seal(projectId: string, operationId: string, contract: ExecutionContractV1, now: string): GenerationOperation | Promise<GenerationOperation>;
  approve(projectId: string, operationId: string, receiptId: string, now: string, options?: { attempt?: number }): GenerationOperation | Promise<GenerationOperation>;
  cancel(projectId: string, operationId: string, now: string): GenerationOperation | Promise<GenerationOperation>;
};

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return value;
}

/** Test/fixture store only. Production wiring must supply a Run-owned durable store. */
export function createInMemoryGenerationOperationStore(): GenerationOperationStore {
  const operations = new Map<string, GenerationOperation>();
  const keyFor = (projectId: string, operationId: string) => `${projectId}:${operationId}`;
  const read = (projectId: string, operationId: string) => operations.get(keyFor(projectId, operationId)) ?? null;
  return {
    create(input) {
      const key = keyFor(input.projectId, input.operationId);
      if (operations.has(key)) throw new Error(`Generation operation already exists: ${input.operationId}`);
      const operation = freeze({ operationId: input.operationId, projectId: input.projectId, candidate: structuredClone(input.candidate), state: "draft" as const, updatedAt: input.now });
      operations.set(key, operation);
      return operation;
    },
    read,
    patch(projectId, operationId, patch, now) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state !== "draft") throw new Error("new_draft_required: edit a new generation draft");
      const candidate = applyPlanCandidatePatch(current.candidate, patch);
      const next = freeze({ ...current, candidate, updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
    seal(projectId, operationId, contract, now) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state === "sealed" && current.contract?.contractHash === contract.contractHash) return current;
      if (current.state !== "draft") throw new Error("Generation operation is not editable");
      const next = freeze({ ...current, candidate: { ...current.candidate, sealedContractHash: contract.contractHash }, contract, state: "sealed" as const, updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
    approve(projectId, operationId, receiptId, now) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state !== "sealed" || !current.contract) throw new Error("A sealed generation plan is required before approval");
      const next = freeze({ ...current, approvedReceiptId: receiptId, updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
    cancel(projectId, operationId, now) {
      const current = read(projectId, operationId);
      if (!current) throw new Error(`Generation operation not found: ${operationId}`);
      if (current.state === "submitted") throw new Error("Submitted generation cannot be cancelled as a draft");
      const next = freeze({ ...current, state: "cancelled" as const, updatedAt: now });
      operations.set(keyFor(projectId, operationId), next);
      return next;
    },
  };
}

export type GenerationPlanningHandlerDependencies = {
  registry: Pick<ModuleRegistry, "resolve"> & Partial<Pick<ModuleRegistry, "snapshot">>;
  operations: GenerationOperationStore;
  now?: () => string;
  context?: (input: { projectId: string; lease: ProjectLeaseV1 }) => unknown | Promise<unknown>;
  /**
   * Recovery capabilities are descriptive only. This resolver answers the
   * separate question of whether an executable adapter + credential exists for
   * the selected provider/model. Keeping that seam separate means a provider
   * without native recovery is still allowed to submit normally.
   */
  providerReadiness?: (input: {
    providerId: string;
    modelId: string;
    moduleId: string;
    mode: string;
  }) => { providerReady: boolean; missingForSubmit?: string[] };
  videoModelCandidates?: readonly VideoModelCandidate[];
  recommendVideoGeneration?: (
    input: VideoGenerationRecommendationInput,
    candidates: readonly VideoModelCandidate[],
  ) => VideoGenerationRecommendationResult;
  start?: (operation: GenerationOperation, lease: ProjectLeaseV1) => unknown | Promise<unknown>;
  reconcile?: (operation: GenerationOperation, outcome: "found" | "not_found", lease: ProjectLeaseV1) => unknown | Promise<unknown>;
};

const CAMERA_INTENTS = new Set<NonNullable<VideoGenerationRecommendationInput["cameraIntent"]>>([
  "locked", "pan", "tilt", "dolly", "orbit", "handheld", "path",
]);

function videoRecommendationInput(candidate: PlanCandidate): VideoGenerationRecommendationInput | null {
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

const normalizedModelIdentity = (value: string): string => value.trim().toLowerCase();

/**
 * Keep recommendations anchored to the model the user currently selected in
 * the GUI/MCP plan. The catalog may contain aliases for a model family, so an
 * exact catalog key wins before falling back to source-declared identifiers.
 * If the selected model is not in the catalog yet (for example, a provider
 * fixture or a newly configured adapter), preserve the existing cross-catalog
 * fallback rather than making preview unusable.
 */
function candidatesForCurrentVideoModel(
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

function videoCandidateForPlan(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[]): { candidate: PlanCandidate; videoCandidate: VideoModelCandidate } | null {
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
  if (requested && !requestedCanonical) throw new Error(`Unknown video variant: ${candidate.variantId}`);
  const variantId = requestedCanonical ?? inferredVariant?.id ?? source.variantId ?? source.archetype.defaultVariantId;
  return {
    candidate: { ...candidate, modelId: source.modelKey, ...(variantId ? { variantId } : {}) },
    videoCandidate: { ...source, ...(variantId ? { variantId } : {}) },
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
  if (control.type === "number") return { type: "number" };
  if (control.type === "boolean") return { type: "boolean" };
  return { type: "string" };
}

function videoParameterSchema(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[] | undefined): Record<string, ParameterField> | undefined {
  if (!candidates) return undefined;
  const selected = videoCandidateForPlan(candidate, candidates);
  if (!selected) return undefined;
  const mode = effectiveVideoModes(selected.videoCandidate).find((item) => item.transportTaskKind === candidate.mode);
  if (!mode) return undefined;
  return Object.fromEntries(mode.params.map((control) => [control.key, parameterFieldForControl(control)]));
}

function normalizeVideoCandidate(candidate: PlanCandidate, candidates: readonly VideoModelCandidate[] | undefined): PlanCandidate {
  const selected = candidates ? videoCandidateForPlan(candidate, candidates) : null;
  return selected?.candidate ?? candidate;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function candidateFrom(value: unknown): PlanCandidate {
  const raw = record(value, "generation candidate");
  const references = Array.isArray(raw.references) ? raw.references : [];
  if (typeof raw.candidateId !== "string" || !raw.candidateId.trim()) throw new Error("Candidate id is required");
  if (typeof raw.moduleId !== "string" || typeof raw.providerId !== "string" || typeof raw.modelId !== "string" || typeof raw.mode !== "string") throw new Error("Candidate module, provider, model and mode are required");
  if (typeof raw.prompt !== "string") throw new Error("Candidate prompt is required");
  if (!Number.isInteger(raw.revision) || Number(raw.revision) < 1) throw new Error("Candidate revision must be a positive integer");
  if (raw.variantId !== undefined && (typeof raw.variantId !== "string" || !raw.variantId.trim())) throw new Error("Candidate variant id must be a non-empty string");
  return {
    candidateId: raw.candidateId.trim(), revision: Number(raw.revision), moduleId: raw.moduleId.trim(), providerId: raw.providerId.trim(), modelId: raw.modelId.trim(), ...(typeof raw.variantId === "string" ? { variantId: raw.variantId.trim() } : {}), mode: raw.mode.trim(), prompt: raw.prompt,
    parameters: record(raw.parameters ?? {}, "candidate parameters"),
    references: references.map((reference, index) => {
      const item = record(reference, `candidate reference ${index}`);
      if (typeof item.assetId !== "string" || typeof item.contentHash !== "string" || !Number.isInteger(item.version)) throw new Error(`Invalid candidate reference ${index}`);
      const kind = item.kind;
      const role = item.role;
      if (kind !== undefined && kind !== "image" && kind !== "video" && kind !== "audio") throw new Error(`Invalid candidate reference kind ${index}`);
      if (role !== undefined && role !== "character" && role !== "first_frame" && role !== "last_frame" && role !== "reference" && role !== "audio") throw new Error(`Invalid candidate reference role ${index}`);
      return {
        assetId: item.assetId,
        contentHash: item.contentHash,
        version: Number(item.version),
        ...(kind === undefined ? {} : { kind }),
        ...(role === undefined ? {} : { role }),
      };
    }),
  };
}

const RECOVERY_CAPABILITIES = ["submitIdempotency", "query", "reconcile", "cancel"] as const;

type ProviderReadiness = {
  providerReady: boolean;
  providerCapabilityProfile: GenerationProviderCapabilityProfile;
  recoveryNotice: string;
  providerCapabilitiesMissing: string[];
  missingForSubmit: string[];
};

function recoveryNotice(profile: GenerationProviderCapabilityProfile): string {
  if (profile === "full_recovery") return "可正常生成；异常时 Nomi 可以继续查询并恢复。";
  if (profile === "observe_only") return "可正常生成；如果提交结果不确定，需要到供应商核对任务，Nomi 不会自动重提。";
  return "可正常生成；如果提交结果不确定，需要你到供应商核对后再决定，Nomi 不会自动重提。";
}

function resolveProviderReadiness(
  deps: Pick<GenerationPlanningHandlerDependencies, "registry" | "providerReadiness">,
  candidate: PlanCandidate,
): ProviderReadiness {
  const resolved = deps.registry.resolve({ moduleId: candidate.moduleId, providerId: candidate.providerId, modelId: candidate.modelId, mode: candidate.mode });
  const providerCapabilitiesMissing = RECOVERY_CAPABILITIES.filter((capability) => !resolved.capabilities[capability]);
  const adapterReadiness = deps.providerReadiness?.({
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    moduleId: resolved.moduleId,
    mode: resolved.mode,
  }) ?? { providerReady: true };
  return {
    providerReady: adapterReadiness.providerReady,
    providerCapabilityProfile: classifyGenerationProviderCapabilities(resolved.capabilities),
    recoveryNotice: recoveryNotice(classifyGenerationProviderCapabilities(resolved.capabilities)),
    providerCapabilitiesMissing,
    missingForSubmit: adapterReadiness.missingForSubmit ?? [],
  };
}

export function createGenerationPlanningHandler(deps: GenerationPlanningHandlerDependencies) {
  const now = deps.now ?? (() => new Date().toISOString());
  return async (input: { capability: string; params: Record<string, unknown>; lease?: ProjectLeaseV1; origin?: { host: string; actorId?: string } }): Promise<unknown> => {
    if (!input.lease) throw new Error("A verified project lease is required");
    const params = input.params;
    if (input.capability === "context") {
      if (deps.context) return deps.context({ projectId: input.lease.projectId, lease: input.lease });
      const providerProfiles = (deps.registry.snapshot?.() ?? []).flatMap((manifest) => manifest.providers.map((provider) => ({
        providerId: provider.providerId,
        modelIds: provider.models.map((model) => model.modelId),
        modes: [...new Set(provider.models.flatMap((model) => model.modes))],
        capabilities: provider.models.map((model) => ({ modelId: model.modelId, ...model.capabilities })),
      })));
      const projectVideoModes = (videoCandidate: VideoModelCandidate) => effectiveVideoModes(videoCandidate).map((mode) => ({
        id: mode.id,
        intent: mode.intent,
        vendorTerm: mode.vendorTerm,
        transportTaskKind: mode.transportTaskKind,
        references: mode.slots.map((slot) => ({ kind: slot.kind, min: slot.min, max: slot.max, label: slot.label })),
        parameters: mode.params.map((parameter) => ({ key: parameter.key, type: parameter.type, options: parameter.options })),
      }));
      const videoModels = (deps.videoModelCandidates ?? []).map((videoCandidate) => ({
        providerId: videoCandidate.provider,
        modelId: videoCandidate.modelKey,
        label: videoCandidate.label,
        archetypeId: videoCandidate.archetype.id,
        ...(videoCandidate.variantId ? { variantId: videoCandidate.variantId } : {}),
        variants: (videoCandidate.variantChoices ?? []).map((variant) => ({
          ...variant,
          modes: projectVideoModes({ ...videoCandidate, variantId: variant.id }),
        })),
        modes: projectVideoModes(videoCandidate),
      }));
      return {
        projectId: input.lease.projectId,
        immutableProjectUuid: input.lease.immutableProjectUuid,
        projectGeneration: input.lease.projectGeneration,
        providerProfiles,
        ...(videoModels.length ? { videoModels } : {}),
        nextAction: "create",
      };
    }
    const operationId = typeof params.operationId === "string" && params.operationId.trim() ? params.operationId.trim() : `op-${crypto.randomUUID()}`;
    if (input.capability === "create") {
      const operation = await deps.operations.create({ operationId, projectId: input.lease.projectId, candidate: normalizeVideoCandidate(candidateFrom(params.candidate), deps.videoModelCandidates), now: now(), origin: input.origin });
      return { operation, nextAction: "preview" };
    }
    const current = await deps.operations.read(input.lease.projectId, operationId);
    if (!current) throw new Error(`Generation operation not found: ${operationId}`);
    if (input.capability === "plan") {
      const rawPatch = record(params.patch, "generation patch") as Partial<Omit<PlanCandidate, "candidateId" | "revision">>;
      const nextProviderId = typeof rawPatch.providerId === "string" ? rawPatch.providerId : current.candidate.providerId;
      const nextModelId = typeof rawPatch.modelId === "string" ? rawPatch.modelId : current.candidate.modelId;
      const modelChanged = normalizedModelIdentity(nextProviderId) !== normalizedModelIdentity(current.candidate.providerId)
        || normalizedModelIdentity(nextModelId) !== normalizedModelIdentity(current.candidate.modelId);
      const mergedCandidate = {
        ...current.candidate,
        ...rawPatch,
        ...(modelChanged && rawPatch.variantId === undefined ? { variantId: undefined } : {}),
        parameters: rawPatch.parameters ?? current.candidate.parameters,
        references: rawPatch.references ?? current.candidate.references,
      } as PlanCandidate;
      const normalizedCandidate = normalizeVideoCandidate(mergedCandidate, deps.videoModelCandidates);
      const normalizedPatch = {
        ...rawPatch,
        ...(normalizedCandidate.variantId ? { variantId: normalizedCandidate.variantId } : { variantId: undefined }),
      };
      const operation = await deps.operations.patch(input.lease.projectId, operationId, normalizedPatch, now());
      return { operation, nextAction: "preview" };
    }
    if (input.capability === "preview") {
      const candidate = normalizeVideoCandidate(current.candidate, deps.videoModelCandidates);
      const contract = compileExecutionContract(candidate, deps.registry, { parameterSchema: videoParameterSchema(candidate, deps.videoModelCandidates) });
      const readiness = resolveProviderReadiness(deps, candidate);
      const resolved = deps.registry.resolve({
        moduleId: candidate.moduleId,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        mode: candidate.mode,
      });
      const recommendationInput = resolved.outputKinds.includes("video")
        ? videoRecommendationInput(candidate)
        : null;
      const recommendation = recommendationInput && deps.recommendVideoGeneration && deps.videoModelCandidates
        ? deps.recommendVideoGeneration(recommendationInput, candidatesForCurrentVideoModel(candidate, deps.videoModelCandidates))
        : undefined;
      return {
        operationId,
        candidateRevision: current.candidate.revision,
        contract,
        ...(recommendation ? { recommendation } : {}),
        providerReady: readiness.providerReady,
        providerCapabilityProfile: readiness.providerCapabilityProfile,
        recoveryNotice: readiness.recoveryNotice,
        ...(readiness.providerCapabilitiesMissing.length ? { providerCapabilitiesMissing: readiness.providerCapabilitiesMissing } : {}),
        ...(readiness.providerReady ? { nextAction: "request_gate" } : { nextAction: "provider_configure" }),
      };
    }
    if (input.capability === "gate_request") {
      const candidate = normalizeVideoCandidate(current.candidate, deps.videoModelCandidates);
      const contract = compileExecutionContract(candidate, deps.registry, { parameterSchema: videoParameterSchema(candidate, deps.videoModelCandidates) });
      const readiness = resolveProviderReadiness(deps, candidate);
      if (!readiness.providerReady) throw new GenerationProviderCapabilityError(contract.providerId, readiness.missingForSubmit.length ? readiness.missingForSubmit : ["configured_provider"]);
      const sealed = current.state === "draft"
        ? await deps.operations.seal(input.lease.projectId, operationId, contract, now())
        : current;
      return {
        operation: sealed,
        operationId,
        projectId: input.lease.projectId,
        contractHash: contract.contractHash,
        model: `${contract.providerId}/${contract.modelId}`,
        referenceCount: contract.references.length,
        costScope: `generation.single-shot:${operationId}`,
        maximumCost: 0,
        currency: "CNY",
        expiresAt: new Date(Date.parse(now()) + 10 * 60 * 1000).toISOString(),
        shotSummary: contract.prompt.slice(0, 120),
        providerReady: readiness.providerReady,
        providerCapabilityProfile: readiness.providerCapabilityProfile,
        recoveryNotice: readiness.recoveryNotice,
        ...(readiness.providerCapabilitiesMissing.length ? { providerCapabilitiesMissing: readiness.providerCapabilitiesMissing } : {}),
        nextAction: "confirm",
      };
    }
    if (input.capability === "gate_decide") {
      const receiptId = typeof params.receiptId === "string" ? params.receiptId.trim() : "";
      if (!receiptId) throw new Error("A verified generation gate receipt is required");
      const attempt = Number.isInteger(params.attempt) && Number(params.attempt) > 0 ? Number(params.attempt) : undefined;
      const operation = await deps.operations.approve(input.lease.projectId, operationId, receiptId, now(), attempt === undefined ? undefined : { attempt });
      return { operation, nextAction: "start" };
    }
    if (input.capability === "start") {
      if (current.state !== "sealed" || !current.contract || !current.approvedReceiptId) throw new Error("Confirm the generation plan before starting");
      return deps.start?.(current, input.lease) ?? { operationId, state: current.state, nextAction: "provider_not_configured" };
    }
    if (input.capability === "cancel") return { operation: await deps.operations.cancel(input.lease.projectId, operationId, now()), nextAction: "create" };
    if (input.capability === "reconcile") {
      const outcome = params.outcome === "found" || params.outcome === "not_found" ? params.outcome : null;
      if (!outcome) throw new Error("Reconciliation outcome is required");
      return deps.reconcile?.(current, outcome, input.lease) ?? { operationId, outcome, nextAction: outcome === "found" ? "observe" : "manual_review" };
    }
    if (input.capability === "read" || input.capability === "events" || input.capability === "steer") return { operation: current, nextAction: current.state === "draft" ? "preview" : "observe" };
    throw new Error(`Unsupported semantic generation capability: ${input.capability}`);
  };
}
