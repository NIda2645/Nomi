import crypto from "node:crypto";
import path from "node:path";

import {
  createGenerationRuntimeAdapter,
  GenerationProviderObservationError,
  resolveExecutionContract,
  type GenerationProvider,
  type GenerationProviderOutput,
} from "../capabilityCore/generationRuntimeAdapter";
import { assertGenerationProviderCanSubmit } from "../capabilityCore/generationProviderCapabilities";
import type { ExecutionContractV1 } from "../capabilityCore/executionContract";
import { createProductionRunRuntimeEnvelope } from "./productionRunRuntimeEnvelope";
import { createProductionRunIntentLog } from "./productionRunIntentLog";
import { productionRunPaths } from "./productionRunPaths";
import { createProductionRunLock } from "./productionRunLock";
import type { ProductionRunRepository } from "./productionRunRepository";
import {
  SubmissionNotDispatchedError,
  SubmissionReceiptUnknownError,
  SubmissionReconciliationRequiredError,
  createSubmissionOutbox,
} from "./submissionOutbox";
import { classifyGenerationResume, type GenerationResumeDecision } from "./productionRunResume";
import { createProductionExecutionBinding, type ProductionExecutionBinding } from "./productionExecutionBinding";
import type { ProductionArtifact, ProductionJob, ProductionRun } from "./productionRunTypes";
import type { ShotPrice } from "./shotPricing";

export { SubmissionReceiptUnknownError, SubmissionReconciliationRequiredError };

export type GenerationSubmissionStartInput = {
  projectId: string;
  operationId: string;
  definitelyNotSubmitted?: boolean;
  /** Explicitly selected attempt; omitted means the latest durable attempt. */
  attempt?: number;
  /**
   * P4 S1 shot addressing: which shot's sub-contract to submit. Omitted = the default (single) shot,
   * behaving exactly as the P1–P3 single-shot chain (top-level plan contract). Backward compatible.
   */
  shotId?: string;
};

export type GenerationSubmissionResult = {
  operationId: string;
  runId: string;
  jobId: string;
  providerTaskId: string;
  attempt: number;
  nextAction: "observe";
};

export type GenerationSubmissionPollResult = {
  operationId: string;
  runId: string;
  jobId: string;
  providerTaskId: string;
  providerStatus: string;
  nextAction: "poll" | "materialize" | "attention";
};

export type GenerationSubmissionMaterializeResult = {
  operationId: string;
  runId: string;
  jobId: string;
  providerTaskId: string;
  artifactId: string;
  contentHash: string;
  nextAction: "completed";
};

export class GenerationMaterializationUnsupportedError extends Error {
  readonly code = "provider_materialization_unsupported" as const;

  constructor(message = "This provider has no verified output materialization path") {
    super(message);
    this.name = "GenerationMaterializationUnsupportedError";
  }
}

export class GenerationMaterializationError extends Error {
  readonly code = "materialization_failed" as const;

  constructor(message: string) {
    super(message);
    this.name = "GenerationMaterializationError";
  }
}

export type GenerationSubmissionResumeResult = GenerationResumeDecision & {
  operationId: string;
  nextAction: "poll" | "reconcile" | "dispatch" | "attention";
  providerTaskId?: string;
};

export type GenerationNewAttemptInput = {
  projectId: string;
  operationId: string;
  reason: "submission_unknown" | "needs_attention";
  /** P4 S1: which shot to re-attempt. Omitted = the default (single) shot — today's chain. */
  shotId?: string;
};

export type GenerationNewAttemptResult = {
  operationId: string;
  runId: string;
  jobId: string;
  attempt: number;
  contractHash: string;
  requiresFreshReceipt: true;
  nextAction: "request_gate";
  warning: string;
  /** P4 S6: 谱系——本次尝试是从哪个 job 派生的（原结果仍可查/可切回）。 */
  parentJobId?: string;
};

/**
 * P4 S6 返工：对**任意终态**的一镜（ready/adopted 已完成、needs_attention 失败、detached 已停）发起「同 Run 新 Job」。
 * 与 `createNewAttempt` 的区别是语义而非机制：createNewAttempt 是「恢复」（只认失败/失证态，reason 门），
 * reworkShot 是「返工」（用户主动对已成/已停镜重拍）。二者都用 reducer 的 `generation.new_attempt` 命令
 * （同镜谱系 attempt 单调 + 只清该镜 approval，不连坐），都设 parentJobId 留痕——不是并行版，是两个语义入口。
 */
export type GenerationReworkInput = {
  projectId: string;
  operationId: string;
  /** 返工哪一镜。多镜返工必带；单镜（默认镜）省略。 */
  shotId?: string;
};

