// 「转圈还在」的判据（监视器铁律 5 用；零依赖，好单测）。
//
// 事故（F7）：页内观察者每 400ms 采一次转圈，监视器在**另一个时刻**去读那份快照，拿「快照里它还没标 gone」
// 当成「此刻它还在转」。机器满载时页面的定时器会被饿住——快照可能是几秒前的，转圈早就收了，
// 而快照里它还是「没 gone」，于是报「节点已是 success，上面的转圈还在（6s）」，违反当场的截图里根本没有转圈。
//
// 规矩：
//   1. 只认「最后一次真的看见它」的时间（lastSeen），不用读快照的这一刻当它还在的时间；
//   2. 快照本身过期（观察者最近一次采样距离读取时刻超过 STALE_AFTER_MS）→ 不下结论，交给下一次检查点，
//      而不是拿一份旧账去判——过期不等于没转圈，也不等于还在转。
//
// 判「真转圈」时不放松：快照新鲜、转圈没 gone，照样按原来的窗口判红。

/** 观察者每 400ms 采一次；连续错过 3 拍以上（1200ms）就当快照不可信。 */
export const SPINNER_SAMPLE_INTERVAL_MS = 400
export const STALE_AFTER_MS = 3 * SPINNER_SAMPLE_INTERVAL_MS

/** 快照读取时，页内观察者最近一次采样有多旧。 */
export function snapshotAgeMs({ readAt, sampledAt }) {
  if (!Number.isFinite(readAt) || !Number.isFinite(sampledAt)) return Infinity
  return Math.max(0, readAt - sampledAt)
}

export function snapshotIsStale({ readAt, sampledAt }) {
  return snapshotAgeMs({ readAt, sampledAt }) > STALE_AFTER_MS
}

/**
 * 终态节点上，这个转圈「拖了多久」。
 * @returns {{ verdict: 'fresh-present', lingeringMs: number } | { verdict: 'gone' | 'stale-snapshot' }}
 *   fresh-present：快照新鲜、最后一次看见它就在采样点上、它没 gone —— 可以拿 lingeringMs 去和窗口比；
 *   gone：已经收了；stale-snapshot：快照过期，不下结论。
 */
export function finishedNodeSpinner({ spinner, completedAt = 0, readAt, sampledAt }) {
  if (spinner.gone) return { verdict: 'gone' }
  if (snapshotIsStale({ readAt, sampledAt })) return { verdict: 'stale-snapshot' }
  const lastSeen = Number.isFinite(spinner.lastSeen) ? spinner.lastSeen : sampledAt
  return { verdict: 'fresh-present', lingeringMs: Math.max(0, lastSeen - Math.max(spinner.firstSeen, completedAt)) }
}
