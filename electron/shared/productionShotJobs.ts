import type { ProductionJob, ProductionRun } from "../productionRun/productionRunTypes";

/** Statuses that have not crossed the provider submission boundary yet. */
export function isUnsubmittedJobStatus(status: ProductionJob["status"]): boolean {
  switch (status) {
    case "planned":
    case "authorization_required":
    case "authorized":
      return true;
    default:
      return false;
  }
}

/** Stable shot address for both multi-shot metadata and legacy single-shot plans. */
export function productionShotId(run: ProductionRun, shotId: string): string | undefined {
  if (run.generationPlan?.shots?.length) return shotId;
  return run.generationPlan?.candidate.candidateId === shotId ? shotId : undefined;
}

/** The one owner of the shot → generation job correspondence. */
export function jobsForShot(run: ProductionRun, shotId: string): ProductionJob[] {
  if (!productionShotId(run, shotId)) return [];
  const multiShot = Boolean(run.generationPlan?.shots?.length);
  return run.jobs.filter((job) => job.stageId === "generate" && (multiShot ? job.metadata?.shotId === shotId : true));
}

export function latestJobForShot(run: ProductionRun, shotId: string): ProductionJob | undefined {
  return jobsForShot(run, shotId)
    .slice()
    .sort((a, b) => (b.attempt - a.attempt) || (Date.parse(b.createdAt) - Date.parse(a.createdAt)))[0];
}
