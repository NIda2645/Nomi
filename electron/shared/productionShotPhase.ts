// 制作（ProductionRun）里「一镜现在处在哪一段」的**唯一判定**（2026-09-25 从渲染层搬到中立层）。
//
// 为什么搬：以前只有渲染层的占位组件读它（`shotPlaceholderState`），主进程一侧看不到；于是「一镜在生成中」
// 在画布上有两个 owner——普通生成写的是节点自己的状态（NodeGeneratingOverlay 画等待动画），
// Agent 付费卡建出的镜头却由渲染层轮询一份 Run 快照、另画一套「整卡模糊 + N 字标」。两份真相各判各的，
// 供应商那边早出片了，节点还在转（用户 2026-09-25 原话：「没有复用逻辑，视频早就生产出来了，
// 他这里一直显示生成中」）。
//
// 现在：主进程的画布落地投影（`multiShotCanvasLanding.buildMaterializeShotsPayload`）用这里判出每一镜的段，
// 把「生成中 / 失败 / 结束」写进节点自己的运行记录——和普通生成同一份状态、同一套画法；
// 渲染层只剩「排队中 / 已停」两块制作专属的小标（它们没有普通生成的对应物），也读这里。
// 同一个输入，两端的判定逐字相同，不会一个说在生成、一个说已停。
//
// 真相源 = Run 的 jobs[] + status（纯派生，无第二份状态）。
import type { ProductionJob, ProductionJobStatus, ProductionRun, ProductionRunStopReason } from "../productionRun/productionRunTypes";
import { runStopReason } from "./productionRunStop";
export { decideShotClaim } from "./decideShotClaim";
import { shotCountsTowardBatch, shotIncluded } from "./productionShotJobs";

export type ProductionShotPhase = "queued" | "generating" | "stopped" | "failed" | "done";

type ProductionShotStateFields = {
  /** 这一镜最新的那次任务（排队中且还没派发时没有）。投影用它的 jobId 当节点运行记录的身份。 */
  job?: ProductionJob;
  /** 排队中：第 n / N（n=本镜在待生成序列里的位次，从 1 起；N=总镜数）。仅 queued 有。 */
  queueIndex?: number;
  queueTotal?: number;
  /** failed 的人话原因。 */
  failureMessage?: string;
};

/**
 * 一镜在画布上的运行状态。`stopped` **一定**带着停下的原因：停的那一刻记下的事实（`runStopReason`，
 * electron/shared/productionRunStop.ts），文案与入口据此选；上一版写下的 Run 没记原因 = `unknown`——绝不猜成预算
 * （以前 needs_attention 一律被说成「预算已用完」）。别的阶段没有这一格，读的人不用再兜底。
 */
export type ProductionShotState =
  | (ProductionShotStateFields & { phase: "stopped"; stoppedReason: ProductionRunStopReason | "unknown" })
  | (ProductionShotStateFields & { phase: Exclude<ProductionShotPhase, "stopped">; stoppedReason?: never });

/**
 * job.status → 这一镜落在哪一段。**穷尽**：ProductionJobStatus 新增一个状态而这里没给出归属，编译就过不去
 * （以前是三份手抄的 Set，新状态会静悄悄落进「排队中」）。
 * null = 这个状态本身说明不了什么（还没派发 / 身份待核），交给 Run 状态判「排队中」还是「已停」；
 * 已脱离（detached）也是 null，但 deriveProductionShotState 会先把它排除——制作不再拥有这一镜。
 * failed 是候选：有预算/急停错因时再细分成 stopped（见下）。
 */
export function productionJobPhase(status: ProductionJobStatus): ProductionShotPhase | null {
  switch (status) {
    case "submitting":
    case "provider_accepted":
    case "polling":
    case "retry_wait":
    case "downloading":
    case "validating_technical":
    case "validating_content":
      return "generating";
    case "ready":
    case "adopted":
      return "done";
    case "needs_attention":
    case "cancelled_remote":
    case "too_late":
      return "failed";
    case "planned":
    case "authorization_required":
    case "authorized":
    case "submit_intent_persisted":
    case "submission_unknown":
    case "reconciling":
    case "cancel_requested":
    case "detached":
      return null;
  }
}

/**
 * 这个 job 是不是还停在人工门前：报价卡 / 逐镜确认在等，供应商那边什么都没发生。
 * 写成 `Record<ProductionJobStatus, boolean>` 让编译器拦：新长一个状态而这里没表态，类型检查当场红——
 * 不会静默落进「排队中」（调度器的「authorization_required is still waiting for a human」也读这一张）。
 */
