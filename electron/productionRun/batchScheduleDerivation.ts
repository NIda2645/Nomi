import type {
  ProductionGate,
  ProductionGenerationPlan,
  ProductionGenerationShot,
  ProductionJob,
  ProductionRunStatus,
  ProductionRun,
} from "./productionRunTypes";
import { productionGenerationJobId } from "./productionGenerationAuthorization";
import { jobAwaitsHuman, productionJobPhase } from "../shared/productionShotPhase";
import { decideShotClaim } from "../shared/decideShotClaim";
import { jobsForShot, shotCountsTowardBatch, shotIncluded } from "../shared/productionShotJobs";
import { isStoppedRunStatus } from "../shared/productionRunStop";

/**
 * P4 S4 — the pure batch derivation. This is the heart of "调度器无自有持久状态" (plan §1).
 *
 * ## Why there is no second source of truth
 *
 * The scheduler owns NO mutable state. Every tick recomputes "the next dispatch set" purely from the
 * durable Run — `plan.shots` (anchors + video shots, partitioned by role) + `jobs[]` + the anchor
 * checkpoint gate. A crash-restart re-runs THIS SAME function over the reloaded Run and gets THE SAME
 * answer, because:
 *
 *   - "has this unit been dispatched?" = does `jobs[]` contain a job for `(shotId, currentAttempt)`?
 *     The jobId is derived by the shared ProductionRun authorization identity helper,
 *     so the durable job list IS the ledger of what was submitted. We never keep a private set.
 *   - "may this unit be dispatched?" = is its job `authorized` — i.e. did a person approve the gate that
 *     covers exactly this shot (one approval per click on the paid card). There is no Run-level spend
 *     halt any more (2026-10-01, paid card ①): it judged a whole batch against one ceiling, but approvals
 *     are per shot, so it could only ever stop shots a person had approved. The ledger's reserve stays
 *     the hard wall at dispatch, and whether the approval is still fresh is judged at dispatch too
 *     (`productionDispatchConsent`) — neither is a scheduling decision.
 *   - "did the anchor pass?" = the anchor checkpoint gate's status, written into the Run (never the
 *     renderer store). Waiting → shots blocked; approved → shots released.
 *
 * This mirrors the already-shipped `latestGenerationAttempt` pattern (derive attempt from jobs[], never
 * self-count), so the two layers agree by construction and recovery cannot double-submit or over-spend.
 *
 * Pure: no IO, no clock read (the caller passes `now`), no provider call. The scheduler orchestrator
 * turns this plan into side effects (reserve + submit inside the Run lock); this function only decides.
 */

/**
 * A unit (anchor or shot) cleared for dispatch this tick: which shotId, which attempt (derived from
 * its lineage / attemptCount), and its sealed contract hash (for the jobId the orchestrator will submit).
 */
export type DispatchTask = {
  shotId: string;
  attempt: number;
  contractHash: string;
};

/**
 * The anchor checkpoint decision for this tick (plan §3.2). The orchestrator acts on it:
 *   - `not_required` — no anchor-role shots; skip the checkpoint entirely.
 *   - `pending_anchors` — anchors still generating; nothing to open yet.
 *   - `should_open` — all anchors ready, no gate yet → open a `scope:'anchor_checkpoint'` gate.
 *   - `waiting` — gate open, user has not decided → shots stay blocked.
 *   - `approved` — user approved the look → release shots.
 *   - `rejected` — user rejected → re-attempt ONLY the anchor (shots stay blocked).
 *
 * There is deliberately NO idle-timeout release (2026-09-11 ruling): an approval gate never decides
 * itself. `waiting` stays `waiting` for as long as it takes; only a real person moves it.
 */
export type CheckpointStatus =
  | "not_required"
  | "pending_anchors"
  | "should_open"
  | "waiting"
  | "approved"
  | "rejected";

export type CheckpointState = {
  status: CheckpointStatus;
  /** The anchor job ids that are ready (for the orchestrator to reference when opening the gate). */
  readyAnchorJobIds: string[];
};

/** Progress projection over the video shots (for stop status queries). All derived from jobs[]. */
export type BatchProgress = {
  total: number;
  completed: number;
  inFlight: number;
  pending: number;
};

export type BatchDerivationInput = {
  runId: string;
  runStatus: ProductionRunStatus;
  plan: ProductionGenerationPlan;
  jobs: ProductionJob[];
  /** The current anchor checkpoint gate, if one was opened. */
  anchorGate?: ProductionGate;
  now: string;
  /** Full durable run. Ownership and shot/job correspondence must use this same record. */
  run: ProductionRun;
};

