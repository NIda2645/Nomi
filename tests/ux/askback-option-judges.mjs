// 反问卡**内容质量**的判据（2026-09-21 用户看了第一张真卡之后点名的五条）。
//
// ── 为什么它是一个单独的模块 ──
//
// 判据必须能在**不起 App、不花额度**的情况下被喂夹具。焊在走查脚本里的判据只测得到
// 「今天这一轮真模型恰好写了什么」，测不到「这条判据本身判不判得出来」——而那正是
// R17 要的阳性对照（`askback-option-judges.test.mjs` 拿用户实际看到的那张卡当夹具）。
//
// ── 用户看到的那张卡（五条判据各对着它的一处） ──
//
//   题目：你要删除选中的「镜1: 深夜招牌」这个节点吗？
//   选项：是的，删除这个选中的节点 / shot_table 类型的镜头表节点
//         不，删除另一个节点 / 已有结果的 reference-4k.png 资产节点
//         都不删，取消操作
//
// 四处全错：为一个**可撤销**的删除问了「要不要」（09-08 拍板的审批默认档是「只问花钱/撤不回」）、
// 把一道选择题写成**是非题套娃**、多列了一个**取消**（跳过本来就是卡自带的）、
// description 里露出 `shot_table` 这种**内部类型名**。

/** ② 是非题套娃：一道选择题被写成「是的…/ 不，另一个…」。 */
export const YES_NO_NESTING = /^(是的?|对|不是?|否|不，|不要|yes\b|no\b|nope\b)/i
/** ③ 取消 / 都不要：跳过是卡自带的能力（关掉它、或者直接说别的），不占选项位。 */
export const CANCEL_OPTION = /取消|都不|都别|不用了|算了|放弃|cancel|never ?mind|none of (these|them)|skip/i
/** ④ 内部标识符：类型名、字段名、id、工具名——带下划线的，以及我们自己那几个词。 */
export const INTERNAL_IDENTIFIER = /[a-z]+_[a-z_]+|\bnodeId\b|\boperationId\b|\bshotId\b|\bcandidateId\b|\basset node\b|节点 ?id/i
/**
 * 假选项：卡内本来就永远能自己打字，再列一个「其它」就是在教用户多点一下。
 *
 * **不是一张闭合名单**（2026-09-21 实测教训）：第一版写成 `^(其它|其他|…)$` 精确匹配，
 * 真实模型写出来的是「**你说一个具体场景我来建**」——语义上一模一样的假选项，
 * 而判据一个字都没报。闭合名单对「模型自己写文案」这件事天然是瞎的。
 * 所以改成认**句式**：把球踢回给用户的那种说法。
 */
export const FAKE_OPTION = /^(其它|其他|别的|以上都不|都不是|other|something else|let me explain)$/i
  // 「你说…我来…」「我自己说」「让我来说」「由我指定」一族：它说的是「你打字吧」，
  // 而那件事卡自己一直在做。
export const FAKE_OPTION_PHRASE = /你(来)?说|我(自己|来)(说|讲|定|指定)|让我(说|来)|自己(填|写|说)|I'?ll (tell|describe|say)|you tell me/i
/** ⑤ label 长度上限（约 12 个汉字；纯英文按字符数放宽到 24）。 */
export const LABEL_MAX_CJK = 12
export const LABEL_MAX_LATIN = 24

const cjkCount = (text) => (String(text).match(/[一-鿿]/g) ?? []).length

/**
 * 一次提问的选项质量。**只判机器判得了的那几条**——「互斥」的语义判不了，
 * 但「字面重复」「是非题套娃」「取消项」「内部标识符」「太长」「复读题目」判得了，
 * 而那六条正是真实模型最常犯的。
 */
