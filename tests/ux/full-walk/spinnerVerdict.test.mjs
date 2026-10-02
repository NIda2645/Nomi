// F7：「转圈还在」不能拿几秒前的快照去判。既要在原场景（满载、快照过期）不再误报，也要真转圈时照样红。
import { describe, expect, it } from 'vitest'

import { finishedNodeSpinner, snapshotIsStale, STALE_AFTER_MS } from './spinnerVerdict.mjs'

const WINDOW_MS = 5000 // 「已保存」回执登记窗口，同 limits.savedFeedbackWindowMs
const T0 = 1_000_000

/** 修之前监视器的算法（逐字）：读快照的这一刻当它还在转的时刻。 */
function legacyLingering({ spinner, completedAt, now }) {
  return spinner.gone ? null : now - Math.max(spinner.firstSeen, completedAt)
}

describe('finishedNodeSpinner · 原场景（机器满载，快照是几秒前的）不再误报', () => {
  // 转圈 T0 出现、T0+300 最后一次被采到、之后收了（页面定时器被饿住，没来得及标 gone）；监视器 T0+9000 才读。
  const spinner = { firstSeen: T0, lastSeen: T0 + 300, gone: null }
  const scene = { spinner, completedAt: T0 - 500, readAt: T0 + 9000, sampledAt: T0 + 300 }

  it('修之前：读快照的这一刻算 → 9.5s，超过窗口，误报', () => {
    expect(legacyLingering({ spinner, completedAt: scene.completedAt, now: scene.readAt })).toBeGreaterThan(WINDOW_MS)
  })

  it('修之后：快照过期 → 不下结论（既不判红，也不当成没转圈）', () => {
    expect(snapshotIsStale(scene)).toBe(true)
    expect(finishedNodeSpinner(scene)).toEqual({ verdict: 'stale-snapshot' })
  })

  it('过期的边界：刚好 3 拍以内还认，超过一毫秒就不认', () => {
    expect(snapshotIsStale({ readAt: T0 + STALE_AFTER_MS, sampledAt: T0 })).toBe(false)
    expect(snapshotIsStale({ readAt: T0 + STALE_AFTER_MS + 1, sampledAt: T0 })).toBe(true)
  })

  it('读不到采样时刻（老版探针 / 页面刚导航）→ 当作过期，不下结论', () => {
    expect(finishedNodeSpinner({ spinner, completedAt: 0, readAt: T0 + 100, sampledAt: null })).toEqual({ verdict: 'stale-snapshot' })
  })
})

describe('finishedNodeSpinner · 真转圈照样红', () => {
  it('快照新鲜、转圈一直在、拖过窗口 → fresh-present，拖的时间按最后一次看见算', () => {
    const spinner = { firstSeen: T0, lastSeen: T0 + 8000, gone: null }
    const seen = finishedNodeSpinner({ spinner, completedAt: T0 - 200, readAt: T0 + 8100, sampledAt: T0 + 8000 })
    expect(seen.verdict).toBe('fresh-present')
    expect(seen.lingeringMs).toBe(8000)
    expect(seen.lingeringMs).toBeGreaterThan(WINDOW_MS)
  })

  it('快照新鲜、转圈还在，但没拖过窗口 → 不红（回执窗口内的转圈是正常收尾）', () => {
    const spinner = { firstSeen: T0, lastSeen: T0 + 1200, gone: null }
    const seen = finishedNodeSpinner({ spinner, completedAt: T0, readAt: T0 + 1300, sampledAt: T0 + 1200 })
    expect(seen.verdict).toBe('fresh-present')
    expect(seen.lingeringMs).toBeLessThan(WINDOW_MS)
  })

  it('已经 gone → gone，不判', () => {
    expect(finishedNodeSpinner({ spinner: { firstSeen: T0, lastSeen: T0 + 500, gone: T0 + 900 }, completedAt: 0, readAt: T0 + 9000, sampledAt: T0 + 8900 })).toEqual({ verdict: 'gone' })
  })
})
