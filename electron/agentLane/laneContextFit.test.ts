import { describe, expect, it } from 'vitest'
import { LANE_ELIDED_NOTE_PREFIX, estimateRequestTokens, fitContextToBudget, type FitMessage } from './laneContextFit'

const text = (value: string) => [{ type: 'text', text: value }]
const call = (id: string, name: string, args: unknown): FitMessage => ({ role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }] })
const result = (id: string, name: string, body: string): FitMessage => ({ role: 'toolResult', toolCallId: id, toolName: name, isError: false, content: text(body), details: { keep: id } })
const user = (body: string): FitMessage => ({ role: 'user', content: body })
/** 一份 ~N token 的中文（1 字 ≈ 1 token：宁可高估，别低估）。 */
const zh = (tokens: number) => '海'.repeat(tokens)

/** 一个真实形状的长回合：读全文、改写回、再读全文、再写回……每次读都是一整份剧本。 */
function longTurn(rounds: number, scriptTokens = 15_000): FitMessage[] {
  const messages: FitMessage[] = [user('收紧剧本')]
  for (let index = 0; index < rounds; index += 1) {
    messages.push(call(`r${index}`, 'read_script', {}), result(`r${index}`, 'read_script', zh(scriptTokens)))
    messages.push(call(`w${index}`, 'write_script', { content: zh(6_000), where: 'end' }), result(`w${index}`, 'write_script', 'ok'))
  }
  return messages
}

describe('每一次请求的输入都落在预算内', () => {
  const budget = 80_000
  const system = zh(25_000)

  it('没超预算：原样返回（同一个数组，不重建）', () => {
    const messages = [user('hi'), call('a', 'read_script', {}), result('a', 'read_script', zh(1_000))]
    const fitted = fitContextToBudget({ messages, systemPrompt: system, budget })
    expect(fitted.messages).toBe(messages)
    expect(fitted.elided).toEqual({ results: 0, calls: 0 })
  })

  it('同一回合里读了四份整剧本：旧的被收起，装得下预算，最新那份工具结果原样留着', () => {
    const messages = longTurn(4)
    expect(estimateRequestTokens(messages, system)).toBeGreaterThan(budget) // 先证明输入确实超了
    const fitted = fitContextToBudget({ messages, systemPrompt: system, budget })
    expect(estimateRequestTokens(fitted.messages, system)).toBeLessThanOrEqual(budget)
    const results = fitted.messages.filter((message) => message.role === 'toolResult')
    const lastRead = results.filter((message) => message.toolName === 'read_script').at(-1)!
    expect(JSON.stringify(lastRead.content)).toContain(zh(100))
    expect(fitted.elided.results).toBeGreaterThan(0)
  })

  it('收起的结果告诉模型发生了什么、怎么拿回来；信封（details）、配对 id 原样在', () => {
    const fitted = fitContextToBudget({ messages: longTurn(4), systemPrompt: system, budget })
    const first = fitted.messages.find((message) => message.role === 'toolResult' && message.toolCallId === 'r0')!
    const body = JSON.stringify(first.content)
    expect(body).toContain(LANE_ELIDED_NOTE_PREFIX)
    expect(body).toContain('read_script')
    expect(first.details).toEqual({ keep: 'r0' })
    expect(first.toolCallId).toBe('r0')
    // 每条 toolResult 仍然紧跟着它的调用：配对没被破坏
    const ids = fitted.messages.flatMap((message) => message.role === 'assistant' ? (message.content as Array<{ id: string }>).map((part) => part.id) : [])
    const answered = fitted.messages.filter((message) => message.role === 'toolResult').map((message) => message.toolCallId)
    expect(answered).toEqual(ids)
  })

  it('写入的大参数（整份稿子）也会被收起，最新一条调用的参数不动', () => {
    const fitted = fitContextToBudget({ messages: longTurn(6, 9_000), systemPrompt: system, budget })
    const calls = fitted.messages.filter((message) => message.role === 'assistant')
    const lastWrite = calls.filter((message) => (message.content as Array<{ name: string }>)[0].name === 'write_script').at(-1)!
    expect(JSON.stringify(lastWrite)).toContain(zh(100))
    expect(fitted.elided.calls + fitted.elided.results).toBeGreaterThan(0)
    expect(estimateRequestTokens(fitted.messages, system)).toBeLessThanOrEqual(budget)
  })

  it('用户的话从不被收起（哪怕是很长的一段）', () => {
    const messages = [user(zh(30_000)), ...longTurn(4).slice(1)]
    const fitted = fitContextToBudget({ messages, systemPrompt: system, budget })
    expect(fitted.messages[0]).toBe(messages[0])
  })

  it('系统提示词 + 最新一条结果就已超预算（没有别的可收）：不假装装得下，原样交出并如实标出超了多少', () => {
    const messages = [user('x'), call('a', 'read_script', {}), result('a', 'read_script', zh(90_000))]
    const fitted = fitContextToBudget({ messages, systemPrompt: system, budget })
    expect(fitted.messages.at(-1)).toBe(messages.at(-1))
    expect(fitted.overBudgetBy).toBeGreaterThan(0)
  })

  it('已经收起过的不会被再收一遍（幂等）', () => {
    const once = fitContextToBudget({ messages: longTurn(5), systemPrompt: system, budget })
    const twice = fitContextToBudget({ messages: once.messages, systemPrompt: system, budget })
    expect(twice.messages).toBe(once.messages)
  })
})
