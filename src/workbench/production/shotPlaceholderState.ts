// P4 S5 — 多镜占位节点的三态派生（纯函数，可单测）。真相源 = Run 的 jobs[] + status（无第二真相）。
//
// 占位态严格由 job.status 决定，**禁「永远等待生成」假进度**：无对应 job（reconcile 前 / 未派发）显「排队中」，
// 不显「生成中」。halt/急停用 warning 非 danger（§3.4）。失败镜复用 NodeErrorReport 视觉语言（在组件层）。
import type { ProductionRun, ProductionJob, ProductionJobStatus, ProductionRunStatus } from '../../../electron/productionRun/productionRunTypes'

export type ShotPlaceholderPhase = 'queued' | 'generating' | 'stopped' | 'failed' | 'done'

export type ShotPlaceholderState = {
  phase: ShotPlaceholderPhase
  /** 排队中：第 n / N（n=本镜在待生成序列里的位次，从 1 起；N=总镜数）。仅 queued 有。 */
  queueIndex?: number
  queueTotal?: number
  /** stopped 的原因：预算触顶(halt) 还是用户急停(stop)。文案据此选（提额续拍 / 继续剩余）。 */
  stoppedReason?: 'budget' | 'stopped'
  /** failed 的人话原因（供 NodeErrorReport 语言复用）。 */
  failureMessage?: string
}

// job.status → 三态映射（与 batchScheduleDerivation 的 TERMINAL_DONE / in-flight 判据同源）。
// 「排队中」不单列 set：generating/done/failed 都不命中即落到排队分支（含 planned/authorized 等 + 无 job）。
const GENERATING_STATUSES = new Set<ProductionJobStatus>(['submitting', 'provider_accepted', 'polling', 'retry_wait', 'downloading', 'validating_technical', 'validating_content'])
const DONE_STATUSES = new Set<ProductionJobStatus>(['ready', 'adopted'])
const FAILED_STATUSES = new Set<ProductionJobStatus>(['needs_attention', 'cancelled_remote', 'too_late'])
// 「已停」而非「失败」的 job 错因：预算触顶 / 急停到达这镜（可续拍，warning 非 danger）。provider 拒 = 真失败。
const HALT_ERROR_CODES = new Set(['budget_exhausted', 'budget_halt', 'batch_stopped', 'restart_recovery_required'])

/** run 整体处于「停」的态：急停(pausing/paused/cancelled) 或预算 halt(needs_attention)。 */
function runIsStopped(status: ProductionRunStatus): boolean {
  return status === 'pausing' || status === 'paused' || status === 'cancelled' || status === 'needs_attention'
}

/** 视频镜（非 anchor、included）——排队序列的分母 N 与位次都按它算（与调度器 videoShotsOf 同规则）。 */
function includedVideoShots(run: ProductionRun): { shotId: string }[] {
  return (run.generationPlan?.shots ?? []).filter((shot) => shot.role !== 'anchor' && shot.included !== false).map((shot) => ({ shotId: shot.shotId }))
}

function jobForNode(run: ProductionRun, nodeId: string): ProductionJob | undefined {
  // 取该节点最新一 job（同 shotId 多 attempt 时按 createdAt 取新）。job.nodeId 是绑定单一真相。
  const jobs = run.jobs.filter((job) => job.nodeId === nodeId)
  if (jobs.length === 0) return undefined
  return jobs.reduce((latest, job) => (Date.parse(job.createdAt) >= Date.parse(latest.createdAt) ? job : latest))
}

function shotIdForNode(run: ProductionRun, nodeId: string): string | undefined {
  const shot = (run.generationPlan?.shots ?? []).find((candidate) => candidate.nodeId === nodeId)
  return shot?.shotId
}

/**
 * 派生一个占位节点（by nodeId）当前的三态。找不到对应镜/job 时给「排队中」兜底（未派发＝还没轮到，
 * 不是假「生成中」）。node 已有 result 时上层不该再问它（占位退场），这里也返回 done 兜底。
 */
export function deriveShotPlaceholderState(run: ProductionRun | null, nodeId: string): ShotPlaceholderState | null {
  if (!run || !nodeId) return null
  const shotId = shotIdForNode(run, nodeId)
  const isAnchorNode = shotId ? (run.generationPlan?.shots ?? []).find((shot) => shot.shotId === shotId)?.role === 'anchor' : false
  const job = jobForNode(run, nodeId)

  if (job && DONE_STATUSES.has(job.status)) return { phase: 'done' }
  if (job && FAILED_STATUSES.has(job.status)) {
    // 区分「已停」vs「失败」：预算/急停错因（HALT_ERROR_CODES）或批被停/取消到达这镜 = 已停（可续拍，warning）；
    // provider 拒（有真错因）= 失败（danger）。run 整体已停 + 无真错因也算已停。
    const haltedByCode = job.errorCode !== undefined && HALT_ERROR_CODES.has(job.errorCode)
    const batchStopped = job.status === 'cancelled_remote' || job.status === 'too_late'
    if (haltedByCode || batchStopped || (job.status === 'needs_attention' && !job.errorCode && runIsStopped(run.status))) {
      return { phase: 'stopped', stoppedReason: haltedByCode && job.errorCode !== 'batch_stopped' ? 'budget' : run.status === 'needs_attention' ? 'budget' : 'stopped' }
    }
    return { phase: 'failed', ...(job.errorMessage ? { failureMessage: job.errorMessage } : {}) }
  }
  if (job && GENERATING_STATUSES.has(job.status)) return { phase: 'generating' }

  // 无 job 或 job 还在 queued 态：run 已停 → 显「已停」；否则「排队中（第 n/N）」。
  if (runIsStopped(run.status)) {
    return { phase: 'stopped', stoppedReason: run.status === 'needs_attention' ? 'budget' : 'stopped' }
  }
  // 排队位次：anchor 不进视频序列（它先于镜跑），显纯「排队中」；镜按 included 视频序列算 n/N。
  if (isAnchorNode || !shotId) return { phase: 'queued' }
  const videoShots = includedVideoShots(run)
  const total = videoShots.length
  const idx = videoShots.findIndex((shot) => shot.shotId === shotId)
  return { phase: 'queued', ...(idx >= 0 && total > 0 ? { queueIndex: idx + 1, queueTotal: total } : {}) }
}

/** 批次整体进度（已完成/总）——进度通知「已完成 3/7」用（稳定 id 原位更新，不堆 toast）。 */
export function deriveBatchProgress(run: ProductionRun | null): { completed: number; total: number } | null {
  if (!run || !run.generationPlan?.shots || run.generationPlan.shots.length === 0) return null
  const videoShots = includedVideoShots(run)
  const total = videoShots.length
  if (total === 0) return null
  let completed = 0
  for (const shot of videoShots) {
    const job = run.jobs.find((candidate) => typeof candidate.metadata?.shotId === 'string' && candidate.metadata.shotId === shot.shotId && DONE_STATUSES.has(candidate.status))
    if (job) completed += 1
  }
  return { completed, total }
}