export type BatchDerivationResult = {
  anchorDispatch: DispatchTask[];
  shotDispatch: DispatchTask[];
  /**
   * Units whose current-attempt job is submitted and still pollable (`provider_accepted`/`polling`
   * with a providerTaskId). The orchestrator's observe loop polls these (with real waits) until they
   * settle — THIS is what lets a re-kick (project reopen / timer) advance a slow provider's in-flight
   * jobs after a restart: `needsDispatch` is false for them, so without this list a re-derivation
   * would say "nothing to do" and the jobs would sit at `processing` forever.
   */
  observe: DispatchTask[];
  checkpoint: CheckpointState;
  progress: BatchProgress;
  /**
   * 当前这次尝试已经确定没成的单元（参考卡与视频镜；没出片、也不会自己再出片：失败 / 供应商撤单 / 提交结果未知）。
   * 只看**当前尝试**：返工成功后，上一次失败的那个 job 不再算——以前按全部 job 数，重做成功的批次收尾时照样被判「有镜头没成」。
   */
  failedUnits: string[];
};

/** Job statuses that mean "this unit finished successfully" — never re-dispatch. */
const TERMINAL_DONE = new Set<ProductionJob["status"]>(["ready", "adopted"]);

/**
 * Post-submission, still-pollable statuses. Deliberately narrow: `needs_attention`/`submission_unknown`/
 * `reconciling`/`cancel_requested` have their own recovery flows (resume/reconcile/cancel), and
 * pre-submission statuses belong to `needsDispatch`. Requires a providerTaskId (poll needs one).
 */
const OBSERVABLE = new Set<ProductionJob["status"]>(["provider_accepted", "polling"]);

/** The current attempt for a shot = its attemptCount (a per-shot new_attempt bumps this), min 1. */
function currentAttemptOf(shot: ProductionGenerationShot): number {
  return Number.isInteger(shot.attemptCount) && (shot.attemptCount as number) >= 1 ? (shot.attemptCount as number) : 1;
}

/** The durable job (if any) for a shot's CURRENT attempt. Pure over jobs[]. */
function jobForShot(run: ProductionRun, shot: ProductionGenerationShot): ProductionJob | undefined {
  const hash = shot.contract?.contractHash;
  if (!hash) return undefined;
  const jobId = productionGenerationJobId(run.runId, hash, currentAttemptOf(shot), shot.shotId);
  return jobsForShot(run, shot.shotId).find((candidate) => candidate.jobId === jobId);
}

function shotFinished(run: ProductionRun, shot: ProductionGenerationShot): boolean {
  const job = jobForShot(run, shot);
  return Boolean(job && TERMINAL_DONE.has(job.status));
}

/** 这一镜的当前尝试确定没成：不会自己再出片，得有人重做或取消。 */
function shotFailed(run: ProductionRun, shot: ProductionGenerationShot): boolean {
  const job = jobForShot(run, shot);
  return Boolean(job && (productionJobPhase(job.status) === "failed" || job.status === "submission_unknown"));
}

function shotInFlight(run: ProductionRun, shot: ProductionGenerationShot): boolean {
  const job = jobForShot(run, shot);
  // authorization_required is still waiting for a human (`jobAwaitsHuman`, the one owner of that fact);
  // authorized/intent-persisted is dispatchable. Neither is provider work in flight.
  return Boolean(job
    && !jobAwaitsHuman(job.status)
    && !TERMINAL_DONE.has(job.status)
    && !DISPATCHABLE.has(job.status));
}

/**
 * Only a gate-authorized durable job can dispatch. A missing job belongs to a legacy/read-only Run; an
 * authorization_required job is still waiting for the human gate. submit_intent_persisted remains
 * dispatchable for crash recovery because the outbox intent log proves at-most-once provider submission.
 */
const DISPATCHABLE = new Set<ProductionJob["status"]>(["authorized", "submit_intent_persisted"]);
function needsDispatch(run: ProductionRun, shot: ProductionGenerationShot): boolean {
  if (!shot.contract?.contractHash) return false;
  if (!decideShotClaim(run, shot.shotId, "production").granted) return false;
  const job = jobForShot(run, shot);
  return Boolean(job && DISPATCHABLE.has(job.status));
}


function toTask(runId: string, shot: ProductionGenerationShot): DispatchTask {
  return { shotId: shot.shotId, attempt: currentAttemptOf(shot), contractHash: shot.contract!.contractHash };
}

/**
 * Anchor-role, included shots — the identity images the batch depends on. Anchors deliberately keep the
 * plain included rule: an anchor the canvas took back must keep holding its checkpoint, because the
 * checkpoint is where a person approves the look before the paid video shots run.
 */
function anchorsOf(plan: ProductionGenerationPlan): ProductionGenerationShot[] {
  // 逐镜（付费卡①）：卡上还没点的参考卡没有合同、也不是这一批的活——形象确认只等批过的那几张
  // （与 `anchorCheckpoint.currentAnchorCheckpointGate` 同一条：勾进这一批、有封印合同的参考卡）。
  return (plan.shots ?? []).filter((shot) => shot.role === "anchor" && shotIncluded(shot) && Boolean(shot.contract));
}

/**
 * Video-role (or unroled, backward compatible) shots this batch still owes — `shotCountsTowardBatch`, the one
 * membership rule (unchecked shots and shots production let go to the canvas are out). A released shot used to
 * stay in here with a `detached` job that counted as in flight, so the batch never completed and the Run sat in
 * `running` after its node was deleted or the canvas took it over.
 */