export function judgeAskOptions(args) {
  const options = Array.isArray(args?.options) ? args.options : []
  const labels = options.map((option) => String(option?.label ?? option ?? '').trim()).filter(Boolean)
  const descriptions = options.map((option) => String(option?.description ?? '').trim())
  const question = String(args?.question ?? '').trim()
  const recommended = options.filter((option) => option?.recommended === true).length
  const labelsTooLong = labels.filter((label) => (cjkCount(label) > 0
    ? cjkCount(label) > LABEL_MAX_CJK
    : label.length > LABEL_MAX_LATIN))
  // 「复读题目」：题目里任意 ≥3 字的连续片段原样出现在 label 里（跳过只含标点的片段）。
  const questionEchoes = labels.filter((label) => {
    for (let index = 0; index + 3 <= question.length; index += 1) {
      const fragment = question.slice(index, index + 3)
      if (/[，。？?！!、：:「」"']/.test(fragment)) continue
      if (label.includes(fragment)) return true
    }
    return false
  })
  return {
    count: labels.length,
    inRange: labels.length === 0 || (labels.length >= 2 && labels.length <= 4),
    distinct: new Set(labels).size === labels.length,
    withDescription: descriptions.filter(Boolean).length,
    recommended,
    atMostOneRecommended: recommended <= 1,
    fakeOptions: labels.filter((label) => FAKE_OPTION.test(label) || FAKE_OPTION_PHRASE.test(label)),
    yesNoNesting: labels.filter((label) => YES_NO_NESTING.test(label)),
    cancelOptions: labels.filter((label) => CANCEL_OPTION.test(label)),
    internalIdentifiers: [...labels, ...descriptions].filter((text) => text && INTERNAL_IDENTIFIER.test(text)),
    labelsTooLong,
    questionEchoes,
  }
}

/**
 * ① 为一个**可撤销**的动作问「要不要」。
 *
 * 判据两条同时成立：题目是**征询许可**的句式，而选项里**没有两个真候选**。
 * 后半条是必须的——真的指代不明时选项就是候选本身，题目也不会写成「要不要」。
 * 只判前半条会把一次合理的「这两张你要哪一张？」误报成一次多余的确认。
 */
export function asksPermissionForReversible(args) {
  const question = String(args?.question ?? '')
  const permissionShaped = /要不要|是否|需要我|可以吗|吗？?$|shall I|should I|do you want me to/i.test(question)
  if (!permissionShaped) return false
  const labels = (Array.isArray(args?.options) ? args.options : [])
    .map((option) => String(option?.label ?? option ?? '').trim()).filter(Boolean)
  const realCandidates = labels.filter((label) => !YES_NO_NESTING.test(label) && !CANCEL_OPTION.test(label))
  return realCandidates.length < 2
}

// ── 「它其实问了，只是没用那个工具」──────────────────────────────────────────────────
//
// 2026-09-22 run4/run5 逐句还原发现的那件事：走查的「该问时问了」只数 `ask_user` 调用
// （`row.askedUser = askCalls.length > 0`），而模型多数时候是**在正文里**把问题问出来的——
// 带编号选项、以问号收尾、回合就此结束。run5 那 8 句该问却记成「没问」的用例里有 6 句是这样
// （run4 是 4 句）。两者在产品上完全不是一回事：正文里的问句不会变成卡，用户答不了，回合已经结束。
//
// 所以再加一把尺子，专量**回合的收尾那段话**。它不替代「有没有调工具」那一格，
// 是把「模型自己认为该问」和「问对了地方」拆成两个数——一个数字说不清两件事。

/**
 * 收尾那段话 = 这一轮**最后一条** assistant 文本消息。
 *
 * 给数组就取最后一条非空的；给字符串就整段当收尾。**不是「最后一个自然段」**——
 * 实测 run4/A9 的形状是「问题列在上一段、最后一段是『请告诉我你想怎么改』」，
 * 按自然段切会把编号选项切掉，这把尺子就对它说 false（第一版正是这么写的，当场验出来）。
 */
function closingProse(text) {
  if (Array.isArray(text)) {
    const parts = text.map((part) => String(part ?? '').trim()).filter(Boolean)
    return parts.length ? parts[parts.length - 1] : ''
  }
  return String(text ?? '').trim()
}

/** 编号选项：`1.` `2、` `①` 之类连着出现两个以上。 */
const NUMBERED_ITEM = /(^|\n)\s*(?:[（(]?\d+[.)、）]|[①②③④⑤⑥⑦⑧⑨])\s*\S/g

/**
 * 待选项：比 `NUMBERED_ITEM` 多认**无序列表**（`- ` `· ` `* `）。
 *
 * 只给第二档的「菜单」判据用，**不动 `NUMBERED_ITEM`**：后者是第一档
 * （`askedInProse` / `numberedOptions`）的口径，run1–run7 七轮都按它量过，
 * 顺手放宽会把历史那几格一起改掉，两边就不可比了。
 * 而 run7 的 A10 恰恰是用短横线摆的待选（「你希望先做什么？\n- 生成一些视频内容\n- 还是…」），
 * 光认数字就漏掉了它。
 */
const CHOICE_ITEM = /(^|\n)\s*(?:[-–—*·•]|[（(]?\d+[.)、）]|[①②③④⑤⑥⑦⑧⑨])\s*\S/g

/**
 * 这一轮的正文算不算「它问了」。
 *
 * 判据只认两种**回合真的停在问题上**的形状：
 *   · 收尾那条消息以问号结束；
 *   · 收尾那条消息列了两个以上编号选项，且里面有问号（光有编号可能只是「我做了这几件事」）。
 *
 * 只看收尾那条消息，不看整轮全文：模型在工具之间写的「让我看看画布上还有什么」这类旁白里
 * 也带问号，那不是在问用户，是在自言自语——把它算进去这把尺子就永远说 true。
 */
/**
 * 只读动词。镜的是 `electron/shared/agentCapabilities/verbDeclarations.ts` 里
 * `effect: 'read'` 的那一档（2026-09-22 核对）。**不在这张表上的一律按写类算**——
 * 这个方向是刻意的：判错成「写了」只会把一轮从「以问代做」挪进「答完顺口一问」，
 * 而 H1 的验收只看前者，宁可少算也不能虚报。
 */
const READ_ONLY_TOOLS = new Set([
  'look_at_canvas', 'read_script', 'read_timeline', 'look_at_media',
  'list_models', 'check_job', 'read_skill', 'ask_user',
])

/**
 * 收尾那句问话**之前**还剩多少正文。低于这个字数就认为模型没交付什么，
 * 那句问话才是这条消息的全部目的。
 *
 * 40 是照真夹具定的，不是拍的：run7 里 N3 那条「答完顺口一问」问句前有 ~60 字
 * （「画布上目前有 1 个节点。这个节点是一个参考图资产…」），
 * 而典型的「以问代做」问句前只有一句过渡（「我需要先确认一下。」≈ 9 字）。
 * 它是一个**可调的钝器**，不是精确判据——两边差着一个量级才敢这么切。
 */
const DELIVERED_BODY_MIN = 40

/** 收尾消息里**第一处**问号的位置（没有就是 -1）。 */
function firstQuestionMark(closing) {
  const marks = [closing.indexOf('？'), closing.indexOf('?')].filter((index) => index >= 0)
  return marks.length ? Math.min(...marks) : -1
}

/**
 * 收尾消息里第一句问话**之前**的正文（按句末标点/换行切回去）。
 *
 * 取**第一处**问号而不是最后一处：交付在前、问话在后是「答完顺口一问」的固定形状
 * （N3：先给出「1 个节点」，再问「你需要对它做什么处理吗？比如…，或者…？」——
 * 后面那半句还带一个问号，按最后一处切就把答案一起切没了）。
 */
function bodyBeforeFirstQuestion(closing) {
  const mark = firstQuestionMark(closing)
  if (mark < 0) return closing
  const head = closing.slice(0, mark)
  const sentenceStart = Math.max(
    head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('!'),
    head.lastIndexOf('\n'), head.lastIndexOf('：'), head.lastIndexOf(':'),
  )
  return (sentenceStart < 0 ? '' : head.slice(0, sentenceStart + 1)).trim()
}

/**
 * 这一轮的正文算不算「它问了」，以及**问的是哪一种**。
 *
 * 第一档（`askedInProse`，口径不变）只认两种**回合停在问题上**的形状：
 *   · 收尾那条消息以问号结束；
 *   · 收尾那条消息列了两个以上编号选项，且里面有问号（光有编号可能只是「我做了这几件事」）。
 *
 * 只看收尾那条消息，不看整轮全文：模型在工具之间写的「让我看看画布上还有什么」这类旁白里
 * 也带问号，那不是在问用户，是在自言自语——把它算进去这把尺子就永远说 true。
 *
 * **第二档（2026-09-22 run7 之后加）**：第一档分不开两件完全不同的事——
 *   · **以问代做**（`askedInsteadOfActing`）：该做的没做，回合停在问题上等人。**H1 要压的就是它。**
 *   · **答完顺口一问**（`askedAfterDelivering`）：用户要的东西**已经给了**，末尾提议下一步。
 *
 * run7 的 4 次「正文误问」里有 3 次（N3 / N4 / N5）是后者：
 * 「画布上现在有几个节点？」已经答了「1 个」，末尾才加一句「你需要对它做什么处理吗？」。
 * 把这种也算成误问，H1 的验收口径就不成立了（run7 README 发现 ④）。
 *
 * 「交付了」= 这一轮调过**写类工具**（`context.toolCalls` 里有非只读动词），
 * **或者**收尾正文本身就是答案（只有一处问号、且问句前还剩 ≥40 字的陈述）。
 * 两条是**或**的关系：N3 那种只调了 `look_at_canvas`（只读）却在正文里把答案给全了，
 * 靠第二条才认得出来。
 *
 * @param {string|readonly string[]} text 这一轮的 assistant 文本段
 * @param {{ toolCalls?: readonly string[] }} [context] 这一轮的工具调用名（判「写没写」用）
 */
export function judgeProseQuestion(text, context = {}) {
  const closing = closingProse(text)
  const endsWithQuestion = /[？?]\s*$/.test(closing)
  const numberedOptions = (closing.match(NUMBERED_ITEM) ?? []).length >= 2
  const hasQuestionMark = /[？?]/.test(closing)
  const askedInProse = endsWithQuestion || (numberedOptions && hasQuestionMark)

  const toolCalls = context.toolCalls ?? []
  const wroteSomething = toolCalls.some((name) => !READ_ONLY_TOOLS.has(name))
  const questionMarks = (closing.match(/[？?]/g) ?? []).length

  // **选项摆在问句之后 = 在让人挑**（run7 A10：「你希望先做什么？」下面跟着两条待选；
  // run4 A9：「你想要：1. 改描述？2. 加细节？…」），这是「以问代做」的签名——
  // 回合把一个决定推回给了用户。问句**之前**的编号是答案内容，不是菜单
  // （run7 N4 先逐条列出四个镜头**回答**「镜头 2 是什么」，末尾才问一句要不要建草稿；
  // A12 先列好建完的三个镜头，再问「需要生成吗？」）。位置就是这两者的分界。
  const mark = firstQuestionMark(closing)
  const menuAfterQuestion = mark >= 0
    && (closing.slice(mark).match(CHOICE_ITEM) ?? []).length >= 2

  // 「正文本身就是答案」：没在摆菜单，而且问句之前还剩一整段陈述。
  // N3 那种只调了 `look_at_canvas`（只读）却把答案给全了的轮次，靠的就是这一条。
  const deliveredInProse = !menuAfterQuestion
    && bodyBeforeFirstQuestion(closing).replace(/\s/g, '').length >= DELIVERED_BODY_MIN
  const delivered = wroteSomething || deliveredInProse

  return {
    closing,
    endsWithQuestion,
    numberedOptions,
    questionMarks,
    askedInProse,
    wroteSomething,
    menuAfterQuestion,
    deliveredInProse,
    /** 以问代做：该做的没做，回合停在问题上。**H1 的验收只看这一格。** */
    askedInsteadOfActing: askedInProse && !delivered,
    /** 答完顺口一问：东西已经给了，末尾提议下一步。不该记进误问。 */
    askedAfterDelivering: askedInProse && delivered,
  }
}
