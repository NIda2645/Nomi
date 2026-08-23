import crypto from "node:crypto";
import path from "node:path";

import {
  createGenerationRuntimeAdapter,
  assertGenerationProviderCapabilities,
  resolveExecutionContract,
  type GenerationProvider,
} from "../capabilityCore/generationRuntimeAdapter";
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
import type { ProductionJob, ProductionRun } from "./productionRunTypes";

export { SubmissionReceiptUnknownError, SubmissionReconciliationRequiredError };

export type GenerationSubmissionStartInput = {
  projectId: string;
  operationId: string;
  definitelyNotSubmitted?: boolean;
};

export type GenerationSubmissionResult = {
  operationId: string;
  runId: string;
  jobId: string;
  providerTaskId: string;
  nextAction: "observe";
};

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
  provider: GenerationProvider;
  now?: () => string;
  runtimeTaskId?: (input: { runId: string; contractHash: string }) => string;
  afterProviderAcceptance?: (input: { providerTaskId: string; run: ProductionRun }) => void | Promise<void>;
  beforeDispatch?: (input: { run: ProductionRun; job: ProductionJob }) => void | Promise<void>;
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

function requiredContract(run: ProductionRun): ExecutionContractV1 {
  const plan = run.generationPlan;
  if (!plan?.contract || (plan.state !== "sealed" && plan.state !== "submitted")) {
    throw new Error("Seal and confirm the generation plan before starting");
  }
  return plan.contract;
}

function jobIdFor(runId: string, contractHash: string): string {
  return `generation-${runId}-${contractHash.slice(0, 16)}`;
}

function envelopeRefFor(runId: string, jobId: string): string {
  return `.nomi/runs/${runId}/jobs/${jobId}/runtime-envelope.json`;
}

function ensureBinding(deps: ProductionGenerationSubmissionDependencies, run: ProductionRun, contract: ExecutionContractV1, jobId: string, fencingEpoch: number): ProductionExecutionBinding {
  const existing = run.jobs.find((job) => job.jobId === jobId)?.executionBinding;
  if (existing) {
    if (existing.contractHash !== contract.contractHash || existing.providerNamespace !== contract.providerId) {
      throw new Error("Sealed generation job binding does not match the current contract");
    }
    return existing;
  }
  const runtimeTaskId = deps.runtimeTaskId?.({ runId: run.runId, contractHash: contract.contractHash })
    || `runtime-${run.runId}-${contract.contractHash.slice(0, 16)}`;
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
    shotId: jobId,
    contractHash: contract.contractHash,
    runtimeTaskId,
    providerNamespace: contract.providerId,
    providerIdempotencyKey: `generation:${run.runId}:${contract.contractHash}`,
    requestFingerprint,
    runtimeEnvelopeRef: envelopeRefFor(run.runId, jobId),
    fencingEpoch,
  });
}

