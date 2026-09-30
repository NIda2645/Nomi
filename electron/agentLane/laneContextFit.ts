// 「每一次模型请求的输入都在预算内」的执行件。预算的主人是 `laneContextBudget.mts`（LANE_CONTEXT_TOKEN_BUDGET）；
// pi 自带的压缩只在**回合之间**量一次、超门槛才摘要，管不到**一个回合里**连着十几次请求：每一步都把前面所有
// 工具结果（一整份剧本读了又读）原样带上，一回合就能从 75K 涨到 146K。pi 给了一个专门放这件事的口——
// `transform_context` 的 messages（文档原话「Context window management (pruning old messages)」）——这里就是
// 它的实现：**只改这一次请求看到的视图，不动落盘的转录**。
//
// 规则（全部可由输入推出，没有一个写死的场景）：
//   · 超了预算才动手；没超，原样返回同一个数组。
//   · 收起的只有**旧的、大的工具结果**，其次是旧的、大的工具调用参数；从最老的开始，装得下就停。
//   · 最新一条工具结果、最新一条助手消息、所有用户的话从不收——模型此刻要读的、用户亲口说的，不能替它决定不要。
//   · 收起处留一句人话：发生了什么、怎么拿回来（再调同一个工具）。信封（details）与配对 id 原样在。
//   · 收完还是超（系统提示词 + 最新结果本身就超）：不假装装得下，`overBudgetBy` 如实报，由工具结果的**源头上限**负责。

/** 这份模块只认 pi 消息里用得到的那几个字段，不 import pi（纯函数，能被单测直接喂）。 */
export type FitMessage = Readonly<{
  role: string
  content?: unknown
  toolCallId?: string
  toolName?: string
  isError?: boolean
  details?: unknown
}>

export const LANE_ELIDED_NOTE_PREFIX = '[Earlier output omitted to keep this request within its size budget.'
/** 小于它的不值得收（收起来省不了几个 token，还平白丢信息）。按估算 token 计。 */
const ELIDE_MIN_TOKENS = 1_500
/** UTF-8 字节 / 3 ≈ token：中文一字约 3 字节约 1 token；英文会高估，高估只会让收起来得更早——宁早勿晚。 */
const BYTES_PER_TOKEN = 3

const bytes = (value: string) => Buffer.byteLength(value, 'utf8')

export function estimateRequestTokens(messages: readonly FitMessage[], systemPrompt: string): number {
  return Math.ceil(bytes(`${systemPrompt}${JSON.stringify(messages)}`) / BYTES_PER_TOKEN)
}

const tokensOf = (value: unknown) => Math.ceil(bytes(JSON.stringify(value) ?? '') / BYTES_PER_TOKEN)

const alreadyElided = (content: unknown) => JSON.stringify(content)?.includes(LANE_ELIDED_NOTE_PREFIX) === true

function elidedResult(message: FitMessage, tokens: number): FitMessage {
  const what = message.toolName ?? 'this tool'
  return { ...message, content: [{ type: 'text', text: `${LANE_ELIDED_NOTE_PREFIX} `
    + `The ${what} result here (about ${tokens} tokens) is no longer included. Call ${what} again if you still need it.]` }] }
}

function elidedCallParts(content: unknown, toolName: (id: string) => string | undefined): { content: unknown; count: number; saved: number } {
  if (!Array.isArray(content)) return { content, count: 0, saved: 0 }
  let count = 0
  let saved = 0
  const next = content.map((part) => {
    if (!part || typeof part !== 'object' || (part as { type?: unknown }).type !== 'toolCall') return part
    const args = (part as { arguments?: unknown }).arguments
    const size = tokensOf(args)
    if (size < ELIDE_MIN_TOKENS || alreadyElided(args)) return part
    count += 1
    saved += size
    const name = (part as { name?: string }).name ?? toolName((part as { id?: string }).id ?? '') ?? 'this tool'
    return { ...part, arguments: { omitted: `${LANE_ELIDED_NOTE_PREFIX} The arguments of this earlier ${name} call (about ${size} tokens) are no longer included.]` } }
  })
  return { content: next, count, saved }
}

export type FitResult<T extends FitMessage> = Readonly<{
  messages: readonly T[]
  elided: Readonly<{ results: number; calls: number }>
  /** 收完仍超预算的 token 数；0 = 装得下。 */
  overBudgetBy: number
}>

export function fitContextToBudget<T extends FitMessage>(input: {
  messages: readonly T[]; systemPrompt: string; budget: number
  /** 不在 messages / systemPrompt 里、但同样算进请求输入的东西（工具定义）。 */
  reservedTokens?: number
}): FitResult<T> {
  const { messages, systemPrompt } = input
  const budget = input.budget - (input.reservedTokens ?? 0)
  const total = estimateRequestTokens(messages, systemPrompt)
  if (total <= budget) return { messages, elided: { results: 0, calls: 0 }, overBudgetBy: 0 }
  const next = [...messages]
  let remaining = total
  const lastResult = next.map((message) => message.role === 'toolResult').lastIndexOf(true)
  const lastAssistant = next.map((message) => message.role === 'assistant').lastIndexOf(true)
  const counts = { results: 0, calls: 0 }
  // ① 旧的大工具结果，最老的先收。
  for (let index = 0; index < next.length && remaining > budget; index += 1) {
    const message = next[index]!
    if (message.role !== 'toolResult' || index === lastResult || alreadyElided(message.content)) continue
    const size = tokensOf(message.content)
    if (size < ELIDE_MIN_TOKENS) continue
    const replaced = elidedResult(message, size) as T
    remaining -= size - tokensOf(replaced.content)
    next[index] = replaced
    counts.results += 1
  }
  // ② 还超：旧的大工具调用参数（例如一整份写回去的稿子），最老的先收。
  const nameOf = (id: string) => next.find((message) => message.role === 'toolResult' && message.toolCallId === id)?.toolName
  for (let index = 0; index < next.length && remaining > budget; index += 1) {
    const message = next[index]!
    if (message.role !== 'assistant' || index === lastAssistant) continue
    const { content, count, saved } = elidedCallParts(message.content, nameOf)
    if (!count) continue
    next[index] = { ...message, content } as T
    remaining -= saved
    counts.calls += count
  }
  const after = estimateRequestTokens(next, systemPrompt)
  return { messages: counts.results + counts.calls ? next : messages, elided: counts, overBudgetBy: Math.max(0, after - budget) }
}
