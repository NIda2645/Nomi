/**
 * 介入槽 · 反问卡的**渲染层那一半**（2026-09-21 拍板：「反问必须是通用能力」）。
 *
 * 用户原话：「这个是模型要自己输入选项吧，通用的吧，别搞错了，只有那一种反问就离谱了」。
 * 所以这里定的不是「画幅怎么问」，而是**任何一次提问**长什么样：模型自己写问题、自己写
 * 2–4 个选项（标签 + 一句说明 + 可标推荐），卡内永远带一行自由输入。任何面（文档 / 画布 /
 * 时间轴）任何话题都能用同一张卡。宿主侧的「缺参数」「同字段 3 次熔断」只是同一张卡的
 * **另外两个生产者**，不是唯一触发——所以这个文件里不许出现任何一个具体题目的字段。
 *
 * ── 形状不在这个文件里 ──
 *
 * `V4QuestionOption` / `V4QuestionAsk` 都是 `electron/shared/agentCapabilities/askUser.ts`
 * 那份 zod schema 的 `z.infer`，**一个字段都不在这里手写**。模型看到的 JSON Schema、
 * 主进程的校验、身份提示词里的例子、熔断构造的参数读的也是那一份。
 * 手写一份平行类型的后果不是编译错误——是它们慢慢长得不一样，而没有任何东西会发现
 * （`docs/lessons/stale-directives-outlive-tool-renames.md`）。
 *
 * 这件事在本分支上**真的发生过一次**：2026-09-21 做反向验红时，一条
 * `git checkout -- <本文件>` 把刚写好的派生整段冲回了手写版，而 typecheck 全绿、
 * `askUserContract.test.ts` 也全绿——因为那一刻两份形状恰好还一样。
 * 所以那份对拍测试现在多一条：**直接读这个文件的源码，断言它 import 了那个 owner**
 * （「还在派生吗」和「今天是否碰巧一致」是两个问题）。
 *
 * ## 这份契约的两端
 *
 * · **吃什么**：`parseQuestionSheet(args)`——一次待决工具调用的 `args`。产出它的动词是
 *   `ask_user`（`electron/shared/agentCapabilities/verbs/askVerbs.ts`）。
 * · **回什么**：`V4QuestionAnswer[]`，一题一条。载体是 `laneClient.answer(toolCallId, text)`
 *   ——`answer` 是审批协议里**属于回答自己的那条 action**（2026-09-21 新增），那段话
 *   一字不改变成模型看到的 tool result，回合不中断。在它之前这条路借的是 `deny`，
 *   于是转录里留下的是一条用户从没做过的拒绝。
 *
 * ## 为什么解析住在渲染层
 *
 * 槽里这张卡今天就是靠嗅 `args` 认出来的（`agentPanelV4Intervention.ts` 顶上那段注释）。
 * 嗅探规则只有一份、是纯函数、逐条可单测——多一份就是「同一个语义两个主人」。
 */
import type { AskUserAnswer, AskUserHostReason, AskUserOption, AskUserQuestion, AskUserReply } from '../../../../electron/shared/agentCapabilities/askUser'
import { ASK_USER_OPTION_RANGE, ASK_USER_QUESTION_RANGE, askUserReplyText } from '../../../../electron/shared/agentCapabilities/askUser'

export type V4QuestionOption = Readonly<Omit<AskUserOption, 'id'> & {
  /** 卡上必须有一个稳定的 id；模型没给就由 `questionOptions()` 按位置补 `option-N`。 */
  id: string
}>

/** 我们**自己**要说的那句话（不是模型写的），所以只传一个码 + 数，文案在渲染层 i18n。 */
export type V4QuestionAskReason = Readonly<AskUserHostReason>

/**
 * 一次提问。
 *
 * `options` 允许为空：没给选项就只剩自由输入那一行，卡照样成立（缺参数常常就是这样）。
 * 上限**不在这里卡**——拍板的是 2–4 个，但把它做成解析期的硬截断会让「模型多给了一个」
 * 变成一条静默丢失的数据。数量的判词归 `questionOptionCountIssue()`，调用方决定怎么说。
 */
export type V4QuestionAsk = Readonly<Omit<AskUserQuestion, 'question' | 'options'> & {
  /** 解析后恒有这个字段（只给了 `missingParam` 时是空串，问句由调用方按参数名补）。 */
  question: string
  options: readonly V4QuestionOption[]
  /** 只给了 `missingParam` 时是那个参数名。 */
  missingParamName?: string
}>

