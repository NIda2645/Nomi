import type { ProductionGenerationShot, ProductionJob, ProductionRun } from "../productionRun/productionRunTypes";

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

/** 这一镜勾没勾进这一批（`included` 缺省 = 勾进了）。 */
export function shotIncluded(shot: Pick<ProductionGenerationShot, "included">): boolean {
  return shot.included !== false;
}

/**
 * 这一镜还算不算这一批要交的活——批次「做完没有」和排队「第 n / N」都按它数，唯一的判据。三种情况不算：
 * - 没勾进这一批（`included:false`）；
 * - 从没被批过（一次任务都没有）：调度器只派有任务的镜（`batchScheduleDerivation.needsDispatch`），没被批的镜
 *   不是这一批的活——把它数进来，排队会说「第 1/2」而第 2 镜永远不会来，批次也永远凑不满（付费卡① 第 12 条）；
 * - 这一镜最新那次尝试已经被制作放手（`detached`：画布上删了它的节点、画布接手了它、返工门被拒）。制作不会再派它，
 *   这一批也等不到它的结果。以前它被数成「在跑」，批次永远凑不满完成数，Run 一直停在 running（2026-09-29 #921 彩排）。
 * 已经交给供应商的那次（在跑 / 已出片）照样算：钱花了，结果要收尾。
 */
export function shotCountsTowardBatch(run: ProductionRun, shot: Pick<ProductionGenerationShot, "shotId" | "included">): boolean {
  const latest = latestJobForShot(run, shot.shotId);
  return shotIncluded(shot) && latest !== undefined && latest.status !== "detached";
}