export type GenerationReworkResult = {
  operationId: string;
  runId: string;
  jobId: string;
  attempt: number;
  contractHash: string;
  requiresFreshReceipt: true;
  nextAction: "request_gate";
  parentJobId: string;
};

export type ProductionGenerationSubmissionDependencies = {
  repository: ProductionRunRepository;
  projectRoot: string;
  immutableProjectUuid: string;
  projectGeneration: number;
  intentMacKey: string | NodeJS.TypedArray;
  provider: GenerationProvider;
  now?: () => string;
  /**
   * P4 S2: derive the real per-shot price for a sealed sub-contract from the catalog pricing.
   * Replaces the ¥0 placeholders on approval.maxSpend / budget authorize / reserve costCeiling.
   * Omitted (or an unknown result) → the shot has no priced liability and the seam keeps its
   * backward-compatible 0 ledger amount (an unpriced model, e.g. one with no catalog `pricing`,
   * must still be submittable — see submissionOutbox line "costCeiling === null" hard-fail).
   */
  resolveShotPrice?: (contract: ExecutionContractV1) => ShotPrice;
  runtimeTaskId?: (input: { runId: string; contractHash: string; attempt?: number }) => string;
  afterProviderAcceptance?: (input: { providerTaskId: string; run: ProductionRun }) => void | Promise<void>;
  beforeDispatch?: (input: { run: ProductionRun; job: ProductionJob }) => void | Promise<void>;
  /** Asset store owns bytes, identity and leases; the submission seam only commits its returned receipt. */
  materializeOutput?: (input: {
    projectId: string;
    operationId: string;
    run: ProductionRun;
    job: ProductionJob;
    contract: ExecutionContractV1;
    providerTaskId: string;
    output: GenerationProviderOutput;
  }) => Promise<Pick<ProductionArtifact, "artifactId" | "kind" | "contentHash" | "projectRelativePath" | "thumbnailRelativePath">>;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Generation request must contain finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("Generation request must be JSON serializable");
}

function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function requiredRun(repository: ProductionRunRepository, projectId: string, runId: string): ProductionRun {
  const run = repository.read(projectId, runId);
  if (!run) throw new Error(`Production run not found: ${runId}`);
  return run;
}

/**
 * P4 S1: resolve the sub-contract this call addresses.
 * - No shotId → the default (single) shot: top-level plan contract + plan-level receipt (today's chain).
 * - shotId → that shot's sealed sub-contract + the shot's own receipt approval.
 * Either way the plan must be sealed/submitted and the addressed unit must be approved before submit.
 */
function requiredContract(run: ProductionRun, shotId?: string): ExecutionContractV1 {
  const plan = run.generationPlan;
  if (!plan || (plan.state !== "sealed" && plan.state !== "submitted")) {
    throw new Error("Seal and confirm the generation plan before starting");
  }
  if (shotId) {
    const shot = (plan.shots ?? []).find((candidate) => candidate.shotId === shotId);
    if (!shot?.contract || !shot.approvedReceiptId) throw new Error("Seal and confirm the generation plan before starting");
    return shot.contract;
  }
  if (!plan.contract || !plan.approvedReceiptId) throw new Error("Seal and confirm the generation plan before starting");
  return plan.contract;
}

/**
 * P4 S1 identity: shotId is part of the jobId so two shots with identical parameters (equal contract
 * hash) never collide. The default shot keeps the legacy prefix (`generation-<run>-<hash16>`) so
 * durable Runs and single-shot callers are byte-compatible; a named shot inserts `-<shotId>` after it.
 */
function jobIdFor(runId: string, contractHash: string, attempt = 1, shotId?: string): string {
  const shotSegment = shotId ? `-${shotId}` : "";
  return `generation-${runId}${shotSegment}-${contractHash.slice(0, 16)}${attempt > 1 ? `-attempt-${attempt}` : ""}`;
}

function latestGenerationAttempt(run: ProductionRun, contractHash: string, shotId?: string): number {
  const prefix = jobIdFor(run.runId, contractHash, 1, shotId).replace(/-attempt-\d+$/, "");
  return run.jobs
    .filter((job) => job.jobId === prefix || job.jobId.startsWith(`${prefix}-attempt-`))
    .reduce((latest, job) => Math.max(latest, job.attempt), 0);
}

function envelopeRefFor(runId: string, jobId: string): string {
  return `.nomi/runs/${runId}/jobs/${jobId}/runtime-envelope.json`;
}