const AWAITS_HUMAN: Readonly<Record<ProductionJobStatus, boolean>> = {
  planned: true, authorization_required: true,
  authorized: false, submit_intent_persisted: false, submitting: false, provider_accepted: false, polling: false,
  retry_wait: false, downloading: false, validating_technical: false, validating_content: false, ready: false,
  adopted: false, submission_unknown: false, reconciling: false, needs_attention: false, cancel_requested: false,
  cancelled_remote: false, detached: false, too_late: false,
};

export function jobAwaitsHuman(status: ProductionJobStatus): boolean {
  return AWAITS_HUMAN[status];
}

/** 这次任务是不是已经交给供应商、还在等结论（观察者据此判断还要不要再去问）。 */
export function isProductionJobInFlight(job: Pick<ProductionJob, "status" | "providerTaskId">): boolean {
  return Boolean(job.providerTaskId) && productionJobPhase(job.status) === "generating";
}

function isSingleShotPlan(run: ProductionRun): boolean {
  return !run.generationPlan?.shots || run.generationPlan.shots.length === 0;
}

/**
 * 排队序列的分母 N 与位次按哪些镜算——**与调度器的 `progressShots` 同规则**
 * （`electron/productionRun/batchScheduleDerivation.ts`：`videoShots.length > 0 ? videoShots : anchors`）。
 * 视频镜按 `shotCountsTowardBatch` 数（被画布拿走的镜不再占一个位次），参考卡按勾没勾进这一批数。
 * 调度器为「只有参考卡」的批次留了那一支；少了它用户会看到一排「排队中 1/0」。
 */
function queueShotsOf(run: ProductionRun): { shotId: string }[] {
  const shots = run.generationPlan?.shots ?? [];
  const videoShots = shots.filter((shot) => shot.role !== "anchor" && shotCountsTowardBatch(run, shot));
  const anchors = shots.filter((shot) => shot.role === "anchor" && shotIncluded(shot));
  return (videoShots.length > 0 ? videoShots : anchors).map((shot) => ({ shotId: shot.shotId }));
}

/**
 * 这一镜的全部任务（含返工 attempt）。多镜按 `job.metadata.shotId` 认；单镜计划没有 shots[]，
 * 它唯一那一镜的身份就是候选 id（与落地投影 `buildMaterializeShotsPayload` 同一个约定），生成段的每个 job 都属于它。
 */
function jobsForShot(run: ProductionRun, shotId: string): ProductionJob[] {
  if (isSingleShotPlan(run)) {
    return shotId === run.generationPlan?.candidate.candidateId ? run.jobs.filter((job) => job.stageId === "generate") : [];
  }
  return run.jobs.filter((job) => typeof job.metadata?.shotId === "string" && job.metadata.shotId === shotId);
}

function latestJob(jobs: readonly ProductionJob[]): ProductionJob | undefined {
  if (jobs.length === 0) return undefined;
  return jobs.reduce((latest, job) => (Date.parse(job.createdAt) >= Date.parse(latest.createdAt) ? job : latest));
}

const PRODUCTION_RUN_RECORD_PREFIX = "production-";

/** 制作投影写进画布节点的那条运行记录的身份：这一镜那次任务（同一任务反复投影幂等，返工 = 新任务 = 新记录）。 */
export function productionRunRecordId(jobId: string): string {
  return `${PRODUCTION_RUN_RECORD_PREFIX}${jobId}`;
}

/**
 * 这条节点运行记录是不是制作投影写的。它**只归制作投影管**（主进程 Run 才知道它在不在跑）：
 * 画布自己的重开收敛（「没任务号的生成中 = 幽灵转圈」）不许碰它——2026-09-26 真付费 T5：重开窗口后
 * 在跑的第 1 镜被收成空闲，看着像没在跑。主进程写 id、渲染层认 id 都经这两个函数，前缀不许各写一份。
 */
export function isProductionRunRecord(record: Readonly<{ id?: unknown }> | null | undefined): boolean {
  return typeof record?.id === "string" && record.id.startsWith(PRODUCTION_RUN_RECORD_PREFIX);
}

/**
 * 画布节点 ↔ 镜的对应：单镜计划看 `generationPlan.nodeId`，多镜看 `shots[].nodeId`（「shot ↔ 画布节点」的单一真相）。
 * 返工要拿到 shotId 也走这里。
 */
