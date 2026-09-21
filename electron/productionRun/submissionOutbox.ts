import { dedupeSubmission } from "../submissionLedger";
import { authorizeSubmission } from "./approvalPolicy";
import type { ProductionRunRepository } from "./productionRunRepository";
import type { ProductionRunIntentLog } from "./productionRunIntentLog";
import type { ProductionRunLock, ProductionRunLockLease } from "./productionRunLock";
import type { ProductionJob, ProductionRun } from "./productionRunTypes";

export class SubmissionNotDispatchedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionNotDispatchedError";
  }
}

export class SubmissionReceiptUnknownError extends Error {
  constructor(message = "Provider submission receipt is unknown; reconciliation is required") {
    super(message);
    this.name = "SubmissionReceiptUnknownError";
  }
}

export class SubmissionReconciliationRequiredError extends Error {
  constructor(message = "Submission reconciliation is required before another provider call") {
    super(message);
    this.name = "SubmissionReconciliationRequiredError";
  }
}

export class SubmissionAuthorizationError extends Error {
  constructor(reason: string) {
    super(`Production submission is not authorized: ${reason}`);
    this.name = "SubmissionAuthorizationError";
  }
}

export type SubmissionOutboxRequest = {
  projectId: string;
  runId: string;
  jobId: string;
  approvalId: string;
  planHash: string;
  costCeiling: number | null;
  currency: string;
  /** Only a durable definitely-not-submitted disposition may reopen an aborted intent. */
  allowRetryAfterAbort?: boolean;
};

export type ProviderDispatchInput = {
  run: ProductionRun;
  job: ProductionJob;
  idempotencyKey: string;
  /** `null` = 目录算不出价。绝不是 0 元。 */
  costCeiling: number | null;
};

export type ProviderDispatchResult = {
  providerTaskId: string;
};

export type SubmissionOutboxDependencies = {
  repository: ProductionRunRepository;
  dispatch: (input: ProviderDispatchInput) => Promise<ProviderDispatchResult>;
  /** Optional Run-owned durable claim. Legacy callers without it retain their existing behavior. */
  intentLog?: ProductionRunIntentLog;
  /** Optional cross-process fencing lease. The durable claim carries its epoch. */
  lock?: ProductionRunLock;
  /** Reuse an already-held Run lock; prevents nested acquisition in one-shot orchestration. */
  lockLease?: ProductionRunLockLease;
  now?: () => string;
  beforeDispatch?: (input: ProviderDispatchInput) => void | Promise<void>;
  afterDispatch?: (result: ProviderDispatchResult, input: ProviderDispatchInput) => void | Promise<void>;
};

export type SubmissionOutboxResult = ProviderDispatchResult & {
  run: ProductionRun;
};

function requiredRun(repository: ProductionRunRepository, projectId: string, runId: string): ProductionRun {
  const run = repository.read(projectId, runId);
  if (!run) throw new Error(`Production run not found: ${runId}`);
  return run;
}

function requiredJob(run: ProductionRun, jobId: string): ProductionJob {
  const job = run.jobs.find((value) => value.jobId === jobId);
  if (!job) throw new Error(`Production job not found: ${jobId}`);
  return job;
}

