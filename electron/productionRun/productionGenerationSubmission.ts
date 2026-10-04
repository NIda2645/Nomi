import crypto from "node:crypto";
import { findGenerationExecutionJob, readGenerationExecution } from "./productionGenerationHistory";
import path from "node:path";

import {
  createGenerationRuntimeAdapter,
  GenerationProviderObservationError,
  resolveExecutionContract,
  type GenerationProvider,
  type GenerationProviderOutput,
} from "../capabilityCore/generationRuntimeAdapter";
import type { ExecutionContractV1 } from "../capabilityCore/executionContract";
import {
  productionGenerationJobId,
  productionGenerationProviderIdempotencyKey,
} from "./productionGenerationAuthorization";
import { nextGenerationAttempt } from "./prepareProductionGenerationAuthorization";
import { authorizationGateForJob } from "../shared/productionSpendAuthority";
import { DispatchConsentLapsedError, dispatchConsentOpen } from "../shared/productionDispatchConsent";
import { createProductionRunRuntimeEnvelope } from "./productionRunRuntimeEnvelope";
import { createProductionRunIntentLog } from "./productionRunIntentLog";
import { productionRunPaths } from "./productionRunPaths";
import { createProductionRunLock } from "./productionRunLock";
import type { ProductionRunRepository } from "./productionRunRepository";
import { isTransportLevelFailure, outboundRequestWasNeverWritten } from "../outboundDispatchEvidence";
import {
  SubmissionNotDispatchedError,
  SubmissionReceiptUnknownError,
  SubmissionReconciliationRequiredError,
  createSubmissionOutbox,
} from "./submissionOutbox";
import { classifyGenerationResume, type GenerationResumeDecision } from "./productionRunResume";
import { createProductionExecutionBinding, type ProductionExecutionBinding } from "./productionExecutionBinding";
import { OUTPUT_RETRIEVAL_FAILED, type ProductionArtifact, type ProductionJob, type ProductionRun } from "./productionRunTypes";
import { tagNomiError } from "../shared/nomiErrorCodes";

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

/**
 * 供应商说成了、产物取不回来，而且再取一次也不会不一样（#975 A2）。抛出前这一镜已经**耐久地**进了
 * needs_attention（errorCode = output_retrieval_failed）：调用方据此把它当成「已结清」而不是「还在处理」，
 * 不许下一轮再查再下。仍是 GenerationMaterializationError（code materialization_failed），既有的单镜对账照旧认得。
 */
export class GenerationOutputRetrievalFailedError extends GenerationMaterializationError {
  constructor(message: string) {
    super(message);
    this.name = "GenerationOutputRetrievalFailedError";
  }
}

type RetrievalFailure = { code?: unknown; deterministic?: unknown; message?: unknown };

function deterministicRetrievalFailure(error: unknown): error is RetrievalFailure & { message: string } {
  const value = error as RetrievalFailure | null;
  return Boolean(value && typeof value === "object" && value.code === OUTPUT_RETRIEVAL_FAILED && value.deterministic === true);
}

export type GenerationSubmissionResumeResult = GenerationResumeDecision & {
  operationId: string;
  nextAction: "poll" | "reconcile" | "dispatch" | "attention";
  providerTaskId?: string;
};

