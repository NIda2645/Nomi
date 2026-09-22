// 反问卡内容判据的**阳性对照**（R17：加规则必须先验它会红）。
//
// 夹具不是编的：`USER_SAW` 就是 2026-09-21 用户在真机上看到并点名不满意的那一张卡，
// 逐字照抄。一条判据如果对这张卡还说「没问题」，它就是一把坏尺子——
// 而坏尺子和「模型写得很好」长得一模一样。
import { describe, expect, it } from 'vitest'

import { asksPermissionForReversible, judgeAskOptions, judgeProseQuestion } from './askback-option-judges.mjs'

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

  it('假选项认的是句式，不是一张闭合名单（2026-09-21 真实模型漏网的那一条）', () => {
    // 第一版判据写成 `^(其它|其他|…)$` 精确匹配。真实模型在 A12 那轮写出来的是
    // 「你说一个具体场景我来建」——语义上一模一样的假选项，判据一个字都没报。
    // 闭合名单对「模型自己写文案」这件事天然是瞎的。
    expect(judgeAskOptions({
      question: '要生成一个什么样的赛博朋克场景？',
      options: [
        { label: '霓虹街道雨夜行人' }, { label: '夜市小摊与未来天际线' },
        { label: '你说一个具体场景我来建' },
      ],
    }).fakeOptions).toEqual(['你说一个具体场景我来建'])
    // 阳性对照的反面：正常的候选不许被这条误伤。
    expect(judgeAskOptions({
      question: '要删哪一个？', options: [{ label: '镜 2 · 推门' }, { label: '镜 3 · 走廊' }],
    }).fakeOptions).toEqual([])
  })

  it('复读题目：label 里原样搬题目里的片段会被抓住', () => {
    expect(judgeAskOptions({
      question: '这一镜要多长？',
      options: [{ label: '这一镜 5 秒' }, { label: '10 秒' }],
    }).questionEchoes).toEqual(['这一镜 5 秒'])
  })
})

// ── 「它其实问了，只是没用那个工具」这把尺子的阳性对照（2026-09-22）────────────────────
//
// 夹具不是编的：两段都是 run4 / run5 的真实收尾正文，从
// `tests/ux/shots/askback-real-model/ask-run{4,5}/evidence/agent-sessions/**/trace.md`
// 的 `### Response` 段逐字抄来（证据已随各自 README 存进 docs/evidence/…/responses/）。
describe('正文里的提问', () => {
  /** run4 · A9「把开头改一下」：`read_script` 一次然后停，四个编号方向写在正文里。 */
  const RUN4_A9 = [
    '我看了一下开头。',
    '',
    '你想要：\n1. 修改开头的描述方式？\n2. 添加更多细节？\n3. 改变开头的节奏？\n4. 还是其他什么？请告诉我你想怎么改开头',
  ].join('\n')

  /** run4 · A2「把这个改好看点」：改完就收尾，一句问句都没有——这是真·取默认不问。 */
  const RUN4_A2 = [
    '我已经把这段改写好了。',
    '',
    '保留了原文深夜小摊的氛围，把四处口语重复收掉、把两个长句拆开。你可以随时撤销。',
  ].join('\n')

  it('阳性：带编号选项的正文，算它问了——哪怕最后一句是「请告诉我」而不是问号', () => {
    // 这正是第一版尺子漏掉的形状：按自然段切，编号选项在上一段，收尾段是「请告诉我你想怎么改」。
    const judged = judgeProseQuestion(RUN4_A9)
    expect(judged.askedInProse).toBe(true)
    expect(judged.numberedOptions).toBe(true)
    expect(judged.endsWithQuestion).toBe(false)
  })

  it('数组入参取最后一条消息：工具之间那几段旁白不算收尾', () => {
    expect(judgeProseQuestion(['让我先读一下文稿。', RUN4_A9]).askedInProse).toBe(true)
    expect(judgeProseQuestion([RUN4_A9, RUN4_A2]).askedInProse).toBe(false)
  })

  it('阴性：陈述句收尾的正文不算问——不然这把尺子永远说 true', () => {
    const judged = judgeProseQuestion(RUN4_A2)
    expect(judged.askedInProse).toBe(false)
    expect(judged.numberedOptions).toBe(false)
    expect(judged.endsWithQuestion).toBe(false)
  })

  it('阳性：只以问号收尾也算（没有编号选项的那种）', () => {
    expect(judgeProseQuestion('我可以先建一个视觉锚。\n\n你想让这条片子是给谁看的？').askedInProse).toBe(true)
  })

  it('只看收尾段：工具之间那些带问号的自言自语不算在问用户', () => {
    const chatter = ['让我看看画布上还有什么，以及有哪些视频模型可用？', '', '我用 Seedance 2.0 的全能参考模式做了两个镜头。'].join('\n')
    expect(judgeProseQuestion(chatter).askedInProse).toBe(false)
  })

  it('空正文不算问（回合根本没写话）', () => {
    expect(judgeProseQuestion('').askedInProse).toBe(false)
    expect(judgeProseQuestion(undefined).askedInProse).toBe(false)
  })
})
