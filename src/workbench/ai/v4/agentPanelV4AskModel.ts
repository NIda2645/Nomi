/**
 * 反问卡的**视图模型**。整件还原 Beautiful UI 的 Approval Card
 * （`https://www.beautifului.dev/#approval-card`，registry `https://beautifului.dev/r/approval-card.json`，
 * 源码落盘在本次任务的 scratchpad）。
 *
 * ## 为什么这个文件存在
 *
 * Approval Card 的形状是**一张卡、若干题、一次一题**：它自己管「现在是第几题」「这一题答了没」
 * 「答完这一题是往下走还是收卡」。这几条判断原来散在组件的 onClick 里，而它们正是这张卡
 * 唯一会出错的地方（点了单选该不该自动前进、最后一题的主按钮该印什么、没答完能不能按）。
 * 写成纯函数是为了能逐条断言——组件那半只负责画。
 *
 * ## 和对外契约的关系（`agentPanelV4Question.ts` 是 owner，这里不新造字段）
 *
 * 契约今天说的是**一题、单选**（`V4QuestionAsk` 只有一个 `question` + 一个 `options`；
 * 主进程那份 `electron/shared/agentCapabilities/askUser.ts` 的 `askUserInputSchema` 同样）。
 * Approval Card 的整件里有「多题一张卡」和「多选」两样，契约暂时喂不出来：
 *
 * · **多题**：`askCardQuestions()` 今天把一次待决摊成**长度为 1** 的数组，页码因此自动不显示
 *   （`shouldShowPager`）。契约哪天长出 `questions[]`，只改这一个函数。
 * · **多选**：`V4AskQuestion.multiple` 今天恒为 `false`（没有生产者写得出 true）。
 *
 * 两样都**不是把结构砍掉**——砍掉就等于把 Approval Card 拆成零件再自拼一遍，那正是上一版
 * 被退回的原因。结构整件留着、由实验室取景，缺的是生产者；字段差异见本次报告。
 */
import type { InterventionData } from './agentPanelV4Types'
import type { V4QuestionOption } from './agentPanelV4Question'

/**
 * 用户答了什么。**形状逐字段照抄对外契约**
 * （`electron/shared/agentCapabilities/askUser.ts` → `agentPanelV4Question.ts` 的
 * `V4QuestionAnswer`，见主进程 lane 报告 §8.4）。
 *
 * 这里为什么暂时自己声明一份：那份契约类型住在 `agentPanelV4Question.ts`，
 * 而那个文件正由主进程 lane 改成从 owner 派生（本分支上还是旧的手写单题版），
 * 任务书要求本分支**只读不改**它。合并时把这个 type 删掉、改成
 * `import type { V4QuestionAnswer } from './agentPanelV4Question'` 即可——
 * 字段名和可选性是对齐的，改动只有一行 import。
 */
export type V4AskAnswer = Readonly<{
  questionIndex: number
  optionIds?: readonly string[]
  text: string
}>

/** 卡上的一题。`multiple` = 这题可以多选（Approval Card 的 `type: "check"`）。 */
export type V4AskQuestion = Readonly<{
  /** 这一题问什么。它就是卡上那行**标题**——Approval Card 没有第二行卡头。 */
  question: string
  options: readonly V4QuestionOption[]
  /** 多选。缺席 = 单选（Approval Card 的 `type: "radio"`）。 */
  multiSelect?: boolean
  /** 问句下面那一句补充（模型写的 `note`，或我们自己的熔断说明）。 */
  note?: string
}>

/** 一题上的作答。`picked` 是选中的下标集合，`custom` 是那一行自己打的字。 */
export type V4AskDraft = Readonly<{ picked: readonly number[]; custom: string }>

export const EMPTY_ASK_DRAFT: V4AskDraft = Object.freeze({ picked: Object.freeze([]) as readonly number[], custom: '' })

/**
 * 「推荐」那一项排第一（我们在 Approval Card 上只加的两样之一）。
 *
 * **稳定排序**：其余项保持模型给的次序。模型写选项的顺序本身有意义（它常常按「从保守到激进」
 * 排），随便打乱等于替它重新表态。推荐项标了不止一个时只提最前面那一个——契约说的是
 * 「at most one」，但它是 `describe` 不是校验，多标一个不该让排序变成随机。
 */
export function orderedAskOptions(options: readonly V4QuestionOption[]): readonly V4QuestionOption[] {
  const first = options.findIndex((option) => option.recommended === true)
  if (first <= 0) return options
  return Object.freeze([options[first]!, ...options.filter((_, index) => index !== first)])
}

/**
 * 一次待决 → 卡上的题目表。
 *
 * 今天恒为一题（契约只有一题）。**返回数组而不是单个对象**是这条链上唯一一处需要说清的
 * 取舍：Approval Card 的题轨、页码、`Continue`/`Send` 的分岔全都长在「第几题 / 共几题」上，
 * 把它写死成一题就等于把那三件一起删掉，下次要多题时只能重拼一张卡。
 */