export type ProductionGenerationSubmissionDependencies = {
  repository: ProductionRunRepository;
  projectRoot: string;
  immutableProjectUuid: string;
  projectGeneration: number;
  intentMacKey: string | NodeJS.TypedArray;
  provider?: GenerationProvider;
  providers?: readonly GenerationProvider[];
  now?: () => string;
  runtimeTaskId?: (input: { runId: string; contractHash: string; attempt?: number }) => string;
  afterProviderAcceptance?: (input: { providerTaskId: string; run: ProductionRun }) => void | Promise<void>;
  /**
   * 派发准入闸（生产里是镜头认领闸）。由提交 outbox 在这次尝试的第一笔耐久写（预留 / 提交意向）之前调用，
   * 看到的是还没落盘的 job；抛错 = 这一镜这次不提交，什么都没写（见 `SubmissionOutboxDependencies.beforeDispatch`）。
   */
  beforeDispatch: (input: { run: ProductionRun; job: ProductionJob }) => void | Promise<void>;
  /** Asset store owns bytes, identity and leases; the submission seam only commits its returned receipt. */
  materializeOutput?: (input: {
    projectId: string;
    operationId: string;
    run: ProductionRun;
    job: ProductionJob;
    contract: ExecutionContractV1;
    providerTaskId: string;
    output: GenerationProviderOutput;
  }) => Promise<Pick<ProductionArtifact, "artifactId" | "kind" | "contentHash" | "projectRelativePath" | "thumbnailRelativePath" | "width" | "height">>;
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
 * - No shotId → the default (single) shot: the top-level plan contract.
 * - shotId → that shot's sealed sub-contract.
 * 批没批准不在这里判：派发前 `prepareAuthorizedSubmission` 核「批这个 job 的那道门」（唯一判据），这里只要合同在。
 */
function requiredContract(run: ProductionRun, shotId?: string): ExecutionContractV1 {
  const plan = run.generationPlan;
  if (!plan || (plan.state !== "sealed" && plan.state !== "submitted")) {
    throw new Error("Seal and confirm the generation plan before starting");
  }
  if (shotId) {
    const shot = (plan.shots ?? []).find((candidate) => candidate.shotId === shotId);
    if (!shot?.contract) throw new Error("Seal and confirm the generation plan before starting");
    return shot.contract;
  }
  if (!plan.contract) throw new Error("Seal and confirm the generation plan before starting");
  return plan.contract;
}

/**
 * 「这次提交要发的是第几次尝试」**只有一个 owner**：`nextGenerationAttempt`（按 `metadata.shotId`
 * 数这一镜已有的 attempt）。授权在 job 落盘**之前**问它，拿到 `max + 1`；提交在 job 落盘**之后**问，
 * 要的就是那一条，于是 `- 1`。
 *
 * 这里原本另有一份 `latestGenerationAttempt`，按 jobId 前缀（含 contractHash）去数。它今天给的答案
 * 和这条一样，但口径不同：换了参数就换 contractHash，于是它对「同一镜的第几次」这个问题的回答
 * 会从头开始。一个语义两个推导式、两边都不报错 —— 那正是要收掉的形状（P1/R14.1）。
 *
 * P4 S1 identity: shotId is part of the jobId so two shots with identical parameters (equal contract
 * hash) never collide. The default shot keeps the legacy prefix (`generation-<run>-<hash16>`) so
 * durable Runs and single-shot callers are byte-compatible; a named shot inserts `-<shotId>` after it.
 */
export function addressedGenerationAttempt(run: ProductionRun, shotId?: string): number {
  return Math.max(1, nextGenerationAttempt(run, shotId) - 1);
}

function envelopeRefFor(runId: string, jobId: string): string {
  return `.nomi/runs/${runId}/jobs/${jobId}/runtime-envelope.json`;
}

type ProviderPollStatusClass = "pending" | "succeeded" | "failed" | "unknown";

/**
 * Provider adapters expose their native status verbatim.  The submission seam
 * must only advance a job for a status that is explicitly known to be pending,
 * successful, or failed.  Treating an unrecognised verb as success is unsafe
 * (it can materialize an incomplete output); treating it as pending is worse
 * (the observer can spin forever).  Keep this allow-list broad enough for the
 * shipped provider mappings, but fail closed for anything new.
 */
const PROVIDER_STATUS_CLASSES: Readonly<Record<ProviderPollStatusClass, ReadonlySet<string>>> = {
  pending: new Set([
    "submitted", "waiting", "queuing", "queued", "pending", "create", "created",
    "processing", "generating", "running", "in_progress", "in-progress", "in_queue",
    "queueing", "not_start", "notstart", "starting", "started", "downloading", "validating",
  ]),
  succeeded: new Set(["completed", "complete", "succeeded", "succeed", "success", "done"]),
  failed: new Set([
    "failed", "fail", "failure", "error", "cancelled", "canceled", "cancel", "rejected",
    "refused", "expired", "aborted", "timeout", "timed_out", "revoked",
  ]),
  unknown: new Set(),
};

function classifyProviderStatus(status: string): ProviderPollStatusClass {
  const normalized = status.trim().toLowerCase();
  if (PROVIDER_STATUS_CLASSES.pending.has(normalized)) return "pending";
  if (PROVIDER_STATUS_CLASSES.succeeded.has(normalized)) return "succeeded";
  if (PROVIDER_STATUS_CLASSES.failed.has(normalized)) return "failed";
  return "unknown";
}

function isPendingProviderStatus(status: string): boolean {
  return classifyProviderStatus(status) === "pending";
}

function isSuccessfulProviderStatus(status: string): boolean {
  return classifyProviderStatus(status) === "succeeded";
}

function isFailedProviderStatus(status: string): boolean {
  return classifyProviderStatus(status) === "failed";
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
  const providers = deps.providers ?? (deps.provider ? [deps.provider] : []);
  if (providers.length === 0) throw new Error("At least one generation provider is required");
  const adapter = createGenerationRuntimeAdapter({ providers });

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

  function prepareAuthorizedSubmission(
    run: ProductionRun,
    contract: ExecutionContractV1,
    jobId: string,
    attempt: number,
    fencingEpoch: number,
    shotId?: string,
  ): {
    run: ProductionRun;
    envelope: ReturnType<typeof createProductionRunRuntimeEnvelope>;
    approvalId: string;
    authorizationDigest: string;
    /** `null` = 目录算不出价（2026-09-21 开闸）。绝不是 0 元。 */
    costCeiling: number | null;
    currency: string;
    expectedProviderRequestHash: string;
    preparedProviderRequest: unknown;
  } {
    let current = run;
    const plan = current.generationPlan;
    const existingJob = current.jobs.find((job) => job.jobId === jobId);
    // 批这个 job 的**那一道门**（每点一次一份授权，信封住在门上）。不是计划上某一份：那一份已删——它让排在前面、
    // 已经批过的镜在下一次批准时失去授权，也让「只批这一镜」只能靠把别的镜移出这一批来实现（2026-09-30）。
    const gate = existingJob ? authorizationGateForJob(current, existingJob) : undefined;
    const authorizationEnvelope = gate?.authorizationEnvelope;
    const authorizationDigest = gate?.authorizationDigest;
    const gateId = gate?.gateId;
    if (!plan || !existingJob || !gate || !authorizationEnvelope || !authorizationDigest || !gateId) {
      throw new Error("This generation Run has no sealed paid authorization; it is read-only until re-planned");
    }
    if (
      // 派发时核的是「还是不是那个项目、那一个 Run、批它的那一道门」。**不核活的项目文档版本、也不核活的计划版本**：
      // 批准那一刻它们是前提（收据只对当时的版本有效，见 productionRunApprovalReceipt.assertCurrentProjectRevision），
      // 批准之后项目照常会变——Nomi 自己把占位和参考卡结果落到画布上、用户在卡上改下一镜，都会让它们前进。以前这里要求
      // 派发时它们仍等于封信封时的值，于是定妆照检查点放行、急停后继续、重开项目这些「批准之后过一会儿才派」的路一律报
      // 「Generation authorization no longer matches」，视频镜永远排队（2026-09-29 用户实见）。发出去的请求本身已由
      // 合同哈希、线上报文哈希、幂等键逐字钉死（下面那组比对），文档和计划怎么变都改不了它。
      authorizationEnvelope.immutableProjectUuid !== deps.immutableProjectUuid
      || authorizationEnvelope.projectGeneration !== deps.projectGeneration
      || authorizationEnvelope.projectId !== current.projectId
      || authorizationEnvelope.runId !== current.runId
      || authorizationEnvelope.gateId !== gateId
    ) {
      throw new Error("Generation authorization no longer matches the current project or Run");
    }
    const authorized = authorizationEnvelope.jobs.find((job) => job.jobId === jobId);
    const approvalId = `approval:${gateId}`;
    const approval = deps.repository.readApprovals(current.projectId, current.runId)
      .find((candidate) => candidate.approvalId === approvalId);
    if (
      !authorized
      || authorized.attempt !== attempt
      || authorized.contractHash !== contract.contractHash
      || authorized.providerId !== contract.providerId
      || authorized.modelId !== contract.modelId
      || authorized.providerIdempotencyKey !== productionGenerationProviderIdempotencyKey(current.runId, contract.contractHash, attempt, shotId)
      || existingJob.authorizationDigest !== authorizationDigest
      || existingJob.providerIdempotencyKey !== authorized.providerIdempotencyKey
      || gate.status !== "approved"
      || gate.planHash !== authorizationDigest
      || !gate.receiptId
      || !approval
      || approval.authorizationDigest !== authorizationDigest
      || approval.planHash !== authorizationDigest
      || approval.receiptId !== gate.receiptId
      || !approval.jobIds.includes(jobId)
    ) {
      throw new Error("Generation submission is not covered by the approved Run authorization");
    }
    // 「现在派出去还算不算用户同意过」只有一个判据（付费卡① 第 13 条，`productionDispatchConsent`）：离他最近一次点头
    // ——批准这一镜，或之后放行形象、停下后点「继续」——不超过同意窗口。以前这里拿信封封好那一刻起的 10 分钟判，
    // 于是放行形象、急停后继续、第二天重开这些「批准之后过一会儿才派」的路永远派不出去，镜头一直「排队中」。
    // 过了窗口 = 没有人替他续：这一镜不派，调度器接住这个错，批次如实停下等他再点一次（不是失败）。
    if (!dispatchConsentOpen(gate, now())) throw new DispatchConsentLapsedError(gateId, jobId);

    // This is the last zero-side-effect check. If provider serialization drifted since the gate,
    // nothing below (Run events, ledger, intents, runtime envelope or provider) is touched.
    const providerPreparation = adapter.prepareAuthorization({
      contract,
      providerIdempotencyKey: authorized.providerIdempotencyKey,
      referenceUrls: authorized.referenceUrls,
    });
    if (providerPreparation.providerRequestHash !== authorized.providerWirePayloadHash) {
      throw new Error("Provider wire payload no longer matches the approved authorization");
    }

    const binding = ensureBinding(deps, current, contract, jobId, attempt, fencingEpoch, shotId);
    if (!existingJob.executionBinding) {
      current = command(current, "job.patch", {
        jobId,
        patch: {
          executionBinding: binding,
          requestFingerprint: binding.requestFingerprint,
          providerIdempotencyKey: binding.providerIdempotencyKey,
          idempotencyKey: binding.providerIdempotencyKey,
          runtimeEnvelopeRef: binding.runtimeEnvelopeRef,
        },
      }, `job-bind:${jobId}`);
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
    return {
      run: current,
      envelope: sealedEnvelope,
      approvalId,
      authorizationDigest,
      costCeiling: authorized.price.maximum,
      currency: authorized.price.currency,
      expectedProviderRequestHash: authorized.providerWirePayloadHash,
      preparedProviderRequest: providerPreparation.providerRequest,
    };
  }

  async function start(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run, shotId);
    const attempt = input.attempt ?? addressedGenerationAttempt(run, shotId);
    if (!Number.isInteger(attempt) || attempt < 1) throw new Error("Generation attempt is invalid");
    let jobId = productionGenerationJobId(run.runId, contract.contractHash, attempt, shotId);
    const existingJob = run.jobs.find((job) => job.jobId === jobId);
    // 没有任何一份授权（门）盖着的旧 job 只能看、不能再发：它的那一轮授权已经不在了。
    if (existingJob && !authorizationGateForJob(run, existingJob)) {
      throw new Error("Historical generation execution is observation-only");
    }
    if (existingJob?.status === "provider_accepted" && existingJob.providerTaskId) {
      if (run.generationPlan?.state !== "submitted") run = command(run, "generation.submit", {}, `plan-submit:v${run.planVersion}`);
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: existingJob.providerTaskId, attempt, nextAction: "observe" };
    }
    if (existingJob && ["submission_unknown", "reconciling", "needs_attention", "cancel_requested"].includes(existingJob.status)) {
      throw new SubmissionReconciliationRequiredError();
    }
    const runLock = lock(run.runId);
    return runLock.withLock(async (lease) => {
      run = requiredRun(deps.repository, input.projectId, input.operationId);
      const lockedContract = requiredContract(run, shotId);
      if (lockedContract.contractHash !== contract.contractHash) throw new Error("Generation contract changed while waiting for the Run lock");
      const lockedAttempt = input.attempt ?? addressedGenerationAttempt(run, shotId);
      jobId = productionGenerationJobId(run.runId, lockedContract.contractHash, lockedAttempt, shotId);
      const prepared = prepareAuthorizedSubmission(run, lockedContract, jobId, lockedAttempt, lease.fencingEpoch, shotId);
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
        // 供应商档案真声明了幂等（并把键带到请求上）才允许在「结果未知」后用同一个键重发一次；
        // 目前没有任何生产供应商声明（APIMart 明确 false），所以生产里这条恒为 false。
        canResendAfterUnknown: (error, dispatchInput) =>
          providers.some((provider) => provider.providerId === dispatchInput.job.provider && provider.capabilities.submitIdempotency === true)
          && isTransportLevelFailure(error),
        dispatch: async (dispatchInput) => {
          const currentBinding = dispatchInput.job.executionBinding;
          if (!currentBinding) throw new Error("Generation job is missing its sealed execution binding");
          try {
            const result = await adapter.submit({
              contract: lockedContract,
              binding: currentBinding,
              expectedProviderRequestHash: prepared.expectedProviderRequestHash,
              preparedProviderRequest: prepared.preparedProviderRequest,
            });
            rawReceipt = result.raw;
            return { providerTaskId: result.providerTaskId };
          } catch (error) {
            // 「一个字节都没写出去」是**可证明**的一档（只认连上之前的失败：DNS / 建连 / TLS 握手前），
            // 它和「写出去了不知道结果」性质完全不同：前者供应商那边什么都没发生，后者可能已经在扣费。
            // 连上之后的任何失败（连接被重置、对面关闭、响应超时）都是后者。判据只有一个 owner：
            // `outboundDispatchEvidence.ts`。
            if (error instanceof SubmissionNotDispatchedError) throw error;
            if (outboundRequestWasNeverWritten(error)) {
              throw new SubmissionNotDispatchedError(error instanceof Error ? error.message : String(error));
            }
            prepared.envelope.markSubmittedUnknown();
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
      const result = await outbox.submit({
        projectId: run.projectId,
        runId: run.runId,
        jobId,
        approvalId: prepared.approvalId,
        planHash: prepared.authorizationDigest,
        costCeiling: prepared.costCeiling,
        currency: prepared.currency,
        allowRetryAfterAbort: input.definitelyNotSubmitted === true,
      });
      run = result.run;
      if (run.generationPlan?.state !== "submitted") run = command(run, "generation.submit", {}, `plan-submit:v${run.planVersion}`);
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: result.providerTaskId, attempt: lockedAttempt, nextAction: "observe" };
    });
  }

  async function poll(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionPollResult> {
    const run = requiredRun(deps.repository, input.projectId, input.operationId);
    const { job, contract } = readGenerationExecution(deps.repository, run, input);
    if (!job?.providerTaskId) throw new SubmissionReconciliationRequiredError("A provider task id is required before polling");

    // A completed immutable execution is read from its receipt; do not poll or rewrite it again.
    const stored = envelope(run.runId, job.jobId).read();
    if (stored?.state === "materialized") return {
      operationId: run.runId, runId: run.runId, jobId: job.jobId, providerTaskId: job.providerTaskId,
      providerStatus: stored.lastPoll?.status ?? "succeeded", nextAction: "materialize",
    };
    // 这笔任务的模型 / 模式从冻结合同里读、随查询递下去：供应商实例是每次新建的，
    // 它自己内存里记的「这笔任务用的哪个模型」活不过观察窗重踢 / 重开项目 / 重启（见 GenerationProviderTaskContext）。
    const result = await adapter.query({ providerId: job.provider, providerTaskId: job.providerTaskId, context: { modelId: contract.modelId, mode: contract.mode } });
    const providerStatus = result.providerStatus.trim();
    if (!providerStatus) throw new Error("Provider returned an empty poll status");
    const statusClass = classifyProviderStatus(providerStatus);
    const envelopeStore = envelope(run.runId, job.jobId);
    envelopeStore.markPolled({ status: providerStatus, raw: result.raw });
    const observedAt = now();
    const statusChanged = job.providerStatus !== providerStatus;
    const nextStatus = statusClass === "pending"
      ? "polling"
      : statusClass === "failed" || statusClass === "unknown"
        ? "needs_attention"
        : job.status;
    const patch = {
      providerStatus,
      lastPollAt: observedAt,
      ...(statusChanged ? { lastVendorStateChangeAt: observedAt } : {}),
      ...(statusClass === "failed"
        ? { errorCode: "provider_task_failed", errorMessage: "供应商任务已返回失败状态" }
        : statusClass === "unknown"
          ? { errorCode: "provider_status_unknown", errorMessage: "供应商返回了未识别的任务状态，需要人工核对" }
          : {}),
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
      nextAction: statusClass === "pending" ? "poll" : statusClass === "succeeded" ? "materialize" : "attention",
    };
  }

  async function materialize(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionMaterializeResult> {
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const execution = readGenerationExecution(deps.repository, run, input);
    const { contract } = execution;
    let job = execution.job;
    const jobId = job.jobId;
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
    if (!isSuccessfulProviderStatus(polled.status)) throw new GenerationMaterializationError("The provider returned an unknown status; reconcile before materialization");
    let extracted: { outputs: readonly GenerationProviderOutput[] };
    try {
      extracted = await adapter.materialize({ providerId: job.provider, providerTaskId: job.providerTaskId, raw: polled.raw });
    } catch (error) {
      if (error instanceof GenerationProviderObservationError) throw new GenerationMaterializationUnsupportedError();
      throw error;
    }
    if (extracted.outputs.length !== 1) throw new GenerationMaterializationError(extracted.outputs.length === 0 ? "Provider did not expose a materializable output" : "Single-shot generation returned more than one output");
    if (!deps.materializeOutput) throw new GenerationMaterializationUnsupportedError();
    let receipt: Awaited<ReturnType<NonNullable<typeof deps.materializeOutput>>>;
    try {
      receipt = await deps.materializeOutput({ projectId: input.projectId, operationId: run.runId, run, job, contract, providerTaskId: job.providerTaskId, output: extracted.outputs[0] });
    } catch (error) {
      if (!deterministicRetrievalFailure(error)) throw error;
      // 确定性的取回失败：记成「已生成但取回失败」，停下来交给人（重新取回免费、不重新生成）。
      // 人话带稳定码，渲染层按码说话（不重新生成、去任务面板点「重新取回」）。
      const current = requiredRun(deps.repository, input.projectId, input.operationId);
      const currentJob = current.jobs.find((candidate) => candidate.jobId === jobId);
      if (currentJob && currentJob.status !== "needs_attention") {
        command(current, "job.status", {
          jobId,
          status: "needs_attention",
          patch: {
            errorCode: OUTPUT_RETRIEVAL_FAILED,
            errorMessage: tagNomiError("output-retrieval-failed", `The provider finished this shot, but Nomi could not retrieve the result: ${error.message}`),
          },
        }, `retrieval-failed:${jobId}:${current.revision}`);
      }
      throw new GenerationOutputRetrievalFailedError(error.message);
    }
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
      ...(receipt.width && receipt.height ? { width: receipt.width, height: receipt.height } : {}),
      createdAt: now(),
    };
    run = command(run, "artifact.add", { artifact }, `materialize-artifact:${artifact.artifactId}`);
    run = command(run, "job.status", { jobId, status: "ready", patch: { lastPollAt: job.lastPollAt } }, `materialize-job:${jobId}`);
    envelope(run.runId, jobId).markMaterialized();
    return { operationId: run.runId, runId: run.runId, jobId, providerTaskId, artifactId: artifact.artifactId, contentHash, nextAction: "completed" };
  }

  async function resume(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionResumeResult> {
    const shotId = input.shotId;
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    // 恢复路径的既有契约：**找不到这次执行的那条 job 是一个可分诊的状态，不是异常。**
    // 主干上它返回 `attention/invalid_recovery_state`，让上层把这次恢复交回给用户处置；
    // 一路抛出去会把它变成一次没人接得住的失败。（冻结合同缺失仍然抛，主干也抛。）
    if (!findGenerationExecutionJob(run, input)) {
      return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    }
    const { job, currentAuthority } = readGenerationExecution(deps.repository, run, input);
    const jobId = job.jobId;
    const currentEnvelope = envelope(run.runId, jobId).read();
    if (!currentEnvelope) return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    if (currentAuthority && input.definitelyNotSubmitted === true && ["submission_unknown", "needs_attention"].includes(job.status)) {
      const committed = intentLog(run.runId).list().some((intent) => intent.key === `${run.runId}:${jobId}:${job.attempt}` && intent.status === "committed");
      if (committed) return { operationId: run.runId, action: "reconcile", reason: "submission_receipt_unknown", nextAction: "reconcile" };
      if (currentEnvelope.state === "submitted_unknown") envelope(run.runId, jobId).markDefinitelyNotSubmitted();
      // Suffix carries jobId so a per-shot explicit retry never dedupes against a sibling shot.
      run = command(run, "job.status", { jobId, status: "submit_intent_persisted", patch: {} }, `explicit-retry:${jobId}`);
      return { ...(await start({ projectId: run.projectId, operationId: run.runId, definitelyNotSubmitted: true, attempt: job.attempt, ...(shotId ? { shotId } : {}) })), action: "dispatch", nextAction: "dispatch" };
    }
    const decision = classifyGenerationResume({ jobStatus: job.status, providerTaskId: job.providerTaskId, envelopeState: currentEnvelope.state, definitelyNotSubmitted: input.definitelyNotSubmitted });
    if (decision.action === "poll") return { operationId: run.runId, ...decision, nextAction: "poll", providerTaskId: job.providerTaskId };
    if (decision.action === "reconcile") return { operationId: run.runId, ...decision, nextAction: "reconcile" };
    if (decision.action === "dispatch" && !currentAuthority) return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    if (decision.action === "dispatch") return { ...(await start(input)), action: "dispatch", nextAction: "dispatch" };
    return { operationId: run.runId, ...decision, nextAction: "attention" };
  }

  return { start, poll, materialize, resume };
}

export type ProductionGenerationSubmission = ReturnType<typeof createProductionGenerationSubmission>;