export function createProductionGenerationSubmission(deps: ProductionGenerationSubmissionDependencies) {
  const now = deps.now ?? (() => new Date().toISOString());
  const adapter = createGenerationRuntimeAdapter({ providers: [deps.provider] });

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

  function prepare(run: ProductionRun, contract: ExecutionContractV1, binding: ProductionExecutionBinding, jobId: string): { run: ProductionRun; envelope: ReturnType<typeof createProductionRunRuntimeEnvelope> } {
    let current = run;
    const existingJob = current.jobs.find((job) => job.jobId === jobId);
    if (!existingJob) {
      const job: ProductionJob = {
        jobId,
        stageId: "generate",
        status: "authorized",
        attempt: 1,
        provider: contract.providerId,
        model: contract.modelId,
        idempotencyKey: binding.providerIdempotencyKey,
        executionBinding: binding,
        requestFingerprint: binding.requestFingerprint,
        providerIdempotencyKey: binding.providerIdempotencyKey,
        runtimeEnvelopeRef: binding.runtimeEnvelopeRef,
        taskKind: contract.mode,
        createdAt: now(),
        updatedAt: now(),
      };
      current = command(current, "job.add", { job }, "job-add");
      const approvalId = `approval:generation:${current.runId}:${contract.contractHash}`;
      const existingApproval = deps.repository.readApprovals(current.projectId, current.runId).find((approval) => approval.approvalId === approvalId);
      if (!existingApproval) {
        current = deps.repository.execute(current.projectId, current.runId, {
          commandId: `generation.runtime:${current.runId}:approval-record`,
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
              maxSpend: 0,
              maxAttemptsPerJob: 1,
              decidedAt: now(),
              expiresAt: new Date(Date.parse(now()) + 24 * 60 * 60 * 1000).toISOString(),
            },
          },
          issuedAt: now(),
        }).run;
      }
      if (current.budget.authorized < 0) throw new Error("Invalid generation budget authorization");
      if (current.budget.authorized === 0 && current.budget.reserved === 0 && current.budget.actual === 0 && current.budget.unsettled === 0) {
        current = command(current, "budget.entry", {
          entry: { billingEntryId: `${approvalId}:authorize`, kind: "authorize", amount: 0, occurredAt: now() },
        }, "budget-authorize");
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
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run);
    const jobId = jobIdFor(run.runId, contract.contractHash);
    const existingJob = run.jobs.find((job) => job.jobId === jobId);
    if (existingJob?.status === "provider_accepted" && existingJob.providerTaskId) {
      if (run.generationPlan?.state !== "submitted") run = command(run, "generation.submit", {}, "plan-submit");
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: existingJob.providerTaskId, nextAction: "observe" };
    }
    if (existingJob && ["submission_unknown", "reconciling", "needs_attention", "cancel_requested"].includes(existingJob.status)) {
      throw new SubmissionReconciliationRequiredError();
    }
    assertGenerationProviderCapabilities(deps.provider);

    const runLock = lock(run.runId);
    return runLock.withLock(async (lease) => {
      run = requiredRun(deps.repository, input.projectId, input.operationId);
      const lockedContract = requiredContract(run);
      if (lockedContract.contractHash !== contract.contractHash) throw new Error("Generation contract changed while waiting for the Run lock");
      const binding = ensureBinding(deps, run, lockedContract, jobId, lease.fencingEpoch);
      const prepared = prepare(run, lockedContract, binding, jobId);
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
      const approvalId = `approval:generation:${run.runId}:${lockedContract.contractHash}`;
      const result = await outbox.submit({
        projectId: run.projectId,
        runId: run.runId,
        jobId,
        approvalId,
        planHash: lockedContract.contractHash,
        costCeiling: 0,
        currency: run.budget.currency,
        allowRetryAfterAbort: input.definitelyNotSubmitted === true,
      });
      run = result.run;
      if (run.generationPlan?.state !== "submitted") run = command(run, "generation.submit", {}, "plan-submit");
      return { operationId: run.runId, runId: run.runId, jobId, providerTaskId: result.providerTaskId, nextAction: "observe" };
    });
  }

  async function resume(input: GenerationSubmissionStartInput): Promise<GenerationSubmissionResumeResult> {
    let run = requiredRun(deps.repository, input.projectId, input.operationId);
    const contract = requiredContract(run);
    const jobId = jobIdFor(run.runId, contract.contractHash);
    const job = run.jobs.find((candidate) => candidate.jobId === jobId);
    if (!job) return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    const currentEnvelope = envelope(run.runId, jobId).read();
    if (!currentEnvelope) return { operationId: run.runId, action: "attention", reason: "invalid_recovery_state", nextAction: "attention" };
    if (input.definitelyNotSubmitted === true && ["submission_unknown", "needs_attention"].includes(job.status)) {
      const committed = intentLog(run.runId).list().some((intent) => intent.key === `${run.runId}:${jobId}:${job.attempt}` && intent.status === "committed");
      if (committed) return { operationId: run.runId, action: "reconcile", reason: "submission_receipt_unknown", nextAction: "reconcile" };
      if (currentEnvelope.state === "submitted_unknown") envelope(run.runId, jobId).markDefinitelyNotSubmitted();
      run = command(run, "job.status", { jobId, status: "submit_intent_persisted", patch: {} }, "explicit-retry");
      return { ...(await start({ projectId: run.projectId, operationId: run.runId, definitelyNotSubmitted: true })), action: "dispatch", nextAction: "dispatch" };
    }
    const decision = classifyGenerationResume({ jobStatus: job.status, providerTaskId: job.providerTaskId, envelopeState: currentEnvelope.state, definitelyNotSubmitted: input.definitelyNotSubmitted });
    if (decision.action === "poll") return { operationId: run.runId, ...decision, nextAction: "poll", providerTaskId: job.providerTaskId };
    if (decision.action === "reconcile") return { operationId: run.runId, ...decision, nextAction: "reconcile" };
    if (decision.action === "dispatch") return { ...(await start(input)), action: "dispatch", nextAction: "dispatch" };
    return { operationId: run.runId, ...decision, nextAction: "attention" };
  }

  return { start, resume };
}

export type ProductionGenerationSubmission = ReturnType<typeof createProductionGenerationSubmission>;
