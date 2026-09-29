// 剧本里那颗「Agent 大脑」的写法：夹具只替换远端的文本模型，SDK / IPC / 宿主 / 渲染层全是真的。
//
// 大脑按真实模型会做的那样出牌：读用户这一句 → 调工具 → 读工具结果 → 再调工具或说话。
// 每一轮是一串「期望」（agent-runtime-fixture 的 expectText），第 k 个期望认的是第 k-1 次工具调用的结果，
// 所以参数可以从上一次的结果里算（例如 generate 要的 operationId 来自 draft_shots 的结果）。
//
// 大脑说的话由剧本给——它不是被测对象。被测的是**宿主递给大脑的东西**（工具结果 / 回执），监视器从夹具请求里读它们。
import { flattenRequestText } from '../agent-runtime-fixture.mjs'

/** 这一次请求里最后一条用户消息的文字（历史里的旧话不算，免得下一轮又被上一轮的期望认走）。 */
export function lastUserText(body) {
  const users = (body?.messages ?? []).filter((message) => message?.role === 'user')
  return flattenRequestText({ messages: users.slice(-1) })
}

/** 某次工具调用的结果正文（宿主递给模型的原话）。 */
export function toolResultText(body, callId) {
  const message = (body?.messages ?? []).find((entry) => entry?.role === 'tool' && entry.tool_call_id === callId)
  if (!message) return null
  return typeof message.content === 'string' ? message.content : (message.content ?? []).map((part) => part?.text ?? '').join('\n')
}

/** 最后一条消息是不是某次工具调用的结果（「轮到大脑读这个结果了」）。 */
function answersCall(body, callId) {
  const last = (body?.messages ?? []).at(-1)
  return last?.role === 'tool' && last.tool_call_id === callId
}

/**
 * 写一轮。`steps` 依次是 `{ tool, args, text? }`（调工具，args 可以是函数 `({ previous, body }) => args`）
 * 或 `{ text }`（说话收尾）。返回每一步的「到达」promise 和工具调用 id。
 */
export function scriptTurn(fixture, { label, marker, steps }) {
  if (!steps.length) throw new Error('scriptTurn needs at least one step')
  const callIds = steps.map((_, index) => `${label}-${index}`)
  const arrivals = steps.map((step, index) => {
    const match = index === 0
      ? (body) => lastUserText(body).includes(marker) && !(body?.messages ?? []).some((message) => message?.role === 'tool' && callIds.includes(message.tool_call_id))
      : (body) => answersCall(body, callIds[index - 1])
    const handle = fixture.expectText({ label: `${label} #${index}`, match, reply: { type: 'hold' } })
    return handle.received.then((record) => {
      const previous = index === 0 ? null : toolResultText(record.body, callIds[index - 1])
      const context = { previous, body: record.body }
      const reply = step.tool
        ? { type: 'tool', id: callIds[index], name: step.tool, args: typeof step.args === 'function' ? step.args(context) : step.args, ...(step.text ? { text: step.text } : {}) }
        : { type: 'text', text: typeof step.text === 'function' ? step.text(context) : step.text }
      handle.release(reply)
      // 同一步被宿主重发（压缩之后重试、上下文超限之后重试）：真模型会给出同样的回答。
      // 一次性期望已经用掉了，这里补一个只认「这一步」的常驻应答，免得夹具把重试判成计划外请求。
      fixture.respond({ label: `${label} #${index} (retry)`, match, reply })
      return { record, previous, reply }
    })
  })
  return { callIds, arrivals, done: arrivals.at(-1) }
}

/** 从工具结果里取 operationId（draft_shots / generate 的结果都带它）。 */
export function operationIdOf(text) {
  return /"operationId":"([^"]+)"/.exec(String(text ?? ''))?.[1] ?? null
}

/**
 * App 自己在后台发起、次数不定的文本调用（不是用户这一轮）：给它们一个像样的回答，别让夹具判成「计划外请求」。
 *   · 出图后的镜级审片（`electron/capabilityCore/shotVerifyCore.ts`）：回一份中规中矩的分数。
 */
export function standingBackgroundResponders(fixture) {
  fixture.respond({
    label: 'shot review after an image lands (shotVerifyCore)',
    match: (body) => flattenRequestText(body).includes('资深影视分镜审片'),
    reply: { type: 'text', text: '{"reason":"画面与提示词一致","scores":{"identity":4,"aesthetics":4,"intent":4}}' },
  })
  // 上下文压缩（pi `compaction.js` 的 SUMMARIZATION_SYSTEM_PROMPT）：真供应商会老老实实回一份摘要。
  fixture.respond({
    label: 'context compaction summary (pi compaction)',
    match: (body) => JSON.stringify(body?.messages?.[0] ?? {}).includes('context summarization assistant'),
    reply: { type: 'text', text: '## Goal\n用户在改一份海港剧本。\n## Progress\n已经扩写并收紧了几轮。\n## Next Steps\n按用户下一句继续。' },
  })
}