/**
 * **一张卡**：1–3 题，一次显示一题（2026-09-21 拍板，版式整件还原 Beautiful UI 的 Approval Card）。
 *
 * 为什么是一张卡几题、而不是一题一张卡：对用户来说相关的几个问题是**一次**打断；
 * 一题一回合则是「答一句、等它想一会、再被问一句」，同一件事被切成三次等待。
 */
export type V4QuestionSheet = Readonly<{
  questions: readonly V4QuestionAsk[]
  /** 宿主生产者写的那一句（熔断），整张卡一份。args 上叫 `askReason`，解析后叫 `reason`。 */
  reason?: V4QuestionAskReason
}>

/**
 * 用户答了什么。
 *
 * 两种来源共用一个形状：点 chip 时 `optionId` 有值、`text` 是那颗 chip 的 `label`；
 * 卡内打字时 `optionId` 缺席、`text` 是他打的那句话。**永远有 `text`**——模型只认字，
 * 一个光秃秃的 id 对它来说和没答一样。
 */
export type V4QuestionAnswer = Readonly<Omit<AskUserAnswer, 'optionIds'> & { optionIds?: readonly string[] }>

/**
 * **整张卡**的答复：答了的那几题 + 明说跳过了哪几题（形状派生自 owner `askUserReplySchema`）。
 * 跳过必须显式——缺席读不出「跳过」，详见 owner 那边的注释。
 */
export type V4QuestionReply = Readonly<{
  answers: readonly V4QuestionAnswer[]
  skippedQuestionIndexes?: Readonly<NonNullable<AskUserReply['skippedQuestionIndexes']>>
}>

/**
 * 拍板的选项数量区间（2026-09-21：2–4 个）与题数区间（1–3 题）。超出不丢数据，只由调用方决定怎么说。
 * 数值**从共享契约来**：说明书里印给模型的那几个数和这里判越界用的必须是同几个数。
 */
export const V4_QUESTION_OPTION_RANGE = ASK_USER_OPTION_RANGE
export const V4_QUESTION_COUNT_RANGE = ASK_USER_QUESTION_RANGE

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/**
 * `args.options` → 选项数组。
 *
 * 三种写法都收：裸字符串、`{label}`、`{title}`。宽进是因为**写这份 args 的是模型**，
 * 而一次拼错的字段名在今天的链路上没有任何东西会报错——它只会安静地渲成一张没有选项的卡。
 */
export function questionOptions(rawArgs: unknown): readonly V4QuestionOption[] {
  const options = asRecord(rawArgs).options
  if (!Array.isArray(options)) return []
  return options.flatMap((option, index): V4QuestionOption[] => {
    const fallbackId = `option-${index + 1}`
    if (typeof option === 'string' && option.trim()) return [{ id: fallbackId, label: option }]
    if (!option || typeof option !== 'object' || Array.isArray(option)) return []
    const record = option as Record<string, unknown>
    const label = trimmed(record.label) ?? trimmed(record.title)
    if (!label) return []
    const description = trimmed(record.description) ?? trimmed(record.hint)
    return [{
      id: trimmed(record.id) ?? fallbackId,
      label,
      ...(description ? { description } : {}),
      ...(record.recommended === true ? { recommended: true as const } : {}),
    }]
  })
}

function askReason(rawArgs: unknown): V4QuestionAskReason | undefined {
  const reason = asRecord(asRecord(rawArgs).askReason)
  if (reason.code !== 'retry_exhausted') return undefined
  const attempts = typeof reason.attempts === 'number' && Number.isFinite(reason.attempts) ? Math.trunc(reason.attempts) : 0
  return attempts > 0 ? Object.freeze({ code: 'retry_exhausted' as const, attempts }) : undefined
}

/**
 * 这次待决是不是一次提问；是就返回它问什么。
 *
 * `missingParam` 走的也是这里：缺参数本来就是「一句问题 + 几个现成答案」，它没有第二种长相
 * （2026-09-12 已经把它并进反问格了）。它只缺**问题那句话**——工具通常只说「缺 duration」，
 * 那对用户不是一句话，所以问句由调用方按 `missingParamName` 补一句人话，这里只如实说缺哪个。
 */