function isPendingProviderStatus(status: string): boolean {
  return ["queued", "pending", "processing", "running", "in_progress"].includes(status.trim().toLowerCase());
}

function isFailedProviderStatus(status: string): boolean {
  return ["failed", "error", "cancelled", "canceled", "rejected"].includes(status.trim().toLowerCase());
}

/**
 * The binding's `shotId` is the addressed shot (default shot → its jobId, keeping single-shot bindings
 * byte-identical). The providerIdempotencyKey MUST include the shotId so two shots that hash identically
 * derive different keys (#5): a two-shot batch with equal parameters must not collapse to one provider task.
 */
function ensureBinding(deps: ProductionGenerationSubmissionDependencies, run: ProductionRun, contract: ExecutionContractV1, jobId: string, attempt: number, fencingEpoch: number, shotId?: string): ProductionExecutionBinding {
  const existing = run.jobs.find((job) => job.jobId === jobId)?.executionBinding;
  if (existing) {
    if (existing.contractHash !== contract.contractHash || existing.providerNamespace !== contract.providerId) {
      throw new Error("Sealed generation job binding does not match the current contract");
    }
    return existing;
  }
  // The default shot keeps the jobId as its shot identity (single-shot binding unchanged); a named shot
  // uses its stable shotId. Both feed the idempotency key so identical-parameter shots stay distinct.
  const bindingShotId = shotId ?? jobId;
  const runtimeTaskId = deps.runtimeTaskId?.({ runId: run.runId, contractHash: contract.contractHash, attempt })
    || `runtime-${run.runId}-${contract.contractHash.slice(0, 16)}-attempt-${attempt}`;
  const requestFingerprint = sha256({
    contractHash: contract.contractHash,
    providerId: contract.providerId,
    modelId: contract.modelId,
    mode: contract.mode,
    prompt: contract.prompt,
    parameters: contract.parameters,
    references: contract.references,
  });
  return createProductionExecutionBinding({
    immutableProjectUuid: deps.immutableProjectUuid,
    projectGeneration: deps.projectGeneration,
    runId: run.runId,
    shotId: bindingShotId,
    contractHash: contract.contractHash,
    runtimeTaskId,
    providerNamespace: contract.providerId,
    providerIdempotencyKey: `generation:${run.runId}:${bindingShotId}:${contract.contractHash}:attempt-${attempt}`,
    requestFingerprint,
    runtimeEnvelopeRef: envelopeRefFor(run.runId, jobId),
    fencingEpoch,
  });
}

