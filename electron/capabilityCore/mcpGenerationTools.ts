import crypto from "node:crypto";

import {
  applyPlanCandidatePatch,
  compileExecutionContract,
  type ExecutionContractV1,
  type PlanCandidate,
} from "./executionContract";
import type { ModuleRegistry } from "./moduleRegistry";
import type { ProjectLeaseV1 } from "./projectLease";

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
      properties: { projectId: { type: "string" }, leaseHandle: { type: "string" }, operationId: { type: "string" }, receiptId: { type: "string" }, receiptToken: { type: "string" } },
      required: ["leaseHandle", "operationId"],
      additionalProperties: false,
    },
    method: "nomi_decide_generation_gate",
    build: (args: Record<string, unknown>) => ({ projectId: args.projectId, leaseHandle: args.leaseHandle, operationId: args.operationId, receiptId: args.receiptId, receiptToken: args.receiptToken }),
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
  updatedAt: string;
}>;

export type GenerationOperationStore = {
  create(input: { operationId: string; projectId: string; candidate: PlanCandidate; now: string }): GenerationOperation;
  read(projectId: string, operationId: string): GenerationOperation | null;
  patch(projectId: string, operationId: string, patch: Partial<Omit<PlanCandidate, "candidateId" | "revision">>, now: string): GenerationOperation;
  seal(projectId: string, operationId: string, contract: ExecutionContractV1, now: string): GenerationOperation;
  cancel(projectId: string, operationId: string, now: string): GenerationOperation;
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
  registry: Pick<ModuleRegistry, "resolve">;
  operations: GenerationOperationStore;
  now?: () => string;
  context?: (input: { projectId: string; lease: ProjectLeaseV1 }) => unknown | Promise<unknown>;
  start?: (operation: GenerationOperation, lease: ProjectLeaseV1) => unknown | Promise<unknown>;
  reconcile?: (operation: GenerationOperation, outcome: "found" | "not_found", lease: ProjectLeaseV1) => unknown | Promise<unknown>;
};

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
  return {
    candidateId: raw.candidateId.trim(), revision: Number(raw.revision), moduleId: raw.moduleId.trim(), providerId: raw.providerId.trim(), modelId: raw.modelId.trim(), mode: raw.mode.trim(), prompt: raw.prompt,
    parameters: record(raw.parameters ?? {}, "candidate parameters"),
    references: references.map((reference, index) => {
      const item = record(reference, `candidate reference ${index}`);
      if (typeof item.assetId !== "string" || typeof item.contentHash !== "string" || !Number.isInteger(item.version)) throw new Error(`Invalid candidate reference ${index}`);
      return { assetId: item.assetId, contentHash: item.contentHash, version: Number(item.version) };
    }),
  };
}

export function createGenerationPlanningHandler(deps: GenerationPlanningHandlerDependencies) {
  const now = deps.now ?? (() => new Date().toISOString());
  return async (input: { capability: string; params: Record<string, unknown>; lease?: ProjectLeaseV1 }): Promise<unknown> => {
    if (!input.lease) throw new Error("A verified project lease is required");
    const params = input.params;
    if (input.capability === "context") return deps.context?.({ projectId: input.lease.projectId, lease: input.lease }) ?? { projectId: input.lease.projectId, nextAction: "create" };
    const operationId = typeof params.operationId === "string" && params.operationId.trim() ? params.operationId.trim() : `op-${crypto.randomUUID()}`;
    if (input.capability === "create") {
      const operation = deps.operations.create({ operationId, projectId: input.lease.projectId, candidate: candidateFrom(params.candidate), now: now() });
      return { operation, nextAction: "preview" };
    }
    const current = deps.operations.read(input.lease.projectId, operationId);
    if (!current) throw new Error(`Generation operation not found: ${operationId}`);
    if (input.capability === "plan") {
      const operation = deps.operations.patch(input.lease.projectId, operationId, record(params.patch, "generation patch") as Partial<Omit<PlanCandidate, "candidateId" | "revision">>, now());
      return { operation, nextAction: "preview" };
    }
    if (input.capability === "preview") {
      const contract = compileExecutionContract(current.candidate, deps.registry);
      return { operationId, candidateRevision: current.candidate.revision, contract, nextAction: "request_gate" };
    }
    if (input.capability === "start") {
      if (current.state !== "sealed" || !current.contract) throw new Error("Seal and confirm the generation plan before starting");
      return deps.start?.(current, input.lease) ?? { operationId, state: current.state, nextAction: "provider_not_configured" };
    }
    if (input.capability === "cancel") return { operation: deps.operations.cancel(input.lease.projectId, operationId, now()), nextAction: "create" };
    if (input.capability === "reconcile") {
      const outcome = params.outcome === "found" || params.outcome === "not_found" ? params.outcome : null;
      if (!outcome) throw new Error("Reconciliation outcome is required");
      return deps.reconcile?.(current, outcome, input.lease) ?? { operationId, outcome, nextAction: outcome === "found" ? "observe" : "manual_review" };
    }
    if (input.capability === "read" || input.capability === "events" || input.capability === "steer") return { operation: current, nextAction: current.state === "draft" ? "preview" : "observe" };
    throw new Error(`Unsupported semantic generation capability: ${input.capability}`);
  };
}