function parseOneQuestion(raw: unknown, missingParamName?: string): V4QuestionAsk | undefined {
  const record = asRecord(raw)
  const question = trimmed(record.question)
  if (!question && !missingParamName) return undefined
  const note = trimmed(record.note)
  return Object.freeze({
    question: question ?? '',
    options: questionOptions(raw),
    ...(missingParamName ? { missingParamName } : {}),
    ...(note ? { note } : {}),
    ...(record.multiSelect === true ? { multiSelect: true as const } : {}),
  })
}

/**
 * 这次待决是不是一次提问；是就返回**整张卡**。
 *
 * 题数上限**不在这里卡**（与选项数同一条理由）：模型多给一题时截断会让它变成一条静默
 * 丢失的数据。判词归 `questionCountIssue()`，调用方决定怎么说。
 */
export function parseQuestionSheet(rawArgs: unknown): V4QuestionSheet | undefined {
  const record = asRecord(rawArgs)
  const missing = trimmed(record.missingParam)
  const raw = Array.isArray(record.questions) ? record.questions : []
  const questions = raw.flatMap((entry) => { const one = parseOneQuestion(entry); return one ? [one] : [] })
  if (questions.length === 0 && missing) {
    // 缺参数本来就是「一句问题 + 几个现成答案」，它没有第二种长相（2026-09-12 并档）。
    // 它只缺**问题那句话**——工具通常只说「缺 duration」，那对用户不是一句话，
    // 所以问句由调用方按 `missingParamName` 补一句人话，这里只如实说缺哪个。
    const one = parseOneQuestion(rawArgs, missing)
    if (one) questions.push(one)
  }
  if (questions.length === 0) return undefined
  const reason = askReason(rawArgs)
  return Object.freeze({ questions: Object.freeze(questions), ...(reason ? { reason } : {}) })
}

/** 题数越界时的判词。`undefined` = 在区间内。 */
export function questionCountIssue(sheet: V4QuestionSheet): 'too-many' | undefined {
  return sheet.questions.length > V4_QUESTION_COUNT_RANGE.max ? 'too-many' : undefined
}

/** 选项数量越界时的判词。`undefined` = 在区间内。调用方决定说不说、怎么说。 */
export function questionOptionCountIssue(ask: V4QuestionAsk): 'too-few' | 'too-many' | undefined {
  if (ask.options.length === 0) return undefined // 只有自由输入的一张卡，合法
  if (ask.options.length < V4_QUESTION_OPTION_RANGE.min) return 'too-few'
  if (ask.options.length > V4_QUESTION_OPTION_RANGE.max) return 'too-many'
  return undefined
}

/**
 * 空的时候回车什么都不做（拍板细则）。
 *
 * 写成一个函数而不是 `if (!text.trim())`：这条规则有**两个**后果，第二个才是真正会出事的
 * 那个——不提交，**也不把这次回车传给下面的 composer**（否则会发出一条空消息，或者把上一条
 * 草稿误发出去）。一个判据两处用，且它值得被单测钉住。
 */
export function questionAnswerFromInput(text: string, questionIndex = 0): V4QuestionAnswer | undefined {
  const trimmedText = text.trim()
  return trimmedText ? Object.freeze({ questionIndex, text: trimmedText }) : undefined
}

/** 多选那一支：几颗一起提交，`text` 是它们的标签连起来——模型只认字。 */
export function questionAnswerFromOptions(
  options: readonly V4QuestionOption[], questionIndex = 0,
): V4QuestionAnswer | undefined {
  if (options.length === 0) return undefined
  return Object.freeze({
    questionIndex,
    optionIds: Object.freeze(options.map((option) => option.id)),
    text: options.map((option) => option.label).join('、'),
  })
}

export function questionAnswerFromOption(option: V4QuestionOption, questionIndex = 0): V4QuestionAnswer {
  return questionAnswerFromOptions([option], questionIndex)!
}

/**
 * 回给模型的那段字。**写法只有一份，住在 owner**（`askUserReplyText`）——这里只是把卡上的
 * 问句表与答复递过去。渲染层自己再拼一遍，就是第二份「模型读到什么」。
 */
export function answerToolResult(questions: readonly string[], reply: V4QuestionReply): string {
  return askUserReplyText(questions, {
    answers: reply.answers.map((answer) => ({
      questionIndex: answer.questionIndex,
      ...(answer.optionIds ? { optionIds: [...answer.optionIds] } : {}),
      text: answer.text,
    })),
    ...(reply.skippedQuestionIndexes?.length ? { skippedQuestionIndexes: [...reply.skippedQuestionIndexes] } : {}),
  })
}
