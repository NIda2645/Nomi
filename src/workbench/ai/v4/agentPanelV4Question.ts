/**
 * 介入槽 · 反问卡的**对外契约**（2026-09-21 拍板：「反问必须是通用能力」）。
 *
 * 用户原话：「这个是模型要自己输入选项吧，通用的吧，别搞错了，只有那一种反问就离谱了」。
 * 所以这里定的不是「画幅怎么问」，而是**任何一次提问**长什么样：模型自己写问题、自己写
 * 2–4 个选项（标签 + 一句说明 + 可标推荐），卡内永远带一行自由输入。任何面（文档 / 画布 /
 * 时间轴）任何话题都能用同一张卡。宿主侧的「缺参数」「同字段 3 次熔断」只是同一张卡的
 * **另外两个生产者**，不是唯一触发——所以这个文件里不许出现任何一个具体题目的字段。
 *
 * ## 这份契约的两端
 *
 * · **吃什么**：`parseQuestionAsk(args)`——一次待决工具调用的 `args`。模型侧的提问工具由
 *   主进程 lane 接（届时它的 JSON Schema 必须与 `V4QuestionAsk` 逐字段对齐）。
 * · **回什么**：`V4QuestionAnswer`。今天回传的载体是 `laneClient.deny(toolCallId, text)`
 *   ——lane 的审批协议只有准 / 不准，而带话的那一支会把那句话**一字不改**变成模型看到的
 *   tool result（`laneClient.deny` 的注释；计划卡的「只留这几条」走的也是它）。
 *   `answerToolResult()` 是这条路上唯一的序列化口，主进程 lane 接上真正的提问工具之后
 *   只需要换掉调用它的那一行，卡与解析一个字都不用动。
 *
 * ## 为什么解析住在渲染层
 *
 * 槽里这张卡今天就是靠嗅 `args` 认出来的（`agentPanelV4Intervention.ts` 顶上那段注释）。
 * 嗅探规则只有一份、是纯函数、逐条可单测——多一份就是「同一个语义两个主人」。
 * 这个文件是那一份；`residentExceptionProjections.residentQuestionOptions` 已随本次改动删除。
 */

/**
 * 一个选项。
 *
 * · `label` 是 chip 上印的那几个字，**也是**答案本身（定稿 ⑤：反问格没有确认/不要，
 *   选项本身就是回答）。
 * · `description` 是标签下面那一句说明。模型不写就没有——我们不替它编。
 * · `recommended` 是「它建议这一个」。只是一个记号，不预选、不代答。
 */
export type V4QuestionOption = Readonly<{
  id: string
  label: string
  description?: string
  recommended?: true
}>

/** 我们**自己**要说的那句话（不是模型写的），所以只传一个码 + 数，文案在渲染层 i18n。 */
export type V4QuestionAskReason = Readonly<{ code: 'retry_exhausted'; attempts: number }>

/**
 * 一次提问。
 *
 * `options` 允许为空：没给选项就只剩自由输入那一行，卡照样成立（缺参数常常就是这样）。
 * 上限**不在这里卡**——拍板的是 2–4 个，但把它做成解析期的硬截断会让「模型多给了一个」
 * 变成一条静默丢失的数据。数量的判词归 `questionOptionCountIssue()`，调用方决定怎么说。
 */
export type V4QuestionAsk = Readonly<{
  question: string
  options: readonly V4QuestionOption[]
  /** 模型自己写的一句补充（「为什么现在问」）。 */
  note?: string
  /** 宿主生产者写的那一句（熔断）。文案由渲染层按码出，不接受成句的字符串。 */
  reason?: V4QuestionAskReason
}>

/**
 * 用户答了什么。
 *
 * 两种来源共用一个形状：点 chip 时 `optionId` 有值、`text` 是那颗 chip 的 `label`；
 * 卡内打字时 `optionId` 缺席、`text` 是他打的那句话。**永远有 `text`**——模型只认字，
 * 一个光秃秃的 id 对它来说和没答一样。
 */
export type V4QuestionAnswer = Readonly<{ optionId?: string; text: string }>

/** 拍板的选项数量区间（2026-09-21：2–4 个）。超出不丢数据，只由调用方决定怎么说。 */
export const V4_QUESTION_OPTION_RANGE = Object.freeze({ min: 2, max: 4 })

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
export function parseQuestionAsk(rawArgs: unknown): (V4QuestionAsk & { missingParamName?: string }) | undefined {
  const record = asRecord(rawArgs)
  const missing = trimmed(record.missingParam)
  const question = trimmed(record.question)
  if (!missing && !question) return undefined
  const reason = askReason(rawArgs)
  const note = trimmed(record.note)
  return Object.freeze({
    question: question ?? '',
    options: questionOptions(rawArgs),
    ...(missing ? { missingParamName: missing } : {}),
    ...(note ? { note } : {}),
    ...(reason ? { reason } : {}),
  })
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
export function questionAnswerFromInput(text: string): V4QuestionAnswer | undefined {
  const trimmedText = text.trim()
  return trimmedText ? Object.freeze({ text: trimmedText }) : undefined
}

export function questionAnswerFromOption(option: V4QuestionOption): V4QuestionAnswer {
  return Object.freeze({ optionId: option.id, text: option.label })
}

/**
 * 回给模型的那段字。
 *
 * 只发 `text`：id 是我们这边的东西，模型给的选项本来就是它自己写的那几个字，
 * 把 `option-2` 这种内部 id 发回去只会让它去猜我们在说哪一个。带 id 的那一半留在
 * `V4QuestionAnswer` 里，等主进程 lane 接上真正的提问工具时由结构化字段承载。
 */
export function answerToolResult(answer: V4QuestionAnswer): string {
  return answer.text
}
