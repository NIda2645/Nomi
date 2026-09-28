import type { ProductionJob, ProductionRun } from "../productionRun/productionRunTypes";

export type ShotClaimRequester = "canvas" | "production";
export type ShotClaimHolder = "canvas" | "production" | "none";
export type ShotClaimReason =
  | "missing_run"
  | "missing_shot"
  | "plan_cancelled"
  | "shot_excluded"
  | "canvas_detached"
  | "awaiting_confirmation"
  | "gate_rejected"
  | "queued"
  | "in_flight"
  | "needs_reconcile"
  | "run_stopped"
  | "terminal";

export type ShotClaimDecision = {
  granted: boolean;
  holder: ShotClaimHolder;
  reason: ShotClaimReason;
};

const IN_FLIGHT: ReadonlySet<ProductionJob["status"]> = new Set([
  "submit_intent_persisted", "submitting", "provider_accepted", "polling", "retry_wait",
  "downloading", "validating_technical", "validating_content",
]);
const NEEDS_RECONCILE: ReadonlySet<ProductionJob["status"]> = new Set(["submission_unknown", "reconciling"]);
const TERMINAL: ReadonlySet<ProductionJob["status"]> = new Set([
  "ready", "adopted", "needs_attention", "cancelled_remote", "detached", "too_late", "cancel_requested",
]);
const STOPPED_RUNS: ReadonlySet<ProductionRun["status"]> = new Set(["pausing", "paused", "needs_attention", "cancelled"]);

function latestJob(run: ProductionRun, shotId: string): ProductionJob | undefined {
  const single = !run.generationPlan?.shots?.length;
  const jobs = run.jobs.filter((job) => {
    if (job.stageId !== "generate") return false;
    if (single) return true;
    return job.metadata?.shotId === shotId;
  });
  return jobs.sort((a, b) => (b.attempt - a.attempt) || (Date.parse(b.createdAt) - Date.parse(a.createdAt)))[0];
}

function decision(holder: ShotClaimHolder, reason: ShotClaimReason, requester: ShotClaimRequester): ShotClaimDecision {
  // A canvas node with no production Run is an ordinary canvas generation. The
  // absence of a production owner is therefore an explicit canvas grant.
  return { granted: holder === requester || (holder === "none" && requester === "canvas"), holder, reason };
}

/** The single durable, read-only claim decision shared by canvas and production callers. */
export function decideShotClaim(
  run: ProductionRun | null | undefined,
  shotId: string | undefined,
  requester: ShotClaimRequester,
): ShotClaimDecision {
  if (!run) return decision("none", "missing_run", requester);
  const plan = run.generationPlan;
  if (!plan || !shotId) return decision("none", "missing_shot", requester);
  if (plan.state === "cancelled") return decision("canvas", "plan_cancelled", requester);

  const single = !plan.shots?.length;
  const shot = single ? undefined : plan.shots?.find((candidate) => candidate.shotId === shotId);
  if (!single && !shot) return decision("none", "missing_shot", requester);
  if (shot?.included === false) return decision("canvas", "shot_excluded", requester);

  const detached = plan.canvasDetached === true || shot?.canvasDetached === true;
  const gate = plan.authorizationGateId ? run.gates.find((candidate) => candidate.gateId === plan.authorizationGateId) : undefined;
  const gateRejected = gate?.status === "rejected" || gate?.status === "expired" || gate?.status === "revoked";
  const job = latestJob(run, shotId);

  // A detached shot may finish an already-paid attempt, but never starts a new one.
  if (job && NEEDS_RECONCILE.has(job.status)) return decision("production", "needs_reconcile", requester);
  if (job && IN_FLIGHT.has(job.status)) return decision("production", "in_flight", requester);
  if (detached) return decision("canvas", "canvas_detached", requester);

  if (plan.state !== "submitted") {
    if (plan.cardHidden === true) return decision("canvas", "shot_excluded", requester);
    if (gateRejected) return decision("canvas", "gate_rejected", requester);
    return decision("production", "awaiting_confirmation", requester);
  }
  if (gateRejected) return decision("canvas", "gate_rejected", requester);
  if (gate && gate.status !== "approved") return decision("canvas", "awaiting_confirmation", requester);
  if (job && TERMINAL.has(job.status)) return decision("canvas", "terminal", requester);
  if (job && (job.status === "authorization_required" || job.status === "authorized")) {
    return STOPPED_RUNS.has(run.status)
      ? decision("canvas", "run_stopped", requester)
      : decision("production", "queued", requester);
  }
  if (!job) return STOPPED_RUNS.has(run.status)
    ? decision("canvas", "run_stopped", requester)
    : decision("production", "queued", requester);
  return STOPPED_RUNS.has(run.status)
    ? decision("canvas", "run_stopped", requester)
    : decision("production", "queued", requester);
}
