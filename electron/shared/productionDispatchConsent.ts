// 「这一镜现在派出去，还算不算用户同意过」的唯一判据（2026-10-01 付费卡① 第 13 条）。
//
// ── 它在解决哪个真实摩擦 ──
//
// 付费批次的开拍确认以前 10 分钟就过期，派发时还要核它。于是凡是「批准之后过一会儿才派」的路——放行形象检查点、
// 暂停后点「继续剩余」、第二天重开项目——只要晚于 10 分钟就永远派不出去，镜头一直挂着「排队中」。
// 而用户那时**明明刚点过一下**（放行形象 / 继续）：那一下就是同意，却没有任何东西记下它。
//
// ── 现在怎么判 ──
//
// 一份付费授权（住在它自己那道门上，信封与收据都不动）被用户点头的最近一刻 = 批准它的那一下（`gate.decidedAt`），
// 或者之后为它续过的那一下（`gate.consentRenewedAt`：放行形象、继续）。派发时离这一刻不超过同意窗口就算数；
// 超过了，没有人替用户续——派发拒绝（`DispatchConsentLapsedError`），批次如实停下（停下原因 `consent_expired`），
// 画布上写「需要你再确认一次」并给一个「继续」：那一下点击就是续。
//
// 只有两处读它：派发闸（`productionGenerationSubmission.prepareAuthorizedSubmission`）与续的写口挑「续哪几道门」。
// 以前还有第二道核对（出站箱按批准记录上的 `expiresAt` 再判一次），随这次删掉。
import type { ProductionGate, ProductionRun } from "../productionRun/productionRunTypes";
import { isUnsubmittedJobStatus } from "./productionShotJobs";

/** 同意窗口：用户点头之后多久内派出去还算数。 */
export const DISPATCH_CONSENT_WINDOW_MS = 10 * 60 * 1000;

/** 续的是哪一种点击（只记录，判据不分）：放行形象检查点 / 停下之后点「继续」。 */
export type DispatchConsentRenewal = "anchor_release" | "resume";

/** 这道付费门最近一次被用户点头的时刻：批准它的那一下，或之后续过的那一下。都没有（还没批）= undefined。 */
export function latestDispatchConsentAt(gate: Pick<ProductionGate, "status" | "decidedAt" | "consentRenewedAt">): string | undefined {
  if (gate.status !== "approved") return undefined;
  const decided = gate.decidedAt ? Date.parse(gate.decidedAt) : Number.NaN;
  const renewed = gate.consentRenewedAt ? Date.parse(gate.consentRenewedAt) : Number.NaN;
  if (Number.isFinite(renewed) && (!Number.isFinite(decided) || renewed > decided)) return gate.consentRenewedAt;
  return Number.isFinite(decided) ? gate.decidedAt : undefined;
}

/** 这道门批的镜现在还能不能派：离用户最近一次点头不超过同意窗口。 */
export function dispatchConsentOpen(gate: Pick<ProductionGate, "status" | "decidedAt" | "consentRenewedAt">, now: string): boolean {
  const at = latestDispatchConsentAt(gate);
  const nowMs = Date.parse(now);
  if (!at || !Number.isFinite(nowMs)) return false;
  return nowMs - Date.parse(at) < DISPATCH_CONSENT_WINDOW_MS;
}

/**
 * 用户这一下点击（放行形象 / 继续）续的是哪几道门：批过的付费门里，还有没发出去的作业的那几道。
 * 已经发出去的不需要续；没批过的不是「续」能批的（那要它自己那一下）。
 */
export function dispatchConsentRenewalGateIds(run: Pick<ProductionRun, "gates" | "jobs">): string[] {
  const pending = new Set(run.jobs.filter((job) => isUnsubmittedJobStatus(job.status) && job.authorizationDigest).map((job) => job.authorizationDigest!));
  return run.gates
    .filter((gate) => gate.scope === "budget_envelope" && gate.status === "approved" && gate.authorizationDigest && pending.has(gate.authorizationDigest))
    .map((gate) => gate.gateId);
}

/** 派发时同意已经过了窗口：这一镜不派，批次如实停下等用户再点一次（不是失败、也不是没发出去的报错）。 */
export class DispatchConsentLapsedError extends Error {
  readonly code = "dispatch_consent_lapsed" as const;

  constructor(readonly gateId: string, readonly jobId: string) {
    super(`dispatch_consent_lapsed: the user's consent for ${jobId} (gate ${gateId}) is older than the dispatch window; it needs another click`);
    this.name = "DispatchConsentLapsedError";
  }
}
