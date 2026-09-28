// 「这次调用跑没跑」这条判据的**穷举**测试。
//
// 它守的不是某一个值，而是一件事：**往 `LANE_APPROVAL_DECISIONS` 里加一个成员之后，
// 必须有人裁决它落在哪一边**。2026-09-21 真机抓到的那次就是没人裁决：
// 加了第七个结局 `answered`，而 `laneApprovalWasRefused` 是一张手列的三值名单，
// 没跟上 —— 面板因此拿不到那条记录，一次成功的回答在用户眼里变成了「⚠ 失败」。
// typecheck 绿、单测绿、门岗绿。
import { describe, expect, it } from 'vitest'

import {
  LANE_APPROVAL_DECISIONS, laneApprovalWasGranted, laneApprovalWasRefused,
  type LaneApprovalDecision,
} from './laneContracts'

const note = (decision: LaneApprovalDecision) => ({ toolCallId: 'c1', toolName: 'ask_user', decision })

/** 跑起来了的那三个。加第四个「批准」语义时改这里，改完下面两条自然跟上。 */
const GRANTED: readonly LaneApprovalDecision[] = ['auto-granted', 'granted-once', 'granted-session']

describe('审批结局：跑了 / 没跑', () => {
  it('每一个结局都被裁决过，没有一个落在两边之外', () => {
    for (const decision of LANE_APPROVAL_DECISIONS) {
      const entry = note(decision)
      expect(laneApprovalWasGranted(entry) !== laneApprovalWasRefused(entry),
        `结局「${decision}」既不算跑了也不算没跑——它会在面板上被静默忽略`).toBe(true)
    }
  })

  it('三个 grant 算跑了，其余全部算没跑（含 answered）', () => {
    for (const decision of LANE_APPROVAL_DECISIONS) {
      expect(laneApprovalWasGranted(note(decision)), `「${decision}」归类错了`)
        .toBe(GRANTED.includes(decision))
    }
    // 这一条是那次 bug 的钉子：用户回答了提问卡 = 工具**没有**跑，
    // 面板必须拿得到这条记录才印得出「已回答 · <他的原话>」而不是「失败」。
    expect(laneApprovalWasRefused(note('answered'))).toBe(true)
  })
})