export function askCardQuestions(data: InterventionData): readonly V4AskQuestion[] {
  if (data.questions?.length) return data.questions
  return Object.freeze([Object.freeze({
    question: data.title,
    options: data.options ?? [],
    ...(data.summary ? { note: data.summary } : {}),
  })])
}

/** 这一题答上了吗（选了任意一项，或者自己打了字）。未作答 ⇒ 主按钮置灰。 */
export function askQuestionAnswered(draft: V4AskDraft): boolean {
  return draft.picked.length > 0 || draft.custom.trim().length > 0
}

/**
 * 点了第 `index` 项之后，这一题的作答变成什么。
 *
 * 单选 = 只留这一项，并且**清掉自己打的字**（Approval Card 的 `toggle()` 就是这么做的：
 * 一个答案不能既是「选了 B」又是「我另有说法」）。多选 = 有则去、无则增。
 */
export function toggleAskOption(draft: V4AskDraft, index: number, multiple: boolean): V4AskDraft {
  if (!multiple) return Object.freeze({ picked: Object.freeze([index]) as readonly number[], custom: '' })
  const picked = draft.picked.includes(index)
    ? draft.picked.filter((item) => item !== index)
    : [...draft.picked, index]
  return Object.freeze({ picked: Object.freeze(picked) as readonly number[], custom: draft.custom })
}

/**
 * 点了一项之后该不该**自己往下走**。
 *
 * Approval Card：单选点了就走（480ms 后），多选等 `Continue`。这条是用户 09-21 拍板的原话
 * 「单选点了就走，多选和自己输入点『继续』」——两边说的是同一件事，所以这里照搬它的判据。
 */
export function shouldAutoAdvance(multiple: boolean): boolean {
  return !multiple
}

/** Approval Card 的自动前进延时（源码 `advanceTimer` = 480ms）。照搬，不自己调。 */
export const ASK_AUTO_ADVANCE_MS = 480

/** 只有一题时不显示页码——「1/1」是一句废话（和 `V4Pager` 对单项的处置同一条规矩）。 */
export function shouldShowPager(total: number): boolean {
  return total > 1
}

/** 这一题是不是最后一题（决定主按钮印「继续」还是「发送」）。 */
export function isLastAskQuestion(index: number, total: number): boolean {
  return index >= total - 1
}

/**
 * 把全部作答收成**回给模型的那一份**（契约 §8.4 的形状）。
 *
 * 一题一条 `{ questionIndex, optionIds?, text }`：
 * · `questionIndex` 让主进程知道这条答的是第几题（多题卡上这是唯一能对上号的东西）；
 * · `optionIds` 是结构化的「他点了哪几颗」，多选时不止一个；
 * · `text` **永远有**——模型只认字，一个光秃秃的 id 对它和没答一样。
 *
 * 没答的题**不出现在数组里**：跳过不是一个答案。
 */export function askCardAnswer(
  questions: readonly V4AskQuestion[],
  drafts: readonly V4AskDraft[],
): readonly V4AskAnswer[] {
  const answers: V4AskAnswer[] = []
  questions.forEach((question, questionIndex) => {
    const draft = drafts[questionIndex] ?? EMPTY_ASK_DRAFT
    const ordered = orderedAskOptions(question.options)
    // 下标按**排过序之后**的位置算：排序在渲染层做、取值在这里做，
    // 两边用不同的数组就会把「他点的 C」记成「A」。
    const picked = draft.picked
      .map((position) => ordered[position])
      .filter((option): option is V4QuestionOption => Boolean(option))
    const custom = draft.custom.trim()
    const parts = [...picked.map((option) => option.label), ...(custom ? [custom] : [])]
    if (!parts.length) return
    answers.push(Object.freeze({
      questionIndex,
      ...(picked.length ? { optionIds: Object.freeze(picked.map((option) => option.id)) as readonly string[] } : {}),
      text: parts.join('、'),
    }))
  })
  return Object.freeze(answers)
}

/**
 * 数字键直选：`1`–`9` → 下标。**越界返回 undefined**，不静默取最后一项。
 * 写成函数是因为「第 9 项以后没有键可按」这件事得有地方被断言。
 */
export function askOptionIndexForKey(key: string, total: number): number | undefined {
  if (key.length !== 1 || key < '1' || key > '9') return undefined
  const index = Number(key) - 1
  return index < total ? index : undefined
}

/** ↑↓ 在选项之间走一格，**环形**（Approval Card 的 GlideMenu 行为）。没有选项时返回 undefined。 */
export function askOptionIndexForArrow(
  current: number | undefined,
  delta: 1 | -1,
  total: number,
): number | undefined {
  if (total <= 0) return undefined
  if (current === undefined) return delta === 1 ? 0 : total - 1
  return (current + delta + total) % total
}