function videoShotsOf(run: ProductionRun, plan: ProductionGenerationPlan): ProductionGenerationShot[] {
  return (plan.shots ?? []).filter((shot) => shot.role !== "anchor" && shotCountsTowardBatch(run, shot));
}

/**
 * Resolve the anchor checkpoint decision for this tick. Pure over (anchors, jobs, gate, now, timeout).
 */
function deriveCheckpoint(input: BatchDerivationInput, anchors: ProductionGenerationShot[]): CheckpointState {
  if (anchors.length === 0) return { status: "not_required", readyAnchorJobIds: [] };
  const readyAnchorJobIds: string[] = [];
  for (const anchor of anchors) {
    const job = jobForShot(input.run, anchor);
    if (!job || !TERMINAL_DONE.has(job.status)) return { status: "pending_anchors", readyAnchorJobIds };
    readyAnchorJobIds.push(job.jobId);
  }

  const gate = input.anchorGate;
  if (!gate || gate.jobIds.length !== readyAnchorJobIds.length
    || gate.jobIds.some((jobId, index) => jobId !== readyAnchorJobIds[index])) return { status: "should_open", readyAnchorJobIds };
  if (gate.status === "approved") return { status: "approved", readyAnchorJobIds };
  if (gate.status === "rejected") return { status: "rejected", readyAnchorJobIds };
  // waiting (or expired/revoked treated as still-blocking). No timeout branch exists on purpose:
  // waiting never ages into a decision, so a user who walks away can never come back to a paid batch
  // that started without him.
  return { status: "waiting", readyAnchorJobIds };
}

/**
 * Derive the next batch to dispatch. See the module doc for why this is a pure recompute with no
 * second source of truth. The orchestrator calls this every tick and again on crash-recovery.
 */
export function deriveBatchPlan(input: BatchDerivationInput): BatchDerivationResult {
  const anchors = anchorsOf(input.plan);
  const videoShots = videoShotsOf(input.run, input.plan);

  // Mixed batches retain their video progress; an anchor-only request tracks its actual paid units.
  const progressShots = videoShots.length > 0 ? videoShots : anchors;
  let completed = 0;
  let inFlight = 0;
  for (const shot of progressShots) {
    if (shotFinished(input.run, shot)) completed += 1;
    else if (shotInFlight(input.run, shot)) inFlight += 1;
  }
  const progress: BatchProgress = {
    total: progressShots.length,
    completed,
    inFlight,
    pending: progressShots.length - completed - inFlight,
  };

  const checkpoint = deriveCheckpoint(input, anchors);
  const failedUnits = [...anchors, ...videoShots].filter((shot) => shotFailed(input.run, shot)).map((shot) => shot.shotId);

  // In-flight units to keep polling (anchors first, then shots — plan order). Derived purely from
  // jobs[], so a crash-restart recomputes the same list and the observe loop resumes where it left off.
  const observe: DispatchTask[] = [];
  for (const shot of [...anchors, ...videoShots]) {
    const job = jobForShot(input.run, shot);
    if (job && OBSERVABLE.has(job.status) && job.providerTaskId) observe.push(toTask(input.runId, shot));
  }

  // Stop semantics (plan §3.3/§4): a stopped run dispatches nothing NEW (未提交=不提交不扣费).
  // In-flight jobs still settle: they are already paid for, so `observe` keeps them pollable and the
  // orchestrator lands their results; completed jobs are preserved (both reflected in `progress`).
  const stopped = isStoppedRunStatus(input.runStatus);
  if (stopped) {
    return { anchorDispatch: [], shotDispatch: [], observe, checkpoint, progress, failedUnits };
  }

  // Anchors go first. Any anchor still needing a job (fresh or a rejected-checkpoint re-attempt) is
  // dispatched now; while anchors are not all ready, or the checkpoint has not released, shots wait.
  const anchorDispatch = anchors
    .filter((anchor) => needsDispatch(input.run, anchor))
    .map((anchor) => toTask(input.runId, anchor));
  const checkpointReleased = checkpoint.status === "approved";
  if (anchors.length > 0 && !checkpointReleased) {
    // Anchors present but checkpoint not released → dispatch anchors (if any pending), block shots.
    return { anchorDispatch, shotDispatch: [], observe, checkpoint, progress, failedUnits };
  }

  // Checkpoint approved by a person, or no anchors at all → every approved, not-yet-started shot goes, in
  // checkbox order. Each one was approved on its own (its job is `authorized` only after its own gate was
  // approved), so there is nothing left to weigh here: no Run-level ceiling, no price (2026-10-01).
  const shotDispatch = videoShots
    .filter((shot) => needsDispatch(input.run, shot)) // finished, claimed, in flight or not approved → skip
    .map((shot) => toTask(input.runId, shot));

  return { anchorDispatch, shotDispatch, observe, checkpoint, progress, failedUnits };
}