export function productionShotIdForNode(run: ProductionRun, nodeId: string): string | undefined {
  const plan = run.generationPlan;
  if (!plan || !nodeId) return undefined;
  if (isSingleShotPlan(run)) return plan.nodeId === nodeId ? plan.candidate.candidateId : undefined;
  return plan.shots?.find((shot) => shot.nodeId === nodeId)?.shotId;
}

/**
 * 一镜此刻的段。找不到这一镜 → null。
 *
 * - 没派发、run 也没停：本次付费范围里的镜「排队中（第 n/N）」；**不在本次付费范围里（`included:false`）
 *   又从没派发过的镜不属于任何队列**——返回 null。以前它们也显「排队中」，而这批跑完了它们还在「排队」，
 *   是一句永远不会兑现的话（2026-09-25 走查：只确认了第 1 镜，第 2 镜一直挂着「排队中」）。
 * - 禁「永远等待生成」假进度：没有 job 绝不显「生成中」。
 * - **用户还没点头 = 什么都不说**（2026-09-24）：草稿（`draft_shots` 建的、报价卡还在等）、job 还停在人工门前、
 *   没点头就取消——返回 null。以前这些都落到「排队中」：Agent 按「先别生成」建的草稿挂着「排队中 · 第 1/1」，
 *   读起来像已经在排队花钱（那一刻 0 job、0 请求）。「派出去了没有」只看两件事：`jobAwaitsHuman`（人工门表），与没有 job 时计划是否已提交、这一镜是否勾进了这一批。
 */
export function deriveProductionShotState(run: ProductionRun | null | undefined, shotId: string | undefined): ProductionShotState | null {
  if (!run || !shotId || !run.generationPlan) return null;
  const single = isSingleShotPlan(run);
  const shot = single ? undefined : run.generationPlan.shots?.find((candidate) => candidate.shotId === shotId);
  if (!single && !shot) return null;
  if (single && shotId !== run.generationPlan.candidate.candidateId) return null;
  const job = latestJob(jobsForShot(run, shotId));
  // 最新那次任务还停在人工门前（报价卡 / 返工·续拍待授权）：什么都还没发生。
  if (job && jobAwaitsHuman(job.status)) return null;
  // 最新那次任务已脱离制作（画布认领了这一镜、计划被拒 / 脱离画布）：制作不会再派它，
  // 节点上既不是「排队中」也不是「已停 · 提额续拍」——点那个按钮续的会是别的镜头。
  if (job?.status === "detached") return null;
  const jobPhase = job ? productionJobPhase(job.status) : null;

  if (job && jobPhase === "done") return { phase: "done", job };
  if (job && jobPhase === "failed") {
    // 「已停」vs「失败」：Run 停着，而这一镜是随批被停下的（cancelled_remote / too_late），或 job 没有真错因 = 已停；
    // 供应商拒（有真错因）或 Run 根本没停 = 失败。停下的原因只读 Run 记下的事实，不从错因码或 Run 状态猜（以前这里会猜成「预算」）。
    const stopReason = runStopReason(run);
    const stoppedWithBatch = job.status === "cancelled_remote" || job.status === "too_late" || (job.status === "needs_attention" && !job.errorCode);
    if (stopReason && stoppedWithBatch) return { phase: "stopped", job, stoppedReason: stopReason };
    return { phase: "failed", job, ...(job.errorMessage ? { failureMessage: job.errorMessage } : {}) };
  }
  if (job && jobPhase === "generating") return { phase: "generating", job };

  // 没有 job 时，只有计划已提交、这一镜又勾进了这一批，它才真的在排队（批次会自己轮到它）。
  // 否则是用户还没点头（草稿 / 报价卡在等 / 没点头就取消），或者这镜没被勾进这一批：它不在任何队列里。
  if (!job && (run.generationPlan.state !== "submitted" || shot?.included === false)) return null;
  // 无 job 或 job 还在派发前的档：run 停着 → 显「已停」，原因照 Run 记下的说；否则「排队中（第 n/N）」。
  const stopReason = runStopReason(run);
  if (stopReason) return { phase: "stopped", ...(job ? { job } : {}), stoppedReason: stopReason };
  // 排队位次：anchor 不进视频序列（它先于镜跑），显纯「排队中」；单镜也没有序列可言。
  if (single || shot?.role === "anchor") return { phase: "queued", ...(job ? { job } : {}) };
  const videoShots = queueShotsOf(run);
  const total = videoShots.length;
  const index = videoShots.findIndex((candidate) => candidate.shotId === shotId);
  return { phase: "queued", ...(job ? { job } : {}), ...(index >= 0 && total > 0 ? { queueIndex: index + 1, queueTotal: total } : {}) };
}