export function createProductionGenerationSubmission(deps: ProductionGenerationSubmissionDependencies) {
  const now = deps.now ?? (() => new Date().toISOString());
  const adapter = createGenerationRuntimeAdapter({ providers: [deps.provider] });

  /**
   * P4 S2: the real ledger amount for one shot's sub-contract. A known price flows straight into
   * approval.maxSpend / authorize / reserve; an unknown or unresolved price keeps the legacy 0
   * (no priced liability — the shot still submits, matching pre-S2 behavior for unpriced models).
   */
  function ledgerAmountFor(contract: ExecutionContractV1): number {
    const price = deps.resolveShotPrice?.(contract);
    return price?.known ? price.amount : 0;
  }

  function intentLog(runId: string) {
    return createProductionRunIntentLog({
      filePath: productionRunPaths(deps.projectRoot, runId).intents,
      macKey: deps.intentMacKey,
    });
  }

  function lock(runId: string) {
    const paths = productionRunPaths(deps.projectRoot, runId);
    return createProductionRunLock({ filePath: paths.lock, epochPath: paths.lockEpoch, ownerId: `semantic-generation-${process.pid}` });
  }

  function envelope(runId: string, jobId: string) {
    return createProductionRunRuntimeEnvelope({ filePath: path.join(deps.projectRoot, envelopeRefFor(runId, jobId)) });
  }

  function command(run: ProductionRun, type: string, payload: Record<string, unknown>, suffix: string): ProductionRun {
    return deps.repository.execute(run.projectId, run.runId, {
      commandId: `generation.runtime:${run.runId}:${suffix}`,
      expectedRevision: run.revision,
      type,
      payload,
      issuedAt: now(),
    }).run;
  }

  function prepare(run: ProductionRun, contract: ExecutionContractV1, binding: ProductionExecutionBinding, jobId: string, attempt: number, shotId?: string): { run: ProductionRun; envelope: ReturnType<typeof createProductionRunRuntimeEnvelope> } {
    let current = run;
    // P4 S2: this shot's real ledger amount (0 when the price is unknown — keeps unpriced models submittable).
    const shotAmount = ledgerAmountFor(contract);
    const existingJob = current.jobs.find((job) => job.jobId === jobId);
    const addedJob = !existingJob;
    if (addedJob) {
      // P4 S5: inherit the shot's canvas placeholder node (bound at 确认即落 / 打开项目补齐) so the
      // scheduler's job carries nodeId for reconcile/attach-shot-result. A shot whose node the user later
      // deleted has canvasDetached set + no nodeId → the job carries none (§3.4 撤销事实优先, no revive).
      const boundNodeId = shotId
        ? (current.generationPlan?.shots ?? []).find((shot) => shot.shotId === shotId)?.nodeId
        : undefined;
      const job: ProductionJob = {
        jobId,
        stageId: "generate",
        status: "authorized",
        attempt,
        provider: contract.providerId,
        model: contract.modelId,
        idempotencyKey: binding.providerIdempotencyKey,
        executionBinding: binding,
        requestFingerprint: binding.requestFingerprint,
        providerIdempotencyKey: binding.providerIdempotencyKey,
        runtimeEnvelopeRef: binding.runtimeEnvelopeRef,
        taskKind: contract.mode,
        ...(boundNodeId ? { nodeId: boundNodeId } : {}),
        // P4 S1: stamp the shot lineage so per-shot attempt monotonicity survives replay (reducer reads
        // metadata.shotId). Default shot omits it → the reducer treats it as the single default lineage.
        ...(shotId ? { metadata: { shotId } } : {}),
        createdAt: now(),
        updatedAt: now(),
      };
      // #4 commandId: the suffix must carry jobId or a second job in the same Run is silently deduped.
      current = command(current, "job.add", { job }, `job-add:${jobId}`);
    }
    const approvalId = `approval:generation:${current.runId}:${contract.contractHash}:${jobId}`;
    const existingApproval = deps.repository.readApprovals(current.projectId, current.runId).find((approval) => approval.approvalId === approvalId);
    if (!existingApproval) {
      current = deps.repository.execute(current.projectId, current.runId, {
        commandId: `generation.runtime:${current.runId}:approval-record:${jobId}`,
        expectedRevision: current.revision,
        type: "approval.record",
        payload: {
          approval: {
            approvalId,
            runId: current.runId,
            scope: "job_set",
            planHash: contract.contractHash,
            jobIds: [jobId],
            allowedProviders: [contract.providerId],
            allowedModels: [contract.modelId],
            currency: current.budget.currency,
            // P4 S2: this shot's derived price is its authorized ceiling (0 = unknown/unpriced, unbounded like today).
            maxSpend: shotAmount,
            maxAttemptsPerJob: current.policy.maxAttemptsPerJob,
            decidedAt: now(),
            expiresAt: new Date(Date.parse(now()) + 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        issuedAt: now(),
      }).run;
    }
    if (addedJob) {
      if (current.budget.authorized < 0) throw new Error("Invalid generation budget authorization");
      if (current.budget.authorized === 0 && current.budget.reserved === 0 && current.budget.actual === 0 && current.budget.unsettled === 0) {
        // #4 commandId: without jobId, a second shot's authorize reuses the first's commandId and is
        // deduped into a stale-revision result. The billingEntryId already embeds jobId (via approvalId).
        // P4 S2: authorize the ledger to this shot's derived price. For the single-shot chain that IS the
        // plan cap; the plan-level cap that sums included shots up front is the scheduler's job (S4 §3.3),
        // so this guard (first entry only) intentionally leaves multi-shot cap accumulation to S4.
        current = command(current, "budget.entry", {
          entry: { billingEntryId: `${approvalId}:authorize`, kind: "authorize", amount: shotAmount, occurredAt: now() },
        }, `budget-authorize:${jobId}`);
      }
    }
    const resolved = resolveExecutionContract(contract, binding);
    const sealedEnvelope = envelope(current.runId, jobId);
    sealedEnvelope.seal({
      runId: current.runId,
      jobId,
      runtimeTaskId: binding.runtimeTaskId,
      contractHash: contract.contractHash,
      providerIdempotencyKey: binding.providerIdempotencyKey,
      requestFingerprint: binding.requestFingerprint,
      request: resolved,
    });
    return { run: current, envelope: sealedEnvelope };
  }

  async function start(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const attempt = input.attempt ?? Math.max(1, latestGenerationAttempt(run, contract.contractHash, shotId));
    if (!Number.isInteger(attempt) || attempt < 1) throw new Error("Generation attempt is invalid");
    let jobId = jobIdFor(run.runId, contract.contractHash, attempt, shotId);
    const existingJob = run.jobs.find((job) => job.jobId === jobId);
    if (existingJob?.status === "provider_accepted" && existingJob.providerTaskId) {
      if (run.generationPlan?.state !== "submitted") run = command(run, "generation.submit", {}, "plan-submit");
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: existingJob.providerTaskId, attempt, nextAction: "observe" };
    }
    if (existingJob && ["submission_unknown", "reconciling", "needs_attention", "cancel_requested"].includes(existingJob.status)) {
      throw new SubmissionReconciliationRequiredError();
    }
    assertGenerationProviderCanSubmit(deps.provider);

    const runLock = lock(run.runId);
    return runLock.withLock(async (lease) => {
      run = requiredRun(deps.repository, input.projectId, input.operationId);
      const lockedContract = requiredContract(run, shotId);
      if (lockedContract.contractHash !== contract.contractHash) throw new Error("Generation contract changed while waiting for the Run lock");
      const lockedAttempt = input.attempt ?? Math.max(1, latestGenerationAttempt(run, lockedContract.contractHash, shotId));
      jobId = jobIdFor(run.runId, lockedContract.contractHash, lockedAttempt, shotId);
      const binding = ensureBinding(deps, run, lockedContract, jobId, lockedAttempt, lease.fencingEpoch, shotId);
      const prepared = prepare(run, lockedContract, binding, jobId, lockedAttempt, shotId);
      run = prepared.run;
      const log = intentLog(run.runId);
      let rawReceipt: unknown;
      const outbox = createSubmissionOutbox({
        repository: deps.repository,
        intentLog: log,
        lock: runLock,
        lockLease: lease,
        now,
        beforeDispatch: async (dispatchInput) => {
          await deps.beforeDispatch?.({ run: dispatchInput.run, job: dispatchInput.job });
        },
        dispatch: async (dispatchInput) => {
          const currentBinding = dispatchInput.job.executionBinding;
          if (!currentBinding) throw new Error("Generation job is missing its sealed execution binding");
          try {
            const result = await adapter.submit({ contract: lockedContract, binding: currentBinding });
            rawReceipt = result.raw;
            return { providerTaskId: result.providerTaskId };
          } catch (error) {
            if (!(error instanceof SubmissionNotDispatchedError)) prepared.envelope.markSubmittedUnknown();
            throw error;
          }
        },
        afterDispatch: async (result, dispatchInput) => {
          prepared.envelope.markProviderAccepted({ providerTaskId: result.providerTaskId, rawReceipt });
          try {
            await deps.afterProviderAcceptance?.({ providerTaskId: result.providerTaskId, run: dispatchInput.run });
          } catch (error) {
            prepared.envelope.markSubmittedUnknown();
            throw error;
          }
        },
      });
      const approvalId = `approval:generation:${run.runId}:${lockedContract.contractHash}:${jobId}`;
      const result = await outbox.submit({
        projectId: run.projectId,
        runId: run.runId,
        jobId,
        approvalId,
        planHash: lockedContract.contractHash,
        // P4 S2: reserve this shot's derived price (the outbox also feeds it to authorizeSubmission as
        // estimatedCost). 0 = unknown/unpriced → no priced reservation, keeping the pre-S2 submit path.
        costCeiling: ledgerAmountFor(lockedContract),
        currency: run.budget.currency,
        allowRetryAfterAbort: input.definitelyNotSubmitted === true,
      });
      run = result.run;
      if (run.generationPlan?.state !== "submitted") run = command(run, "generation.submit", {}, "plan-submit");
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: result.providerTaskId, attempt: lockedAttempt, nextAction: "observe" };
    });
  }

  async function poll(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionPollResult> {
    const shotId = input.shotId;
    const run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const attempt = input.attempt ?? Math.max(1, latestGenerationAttempt(run, contract.contractHash, shotId));
    const jobId = jobIdFor(run.runId, contract.contractHash, attempt, shotId);
    const job = run.jobs.find((candidate) => candidate.jobId === jobId);
    if (!job?.providerTaskId) throw new SubmissionReconciliationRequiredError("A provider task id is required before polling");

    const result = await adapter.query({ providerId: job.provider, providerTaskId: job.providerTaskId });
    const providerStatus = result.status.trim();
    if (!providerStatus) throw new Error("Provider returned an empty poll status");
    const envelopeStore = envelope(run.runId, job.jobId);
    envelopeStore.markPolled({ status: providerStatus, raw: result.raw });
    const observedAt = now();
    const statusChanged = job.providerStatus !== providerStatus;
    const nextStatus = isPendingProviderStatus(providerStatus) ? "polling" : isFailedProviderStatus(providerStatus) ? "needs_attention" : job.status;
    const patch = {
      providerStatus,
      lastPollAt: observedAt,
      ...(statusChanged ? { lastVendorStateChangeAt: observedAt } : {}),
      ...(isFailedProviderStatus(providerStatus) ? { errorCode: "provider_task_failed", errorMessage: "供应商任务已返回失败状态" } : {}),
    };
    command(run, nextStatus === job.status ? "job.patch" : "job.status", {
      jobId: job.jobId,
      ...(nextStatus === job.status ? { patch } : { status: nextStatus, patch }),
    }, `poll:${run.revision}:${providerStatus}`);
    return {
      operationId: run.runId,
      runId: run.runId,
      jobId: job.jobId,
      providerTaskId: job.providerTaskId,
      providerStatus,
      nextAction: isPendingProviderStatus(providerStatus) ? "poll" : isFailedProviderStatus(providerStatus) ? "attention" : "materialize",
    };
  }

  async function materialize(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionMaterializeResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const attempt = input.attempt ?? Math.max(1, latestGenerationAttempt(run, contract.contractHash, shotId));
    const jobId = jobIdFor(run.runId, contract.contractHash, attempt, shotId);
    let job = run.jobs.find((candidate) => candidate.jobId === jobId);
    if (!job?.providerTaskId) throw new GenerationMaterializationError("A provider task id is required before materialization");
    const providerTaskId = job.providerTaskId;
    const existing = run.artifacts.find((artifact) => artifact.jobId === jobId && ["image", "video", "audio"].includes(artifact.kind) && artifact.status === "ready");
    if (existing?.contentHash) {
      if (job.status !== "ready") run = command(run, "job.status", { jobId, status: "ready", patch: {} }, `materialize-job:${jobId}`);
      const currentEnvelope = envelope(run.runId, jobId).read();
      if (currentEnvelope?.state === "provider_accepted") envelope(run.runId, jobId).markMaterialized();
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: job.providerTaskId, artifactId: existing.artifactId, contentHash: existing.contentHash, nextAction: "completed" };
    }
    const currentEnvelope = envelope(run.runId, jobId).read();
    if (!currentEnvelope?.providerTaskId || currentEnvelope.state !== "provider_accepted") throw new GenerationMaterializationError("Provider acceptance is required before materialization");
    const polled = currentEnvelope.lastPoll;
    if (!polled || isPendingProviderStatus(polled.status)) throw new GenerationMaterializationError("The provider task is still processing");
    if (isFailedProviderStatus(polled.status)) throw new GenerationMaterializationError("The provider task did not complete successfully");
    let extracted: { outputs: readonly GenerationProviderOutput[] };
    try {
      extracted = await adapter.materialize({ providerId: job.provider, providerTaskId: job.providerTaskId, raw: polled.raw });
    } catch (error) {
      if (error instanceof GenerationProviderObservationError) throw new GenerationMaterializationUnsupportedError();
      throw error;
    }
    if (extracted.outputs.length !== 1) throw new GenerationMaterializationError(extracted.outputs.length === 0 ? "Provider did not expose a materializable output" : "Single-shot generation returned more than one output");
    if (!deps.materializeOutput) throw new GenerationMaterializationUnsupportedError();
    const receipt = await deps.materializeOutput({ projectId: input.projectId, operationId: run.runId, run, job, contract, providerTaskId: job.providerTaskId, output: extracted.outputs[0] });
    const artifactId = typeof receipt.artifactId === "string" ? receipt.artifactId.trim() : "";
    const contentHash = typeof receipt.contentHash === "string" ? receipt.contentHash.trim() : "";
    const projectRelativePath = typeof receipt.projectRelativePath === "string" ? receipt.projectRelativePath.trim() : "";
    if (!artifactId || !contentHash || !projectRelativePath) throw new GenerationMaterializationError("Asset store returned an incomplete materialization receipt");
    run = requiredRun(deps.repository, input.projectId, input.operationId);
    job = run.jobs.find((candidate) => candidate.jobId === jobId) || job;
    const artifact: ProductionArtifact = {
      artifactId,
      stageId: "generate",
      jobId,
      kind: receipt.kind,
      status: "ready",
      source: "external-mcp",
      contentHash,
      projectRelativePath,
      ...(receipt.thumbnailRelativePath ? { thumbnailRelativePath: receipt.thumbnailRelativePath } : {}),
      createdAt: now(),
    };
    run = command(run, "artifact.add", { artifact }, `materialize-artifact:${artifact.artifactId}`);
    run = command(run, "job.status", { jobId, status: "ready", patch: { lastPollAt: job.lastPollAt } }, `materialize-job:${jobId}`);
    envelope(run.runId, jobId).markMaterialized();
    return { operationId: run.runId, runId: run.runId, jobId, providerTaskId, artifactId: artifact.artifactId, contentHash, nextAction: "completed" };
  }

  async function createNewAttempt(input: GenerationNewAttemptInput): Promise<GenerationNewAttemptResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const previousAttempt = Math.max(1, latestGenerationAttempt(run, contract.contractHash, shotId));
    const previousJob = run.jobs.find((job) => job.jobId === jobIdFor(run.runId, contract.contractHash, previousAttempt, shotId));
    if (!previousJob || previousJob.status !== input.reason) throw new SubmissionReconciliationRequiredError("A new attempt is only available after the selected submission issue is recorded");
    const runLock = lock(run.runId);
    return runLock.withLock(async (lease) => {
      run = requiredRun(deps.repository, input.projectId, input.operationId);
      const lockedContract = requiredContract(run, shotId);
      const lockedPreviousAttempt = Math.max(1, latestGenerationAttempt(run, lockedContract.contractHash, shotId));
      const lockedPreviousJob = run.jobs.find((job) => job.jobId === jobIdFor(run.runId, lockedContract.contractHash, lockedPreviousAttempt, shotId));
      if (!lockedPreviousJob || lockedPreviousJob.status !== input.reason) throw new SubmissionReconciliationRequiredError("The submission state changed; reconcile it before creating a new attempt");
      const nextAttempt = lockedPreviousAttempt + 1;
      const jobId = jobIdFor(run.runId, lockedContract.contractHash, nextAttempt, shotId);
      const binding = ensureBinding(deps, run, lockedContract, jobId, nextAttempt, lease.fencingEpoch, shotId);
      const job: ProductionJob = {
        jobId,
        stageId: "generate",
        status: "authorized",
        attempt: nextAttempt,
        provider: lockedContract.providerId,
        model: lockedContract.modelId,
        idempotencyKey: binding.providerIdempotencyKey,
        executionBinding: binding,
        requestFingerprint: binding.requestFingerprint,
        providerIdempotencyKey: binding.providerIdempotencyKey,
        runtimeEnvelopeRef: binding.runtimeEnvelopeRef,
        taskKind: lockedContract.mode,
        // P4 S6: 谱系留痕——新尝试从上一 job 派生，原结果仍可查（productionRunTypes.ts:163）。
        parentJobId: lockedPreviousJob.jobId,
        // P4 S1: carry the shot lineage so the reducer scopes attempt monotonicity + approval reset.
        ...(shotId ? { metadata: { shotId } } : {}),
        createdAt: now(),
        updatedAt: now(),
      };
      run = command(run, "generation.new_attempt", { job, ...(shotId ? { shotId } : {}) }, `new-attempt-${shotId ? `${shotId}-` : ""}${nextAttempt}`);
      return {
        operationId: run.runId,
        runId: run.runId,
        jobId,
        attempt: nextAttempt,
        contractHash: lockedContract.contractHash,
        requiresFreshReceipt: true,
        nextAction: "request_gate",
        warning: "这是一次新的提交尝试；上一次结果仍可能已计费，请先确认后再提交。",
        parentJobId: lockedPreviousJob.jobId,
      };
    });
  }

  /**
   * P4 S6 返工：对任意终态的一镜发起「同 Run 新 Job」。复用 `generation.new_attempt` 命令（reducer 已通用：
   * 同镜谱系 attempt 单调 + 只清该镜 approval，不连坐兄弟镜），设 parentJobId 留痕，返回 `request_gate`——
   * 调用方随后起**单镜 gate（该镜子合同单价）**确认，铸 receipt 后 approve 该 attempt、kick scheduler 派发。
   * 锚 character_ref 与 DNA 提示词天然继承：新 job 复用该镜现有子合同（requiredContract(run, shotId)），
   * 其 references 就是锚（§3.2「每镜 references 自动带锚」）。
   */
  async function reworkShot(input: GenerationReworkInput): Promise<GenerationReworkResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const previousAttempt = Math.max(1, latestGenerationAttempt(run, contract.contractHash, shotId));
    const previousJob = run.jobs.find((job) => job.jobId === jobIdFor(run.runId, contract.contractHash, previousAttempt, shotId));
    // 返工必须有一个已存在的上一 job 可派生（这一镜从没生成过 → 走正常首次派发，不是返工）。
    if (!previousJob) throw new Error("No prior submission to rework for this shot");
    const runLock = lock(run.runId);
    return runLock.withLock(async (lease) => {
      run = requiredRun(deps.repository, input.projectId, input.operationId);
      const lockedContract = requiredContract(run, shotId);
      const lockedPreviousAttempt = Math.max(1, latestGenerationAttempt(run, lockedContract.contractHash, shotId));
      const lockedPreviousJob = run.jobs.find((job) => job.jobId === jobIdFor(run.runId, lockedContract.contractHash, lockedPreviousAttempt, shotId));
      if (!lockedPreviousJob) throw new Error("No prior submission to rework for this shot");
      const nextAttempt = lockedPreviousAttempt + 1;
      const jobId = jobIdFor(run.runId, lockedContract.contractHash, nextAttempt, shotId);
      const binding = ensureBinding(deps, run, lockedContract, jobId, nextAttempt, lease.fencingEpoch, shotId);
      const job: ProductionJob = {
        jobId,
        stageId: "generate",
        status: "authorized",
        attempt: nextAttempt,
        provider: lockedContract.providerId,
        model: lockedContract.modelId,
        idempotencyKey: binding.providerIdempotencyKey,
        executionBinding: binding,
        requestFingerprint: binding.requestFingerprint,
        providerIdempotencyKey: binding.providerIdempotencyKey,
        runtimeEnvelopeRef: binding.runtimeEnvelopeRef,
        taskKind: lockedContract.mode,
        parentJobId: lockedPreviousJob.jobId,
        retryReason: "rework",
        // 继承上一 job 的 nodeId：返工的新版落回**同一画布节点**（版本切换的前提），不新建节点。
        ...(lockedPreviousJob.nodeId ? { nodeId: lockedPreviousJob.nodeId } : {}),
        ...(shotId ? { metadata: { shotId } } : {}),
        createdAt: now(),
        updatedAt: now(),
      };
      run = command(run, "generation.new_attempt", { job, ...(shotId ? { shotId } : {}) }, `rework-${shotId ? `${shotId}-` : ""}${nextAttempt}`);
      return {
        operationId: run.runId,
        runId: run.runId,
        jobId,
        attempt: nextAttempt,
        contractHash: lockedContract.contractHash,
        requiresFreshReceipt: true,
        nextAction: "request_gate",
        parentJobId: lockedPreviousJob.jobId,
      };
    });
  }

  async function resume(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionResumeResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const attempt = input.attempt ?? Math.max(1, latestGenerationAttempt(run, contract.contractHash, shotId));
    const jobId = jobIdFor(run.runId, contract.contractHash, attempt, shotId);
    const job = run.jobs.find((candidate) => candidate.jobId === jobId);
    if (!job) return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    const currentEnvelope = envelope(run.runId, jobId).read();
    if (!currentEnvelope) return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    if (input.definitelyNotSubmitted === true && ["submission_unknown", "needs_attention"].includes(job.status)) {
      const committed = intentLog(run.runId).list().some((intent) => intent.key === `${run.runId}:${jobId}:${job.attempt}` && intent.status === "committed");
      if (committed) return { operationId: run.runId, action: "reconcile", reason: "submission_receipt_unknown", nextAction: "reconcile" };
      if (currentEnvelope.state === "submitted_unknown") envelope(run.runId, jobId).markDefinitelyNotSubmitted();
      // Suffix carries jobId so a per-shot explicit retry never dedupes against a sibling shot.
      run = command(run, "job.status", { jobId, status: "submit_intent_persisted", patch: {} }, `explicit-retry:${jobId}`);
      return { ...(await start({ projectId: run.projectId, operationId: run.runId, definitelyNotSubmitted: true, ...(shotId ? { shotId } : {}) })), action: "dispatch", nextAction: "dispatch" };
    }
    const decision = classifyGenerationResume({ jobStatus: job.status, providerTaskId: job.providerTaskId, envelopeState: currentEnvelope.state, definitelyNotSubmitted: input.definitelyNotSubmitted });
    if (decision.action === "poll") return { operationId: run.runId, ...decision, nextAction: "poll", providerTaskId: job.providerTaskId };
    if (decision.action === "reconcile") return { operationId: run.runId, ...decision, nextAction: "reconcile" };
    if (decision.action === "dispatch") return { ...(await start(input)), action: "dispatch", nextAction: "dispatch" };
    return { operationId: run.runId, ...decision, nextAction: "attention" };
  }

  return { start, poll, materialize, createNewAttempt, reworkShot, resume };
}

export type ProductionGenerationSubmission = ReturnType<typeof createProductionGenerationSubmission>;
