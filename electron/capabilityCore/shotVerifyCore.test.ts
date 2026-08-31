import { describe, expect, it } from 'vitest'
import { SHOT_VERIFY_NOT_ASSESSABLE, assessableAverage } from './shotVerifyCore'

// 判分纯核的行为大部分由 src 侧 shotVerify.test.ts + 两侧的 equivalence 测试守着；
// 这里只钉 electron 侧独有的聚合口径（渲染层不算均分，故它不在镜像范围内）。

// ── 判据⑦口径：均分只统计判分器判得了的镜头（2026-08-20 L3-W2 实测后校准）────────────────
describe('assessableAverage（0 = 无法判定，出分母但单列）', () => {
  it('实测那一幕：中景 5 分 + 眼部微距「看不到」→ 均分 5.00 而不是 3.00', () => {
    // 原始事故：眼部微距被打 1 分（画面里根本没有可比对的脸），把 identity 均分从 5 拽到 3，
    // 判据⑦误判为红。W2c 后判分器给 0，这里让它出分母。
    expect(assessableAverage([5, SHOT_VERIFY_NOT_ASSESSABLE])).toEqual({
      average: 5, assessed: 1, notAssessable: 1,
    })
  })

  it('未验镜头数必须被数出来（报告要单列，不许静默丢）', () => {
    expect(assessableAverage([0, 0, 4]).notAssessable).toBe(2)
  })

  it('一镜都判不了 → average 为 null，不是 0（0 会被读成「很差」= 编造结论）', () => {
    expect(assessableAverage([0, 0])).toEqual({ average: null, assessed: 0, notAssessable: 2 })
  })

  it('★这条只许更严不许更松：真低分照样进分母，不许借「无法判定」洗出去', () => {
    // 负数被夹回 1（clampScore），不会变成 0 溜出分母。
    expect(assessableAverage([5, -3])).toEqual({ average: 3, assessed: 2, notAssessable: 0 })
    // 对照「把无法判定按满分计入」这个更松的替代口径：本口径分母小，同一个 1 分拖得更狠。
    const ours = assessableAverage([5, 1, 0, 0]).average // 分母 2 → 3.00
    const inflated = assessableAverage([5, 1, 5, 5]).average // 若把 0 当 5 → 4.00
    expect(ours).toBeLessThan(inflated as number)
  })

  it('★判分器漏字段/给 null 不许溜出分母（Number(null)===0，差点被当成「无法判定」）', () => {
    // 这条是本轮写测试时真抓出来的洞：哨兵只认判分器**明确写的数字 0**，
    // null/undefined/空串/false 一律落最保守的 1，照常进分母、照常算偏差。
    expect(assessableAverage(['x', null, undefined, '', false])).toEqual({
      average: 1, assessed: 5, notAssessable: 0,
    })
    expect(assessableAverage([0, '0']).notAssessable).toBe(2) // 明确的 0（含数字字符串）才是哨兵
  })

  it('空输入 → null，不假装有结论', () => {
    expect(assessableAverage([])).toEqual({ average: null, assessed: 0, notAssessable: 0 })
  })
})