export function createSubmissionOutbox(deps: SubmissionOutboxDependencies) {
  const now = deps.now ?? (() => new Date().toISOString());
  const inflight = new Map();

  function jobCommand(
    request: SubmissionOutboxRequest,
    suffix: string,
    status: ProductionJob["status"],
    patch: Partial<ProductionJob> = {},
  ): ProductionRun {
    const run = requiredRun(deps.repository, request.projectId, request.runId);
    return deps.repository.execute(request.projectId, request.runId, {
      commandId: `${request.runId}:${request.jobId}:${requiredJob(run, request.jobId).attempt}:${suffix}`,
      expectedRevision: run.revision,
      type: "job.status",
      payload: { jobId: request.jobId, status, patch },
      issuedAt: now(),
    }).run;
  }

  function budgetCommand(request: SubmissionOutboxRequest, suffix: string, entry: Record<string, unknown>): ProductionRun {
    const run = requiredRun(deps.repository, request.projectId, request.runId);
    return deps.repository.execute(request.projectId, request.runId, {
      commandId: `${request.runId}:${request.jobId}:${requiredJob(run, request.jobId).attempt}:budget:${suffix}`,
      expectedRevision: run.revision,
      type: "budget.entry",
      payload: { entry },
      issuedAt: now(),
    }).run;
  }

  function markSubmissionUnknown(request: SubmissionOutboxRequest): ProductionRun {
    let run = requiredRun(deps.repository, request.projectId, request.runId);
    const job = requiredJob(run, request.jobId);
    if (job.status === "submitting") run = jobCommand(request, "submission-unknown", "submission_unknown");
    const reservationId = `${request.runId}:${request.jobId}:${job.attempt}`;
    const ledger = deps.repository.readBudgetLedger(request.projectId, request.runId);
    if (ledger.reservations[reservationId]?.status === "reserved") {
      run = budgetCommand(request, "mark-unsettled", {
        billingEntryId: `${reservationId}:mark-unsettled`,
        kind: "mark_unsettled",
        reservationId,
        occurredAt: now(),
      });
    }
    return run;
  }

  /**
   * 「这次提交**一个字节都没写出去**」——确定态，不是未知态。
   *
   * 与 `markSubmissionUnknown` 的区别就是这条轴上的全部意义：unknown 说的是
   * 「供应商可能已经收下并开始扣费」，所以它把预留改成 `unsettled`（钱悬着）、
   * 把这一镜交给人工对账；而这里说的是「供应商那边什么都没发生」，
   * 所以预留可以 **provider-safe 地释放**（钱一分没花），job 落在 `needs_attention`
   * 这个**确定**的失败态上——它可以被正常重试路径重新授权，不需要任何人去供应商核对。
   *
   * 判据不在这里：它由 `outboundDispatchEvidence.ts` 一个人答，而且拿不出证据就算 unknown。
   */
  function markNotDispatched(request: SubmissionOutboxRequest, reason: string): ProductionRun {
    let run = requiredRun(deps.repository, request.projectId, request.runId);
    const job = requiredJob(run, request.jobId);
    if (job.status === "submitting" || job.status === "submit_intent_persisted") {
      run = jobCommand(request, "not-dispatched", "needs_attention", {
        errorCode: "provider_not_reached",
        errorMessage: reason,
      });
    }
    const reservationId = `${request.runId}:${request.jobId}:${job.attempt}`;
    const ledger = deps.repository.readBudgetLedger(request.projectId, request.runId);
    if (ledger.reservations[reservationId]?.status === "reserved") {
      run = budgetCommand(request, "release-not-dispatched", {
        billingEntryId: `${reservationId}:release-not-dispatched`,
        kind: "release",
        reservationId,
        providerSafe: true,
        occurredAt: now(),
      });
    }
    return run;
  }

  async function submitOnce(request: SubmissionOutboxRequest, fencingEpoch = 0): Promise<SubmissionOutboxResult> {
    let run = requiredRun(deps.repository, request.projectId, request.runId);
    let job = requiredJob(run, request.jobId);
    if (job.status === "provider_accepted" && job.providerTaskId) {
      return { providerTaskId: job.providerTaskId, run };
    }
    if (["submission_unknown", "reconciling", "needs_attention", "cancel_requested"].includes(job.status)) {
      throw new SubmissionReconciliationRequiredError();
    }
    if (job.status === "submitting") {
      markSubmissionUnknown(request);
      throw new SubmissionReconciliationRequiredError();
    }
    if (job.status !== "authorized" && job.status !== "submit_intent_persisted") {
      throw new Error(`Production job cannot be submitted from status: ${job.status}`);
    }

    const intentKey = `${request.runId}:${request.jobId}:${job.attempt}`;
    const committedIntent = deps.intentLog?.list().find((intent) => intent.key === intentKey && intent.status === "committed");
    if (committedIntent) {
      markSubmissionUnknown(request);
      throw new SubmissionReconciliationRequiredError();
    }

    const approval = deps.repository.readApprovals(request.projectId, request.runId)
      .find((value) => value.approvalId === request.approvalId);
    if (!approval) throw new SubmissionAuthorizationError("approval-not-found");
    const authorization = authorizeSubmission({
      approval,
      job,
      policy: run.policy,
      now: now(),
      planHash: request.planHash,
      originHost: run.origin.host,
      estimatedCost: request.costCeiling,
      currency: request.currency,
      runId: request.runId,
    });
    if (!authorization.ok) throw new SubmissionAuthorizationError(authorization.reason);
    // 2026-09-21：`costCeiling === null`（目录算不出价）不再是拒绝的理由。它当初存在是因为
    // 账本只收金额，未知只能落成 0 —— 那才是真正要防的事。现在预留自己带「未知」这一档
    // （`amount: null`），于是「不当 0」和「能生成」同时成立，这道拒绝没有剩余的合法用途。
    // 已知价那条硬上限由 `authorizeSubmission` + 账本 reserve 原样守着。

    const reservationId = `${request.runId}:${request.jobId}:${job.attempt}`;
    const ledger = deps.repository.readBudgetLedger(request.projectId, request.runId);
    if (!ledger.reservations[reservationId]) {
      run = budgetCommand(request, "reserve", {
        billingEntryId: `${reservationId}:reserve`,
        kind: "reserve",
        reservationId,
        jobId: request.jobId,
        amount: request.costCeiling,
        occurredAt: now(),
      });
      job = requiredJob(run, request.jobId);
    }
    if (job.status === "authorized") {
      run = jobCommand(request, "submit-intent", "submit_intent_persisted");
      job = requiredJob(run, request.jobId);
    }

    const dispatchInput: ProviderDispatchInput = {
      run,
      job,
      idempotencyKey: `${request.runId}:${request.jobId}:${job.attempt}`,
      costCeiling: request.costCeiling,
    };
    await deps.beforeDispatch?.(dispatchInput);
    run = jobCommand(request, "submitting", "submitting");
    dispatchInput.run = run;
    dispatchInput.job = requiredJob(run, request.jobId);

    let submitIntent = deps.intentLog?.prepare({
      runId: request.runId,
      kind: "provider.submit",
      key: intentKey,
      payload: {
        projectId: request.projectId,
        runId: request.runId,
        jobId: request.jobId,
        attempt: dispatchInput.job.attempt,
        provider: dispatchInput.job.provider,
        model: dispatchInput.job.model,
        idempotencyKey: dispatchInput.idempotencyKey,
      },
      fencingEpoch,
      allowRetryAfterAbort: request.allowRetryAfterAbort,
    });
    if (submitIntent) submitIntent = deps.intentLog!.commit(submitIntent.intentId, { fencingEpoch });

    let response: ProviderDispatchResult;
    try {
      try {
        response = await deps.dispatch(dispatchInput);
      } catch (error) {
        // ── 「确定没写出去」→ 自动重发一次（且只有一次）。2026-09-18 拍板 ──
        //
        // 只有**能证明一个字节都没写出去**的失败走到这里（判据在
        // `outboundDispatchEvidence.ts`，拿不出证据一律算 unknown）。这种失败里供应商那边
        // 什么都没发生：不重发的代价是把一次本可自愈的网络抖动变成一张需要人去供应商核对的
        // 单子，而这一笔钱用户刚刚在报价卡上点过确认——重发同一笔不需要再问他一次。
        //
        // 三重保险让它不可能变成第二次下单：① 证据本身（读写字节都是 0）；
        // ② 幂等键逐字不变（`dispatchInput.idempotencyKey`，供应商档案声明了 submitIdempotency）；
        // ③ 只重发一次——第二次再失败就说明不是抖动，落回确定态 `needs_attention` 交给人。
        // 不碰意图日志：这一次尝试的 `provider.submit` 意图已经 committed，它覆盖的正是
        // 「同一个 attempt、同一个幂等键」的这两次调用；崩溃恢复看到它仍然正确地说「未知」。
        if (!(error instanceof SubmissionNotDispatchedError)) throw error;
        response = await deps.dispatch(dispatchInput);
      }
      if (!response.providerTaskId.trim()) throw new Error("Provider returned an empty task id");
      await deps.afterDispatch?.(response, dispatchInput);
      run = jobCommand(request, "provider-accepted", "provider_accepted", {
        providerTaskId: response.providerTaskId,
      });
      return { ...response, run };
    } catch (error) {
      const recovered = requiredRun(deps.repository, request.projectId, request.runId);
      const recoveredJob = requiredJob(recovered, request.jobId);
      if (recoveredJob.status === "provider_accepted" && recoveredJob.providerTaskId) {
        return { providerTaskId: recoveredJob.providerTaskId, run: recovered };
      }
      // 能证明「一个字节都没写出去」的失败是**确定态**，不是未知态。此前这里是一个
      // catch-all：连不上、DNS 解不出、从池里取到一条对面已关的 keep-alive 连接，
      // 统统被记成「供应商可能已经接受任务，Nomi 不会自动重提」，于是一次根本没发生过的
      // 提交把这一镜永久冻在人工对账里（2026-09-18 C9 间歇红的根因第二层）。
      if (error instanceof SubmissionNotDispatchedError) {
        markNotDispatched(request, error.message);
        throw error;
      }
      markSubmissionUnknown(request);
      throw new SubmissionReceiptUnknownError(error instanceof Error ? error.message : undefined);
    }
  }

  function submit(request: SubmissionOutboxRequest): Promise<SubmissionOutboxResult> {
    const key = `${request.projectId}:${request.runId}:${request.jobId}`;
    const execute = () => deps.lockLease
      ? (deps.lock?.assertOwned(deps.lockLease), submitOnce(request, deps.lockLease.fencingEpoch))
      : deps.lock
        ? deps.lock.withLock((lease) => submitOnce(request, lease.fencingEpoch))
        : submitOnce(request);
    return dedupeSubmission(inflight, key, execute, { ttlMs: 0 });
  }

  return { submit };
}

export type SubmissionOutbox = ReturnType<typeof createSubmissionOutbox>;
