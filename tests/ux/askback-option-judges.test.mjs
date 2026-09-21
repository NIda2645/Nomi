// 反问卡内容判据的**阳性对照**（R17：加规则必须先验它会红）。
//
// 夹具不是编的：`USER_SAW` 就是 2026-09-21 用户在真机上看到并点名不满意的那一张卡，
// 逐字照抄。一条判据如果对这张卡还说「没问题」，它就是一把坏尺子——
// 而坏尺子和「模型写得很好」长得一模一样。
import { describe, expect, it } from 'vitest'

import { asksPermissionForReversible, judgeAskOptions } from './askback-option-judges.mjs'

/** 用户 2026-09-21 真机看到的那一张（题目 + 三个选项，逐字）。 */
const USER_SAW = {
  question: '你要删除选中的「镜1: 深夜招牌」这个节点吗？',
  options: [
    { label: '是的，删除这个选中的节点', description: 'shot_table 类型的镜头表节点' },
    { label: '不，删除另一个节点', description: '已有结果的 reference-4k.png 资产节点' },
    { label: '都不删，取消操作' },
  ],
}

/** 照 2026-09-21 那五条规矩重写的同一个问题。 */
const REWRITTEN = {
  question: '要删哪一个？',
  options: [
    { label: '镜 1 · 深夜招牌', description: '你现在选中的那张分镜' },
    { label: '参考图', description: '素材库里那张已经出过图的' },
  ],
}

describe('反问卡内容判据 · 阳性对照', () => {
  it('用户看到的那张卡：四条判据各抓到一处', () => {
    const judged = judgeAskOptions(USER_SAW)
    expect(judged.yesNoNesting, '「是的…/不，…」是一道被写成是非题的选择题').toEqual([
      '是的，删除这个选中的节点', '不，删除另一个节点',
    ])
    expect(judged.cancelOptions, '「都不删，取消操作」占掉了一个真答案的位置').toEqual(['都不删，取消操作'])
    expect(judged.internalIdentifiers, 'shot_table 是内部类型名，用户看不懂').toContain('shot_table 类型的镜头表节点')
    expect(judged.questionEchoes, 'label 把题目里的「删除…节点」原样搬了一遍').toEqual([
      '是的，删除这个选中的节点', '不，删除另一个节点',
    ])
    expect(asksPermissionForReversible(USER_SAW), '删节点能 ⌘Z 撤回，不该为它问「要不要」').toBe(true)
    // **长度这一条对这张卡没有报**，如实记：最长那个 label 是 11 个汉字，正好在 12 的线内。
    // 它不是漏网——这张卡的毛病是「把题目复读了一遍」和「是非题套娃」，两条都报到了。
    // 把阈值调到能报它，只会让以后真正合格的 label 被误伤（那是「改预算挤 PR」的另一种长相）。
    expect(judged.labelsTooLong).toEqual([])
  })

  it('长度这一条自己的阳性对照（上面那张卡没触发它，所以单独验一次）', () => {
    expect(judgeAskOptions({ question: '选哪个？', options: [
      { label: '用画布中间那张还没出过图的分镜当参考' }, { label: '短的' },
    ] }).labelsTooLong).toEqual(['用画布中间那张还没出过图的分镜当参考'])
  })

  it('照新规矩重写之后：五条全过', () => {
    const judged = judgeAskOptions(REWRITTEN)
    expect(judged.yesNoNesting).toEqual([])
    expect(judged.cancelOptions).toEqual([])
    expect(judged.internalIdentifiers).toEqual([])
    expect(judged.labelsTooLong).toEqual([])
    expect(judged.questionEchoes, 'label 不该复读题目里的话').toEqual([])
    expect(judged.fakeOptions).toEqual([])
    expect(judged.inRange).toBe(true)
    expect(judged.distinct).toBe(true)
    expect(asksPermissionForReversible(REWRITTEN)).toBe(false)
  })

  it('「要不要」那一条不误伤：真的两个候选摆在那儿时，句式像征询也不算', () => {
    // 这是一道合法的选择题，只是问句恰好带「吗」。选项里有两个真候选 → 不该报。
    expect(asksPermissionForReversible({
      question: '这两张你想留哪一张吗？',
      options: [{ label: '镜 2 · 推门' }, { label: '镜 3 · 走廊' }],
    })).toBe(false)
    // 阳性对照：把其中一个换成「取消」，真候选只剩一个 → 立刻报。
    expect(asksPermissionForReversible({
      question: '这两张你想留哪一张吗？',
      options: [{ label: '镜 2 · 推门' }, { label: '取消' }],
    })).toBe(true)
  })

  it('复读题目：label 里原样搬题目里的片段会被抓住', () => {
    expect(judgeAskOptions({
      question: '这一镜要多长？',
      options: [{ label: '这一镜 5 秒' }, { label: '10 秒' }],
    }).questionEchoes).toEqual(['这一镜 5 秒'])
  })
})
