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

  // ── 第二档：以问代做 vs 答完顺口一问（2026-09-22 run7 之后加） ──────────────
  //
  // 第一档把这两件事算成同一件，于是 run7 的「正文误问 4/7」里有 3 次是假阳性：
  // 用户要的东西**已经给了**，末尾那句只是提议下一步。H1 要压的是前者，
  // 验收口径如果连后者一起数，改动有没有效就永远说不清（run7 README 发现 ④）。
  //
  // 两段夹具都是 run7 的真实收尾正文，逐字抄自
  // `docs/evidence/2026-09-22-askback-real-model-run7/responses/{N3,A10}.md`。
  describe('第二档：以问代做 vs 答完顺口一问', () => {
    /**
     * run7 · N3「画布上现在有几个节点？」——**答完顺口一问**。
     * 用户问的是一个数，模型第一句就把数给了；末尾那句是提议下一步，不是在等人。
     * 这一轮只调了 `look_at_canvas`（只读），所以必须靠「正文本身就是答案」这一条认出来。
     */
    const RUN7_N3 = [
      '画布上目前有**1个节点**。',
      '',
      '这个节点是一个参考图资产，标题是 `reference-4k.png`，显示为已生成状态。没有引用边连接其他节点。',
      '',
      '你需要对这个参考图做什么处理吗？比如用它作为视觉锚来生成其他镜头，或者需要添加更多节点？',
    ].join('\n')

    /**
     * run7 · A10「帮我导出」——**以问代做**。
     * 用户要的是「导出」，模型一次 `read_timeline`（只读）之后没有导出任何东西，
     * 而是摆了一组待选让人挑。回合就停在这儿。
     */
    const RUN7_A10 = [
      '我看到时间线是空的，没有剪辑。这意味着你还没有将任何内容添加到时间线上。',
      '',
      '要导出视频，你需要：\n1. 先生成一些镜头内容\n2. 将这些镜头添加到时间线上\n3. 然后才能导出',
      '',
      '你希望先做什么？\n- 生成一些视频内容\n- 还是你已经有一些内容在画布上，只是没有放到时间线上？',
    ].join('\n')

    it('N3：答案已给 + 问下一步 → 答完顺口一问，不记进以问代做', () => {
      const judged = judgeProseQuestion(RUN7_N3, { toolCalls: ['look_at_canvas'] })
      expect(judged.askedInProse).toBe(true)
      expect(judged.wroteSomething).toBe(false)
      // 只读工具救不了它，靠的是「问句前还剩一整段陈述」。
      expect(judged.deliveredInProse).toBe(true)
      expect(judged.askedAfterDelivering).toBe(true)
      expect(judged.askedInsteadOfActing).toBe(false)
    })

    it('A10：该做的没做、摆了一组待选 → 以问代做，H1 要数的就是这一格', () => {
      const judged = judgeProseQuestion(RUN7_A10, { toolCalls: ['read_timeline'] })
      expect(judged.askedInProse).toBe(true)
      expect(judged.wroteSomething).toBe(false)
      // 待选摆在问句**之后** = 在让人挑，这是以问代做的签名。
      expect(judged.menuAfterQuestion).toBe(true)
      expect(judged.deliveredInProse).toBe(false)
      expect(judged.askedInsteadOfActing).toBe(true)
      expect(judged.askedAfterDelivering).toBe(false)
    })

    it('调过写类工具就算交付了：草稿已建好、末尾问「需要生成吗？」是顺口一问', () => {
      // run7 · A12：四次 `draft_shots` 之后「草稿已建好…需要生成吗？」。
      const judged = judgeProseQuestion('草稿已建好。现在为你添加风格锚和三个镜头。\n\n需要生成吗？',
        { toolCalls: ['look_at_canvas', 'draft_shots', 'draft_shots'] })
      expect(judged.wroteSomething).toBe(true)
      expect(judged.askedAfterDelivering).toBe(true)
      expect(judged.askedInsteadOfActing).toBe(false)
    })

    it('一句过渡就停住 → 以问代做（问句前没剩下什么）', () => {
      const judged = judgeProseQuestion('我需要先确认一下。你想要什么比例？', { toolCalls: ['list_models'] })
      expect(judged.askedInProse).toBe(true)
      expect(judged.deliveredInProse).toBe(false)
      expect(judged.askedInsteadOfActing).toBe(true)
    })

    it('没传工具调用时只按正文判：默认不把「没传」当成「写过」', () => {
      expect(judgeProseQuestion('你想要什么比例？').wroteSomething).toBe(false)
      expect(judgeProseQuestion('你想要什么比例？').askedInsteadOfActing).toBe(true)
    })
  })
})
