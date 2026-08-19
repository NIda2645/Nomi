import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMcpProtocol, type McpInvokeOptions, type McpTransport } from './mcpProtocol'
import { SPEND_TRUST_REASK_AFTER } from './mcpSpendTrust'

// 会话级付费信任（plan 2026-08-19-session-scoped-spend-trust）：治用户原话「反复去软件确认 不是太麻烦了」。
// 纯协议层单测（注入假 transport）——不 spawn 进程、不碰真实库/App、不花额度。验证：
//  · 某项目首次生成照旧问真人；批准后同会话同项目后续免问，且仍逐次带 spendConfirmed（硬闸不松）；
//  · 换项目重新问；拒绝不记信任；invoke 抛错不记信任（失败不该换来一段免问期）；
//  · 用满 SPEND_TRUST_REASK_AFTER 次 → 再问一次，且文案讲清为什么又问；
//  · 卡片路（客户端不支持 elicitation + App 开）同样吃信任，且首张卡带 grantsSessionTrust（授权范围写脸上）。

type RpcMessage = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { code?: number; message?: string } }
type InvokeCall = { method: string; params: Record<string, unknown>; options?: McpInvokeOptions }

class SpendHarness {
  readonly invoke: ReturnType<typeof vi.fn>
  readonly invokeCalls: InvokeCall[] = []
  private protocol: ReturnType<typeof createMcpProtocol>
  private queue: RpcMessage[] = []
  private waiters: Array<(msg: RpcMessage) => void> = []
  /** 置成 true 时下一次 generate invoke 抛错（模拟「没点卡 → 无令牌 → 主进程硬闸拦」）。 */
  failNextGenerate = false

  constructor(appOpen: boolean) {
    this.invoke = vi.fn(async (method: string, params: Record<string, unknown>, options?: McpInvokeOptions) => {
      this.invokeCalls.push({ method, params, options })
      if (method !== 'generate') throw new Error(`unexpected invoke: ${method}`)
      if (this.failNextGenerate) {
        this.failNextGenerate = false
        throw new Error('此付费生成未经用户确认（缺少授权令牌），已拦截。')
      }
      return { nodeId: 'n1', status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://a' }] }
    })
    const transport: McpTransport = {
      send: (message) => {
        const msg = message as RpcMessage
        const waiter = this.waiters.shift()
        if (waiter) waiter(msg)
        else this.queue.push(msg)
      },
      invoke: this.invoke as McpTransport['invoke'],
      isAppOpen: () => appOpen,
    }
    this.protocol = createMcpProtocol(transport)
  }

  send(msg: RpcMessage): void { this.protocol.handleIncoming(msg) }

  next(timeoutMs = 5000): Promise<RpcMessage> {
    const queued = this.queue.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等待 MCP 消息超时')), timeoutMs)
      this.waiters.push((msg) => { clearTimeout(timer); resolve(msg) })
    })
  }

  async initialize(elicitation: boolean): Promise<void> {
    this.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: elicitation ? { elicitation: {} } : {}, clientInfo: { name: 'codex' } } })
    await this.next()
  }

  private callId = 1
  /** 发一次 nomi_generate，返回工具调用 id（不等结果）。 */
  callGenerate(projectId: string): number {
    const id = (this.callId += 1)
    this.send({
      jsonrpc: '2.0', id, method: 'tools/call',
      params: { name: 'nomi_generate', arguments: { projectId, vendor: 'v', modelKey: 'm', intent: 'image', prompt: 'p' } },
    })
    return id
  }

  /** 走一趟「问了 → 真人批准 → 生成成功」。返回那次 elicitation 的 message。 */
  async generateWithApproval(projectId: string): Promise<string> {
    this.callGenerate(projectId)
    const elicit = await this.next()
    expect(elicit.method).toBe('elicitation/create')
    const message = String((elicit.params as { message?: string }).message || '')
    this.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'accept', content: { confirm: true } } })
    const res = await this.next()
    expect(res.result).not.toMatchObject({ isError: true })
    return message
  }

  generateCalls(): InvokeCall[] { return this.invokeCalls.filter((c) => c.method === 'generate') }
}

let harness: SpendHarness | null = null
afterEach(() => { harness = null })

describe('nomi-mcp · 付费会话级信任（elicitation 路）', () => {
  it('首次问、批准后同项目免问，且每次仍带 spendConfirmed（只免问不免令牌）', async () => {
    harness = new SpendHarness(true)
    await harness.initialize(true)
    const firstMsg = await harness.generateWithApproval('p1')
    expect(firstMsg).toContain('不再逐次询问')

    // 第二次：不该再弹 elicitation，直接放行。
    harness.callGenerate('p1')
    const res = await harness.next()
    expect(res.result).not.toMatchObject({ isError: true })
    const calls = harness.generateCalls()
    expect(calls).toHaveLength(2)
    // 两次都带 spendConfirmed：免掉的是「问」，不是「令牌」——下游照旧逐次铸 node-bound 令牌。
    expect(calls.every((c) => c.options?.spendConfirmed === true)).toBe(true)
  })

  it('换项目要重新问（信任按 projectId 隔离）', async () => {
    harness = new SpendHarness(true)
    await harness.initialize(true)
    await harness.generateWithApproval('p1')
    // 另一个项目：必须重新弹 elicitation。
    harness.callGenerate('p2')
    const elicit = await harness.next()
    expect(elicit.method).toBe('elicitation/create')
    harness.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'accept', content: { confirm: true } } })
    await harness.next()
    expect(harness.generateCalls()).toHaveLength(2)
  })

  it('拒绝不记信任：下一次照旧问', async () => {
    harness = new SpendHarness(true)
    await harness.initialize(true)
    harness.callGenerate('p1')
    const first = await harness.next()
    harness.send({ jsonrpc: '2.0', id: first.id, result: { action: 'decline' } })
    const denied = await harness.next()
    expect(denied.result).toMatchObject({ isError: true })
    expect(harness.generateCalls()).toHaveLength(0)

    harness.callGenerate('p1')
    const second = await harness.next()
    expect(second.method).toBe('elicitation/create')
  })

  it('生成失败不记信任：失败不该换来一段免问期', async () => {
    harness = new SpendHarness(true)
    await harness.initialize(true)
    harness.failNextGenerate = true
    harness.callGenerate('p1')
    const elicit = await harness.next()
    harness.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'accept', content: { confirm: true } } })
    const failed = await harness.next()
    expect(failed.result).toMatchObject({ isError: true })

    // 下一次必须重新问（信任只在真跑成功后才记）。
    harness.callGenerate('p1')
    const again = await harness.next()
    expect(again.method).toBe('elicitation/create')
  })

  it(`免问用满 ${SPEND_TRUST_REASK_AFTER} 次后再问一次，且说清为什么又问`, async () => {
    harness = new SpendHarness(true)
    await harness.initialize(true)
    await harness.generateWithApproval('p1')
    // 吃掉整段免问额度。
    for (let i = 0; i < SPEND_TRUST_REASK_AFTER; i++) {
      harness.callGenerate('p1')
      const res = await harness.next()
      expect(res.result).not.toMatchObject({ isError: true })
    }
    expect(harness.generateCalls()).toHaveLength(SPEND_TRUST_REASK_AFTER + 1)

    // 第 N+1 次：额度用满 → 再问一次，文案要解释原因（否则用户以为坏了）。
    harness.callGenerate('p1')
    const elicit = await harness.next()
    expect(elicit.method).toBe('elicitation/create')
    const message = String((elicit.params as { message?: string }).message || '')
    expect(message).toContain(String(SPEND_TRUST_REASK_AFTER))
    expect(message).toContain('再确认')
  })
})

describe('nomi-mcp · 付费会话级信任（应用内卡片路 · 客户端不支持 elicitation）', () => {
  it('首张卡带 grantsSessionTrust（授权范围写脸上），成功后同项目免问', async () => {
    harness = new SpendHarness(true)
    await harness.initialize(false)
    harness.callGenerate('p1')
    const first = await harness.next()
    expect(first.result).not.toMatchObject({ isError: true })
    const calls = harness.generateCalls()
    expect(calls).toHaveLength(1)
    // 第一次走卡：不预批付费（确认权在卡上），但要告诉卡「这一点还换来一段免问期」。
    expect(calls[0].options?.spendConfirmed).not.toBe(true)
    expect(calls[0].params.grantsSessionTrust).toBe(true)

    // 第二次：吃信任 → 不再弹卡，改为预批放行（Claude Code 这类客户端也拿到「少点很多下」）。
    harness.callGenerate('p1')
    const second = await harness.next()
    expect(second.result).not.toMatchObject({ isError: true })
    const after = harness.generateCalls()
    expect(after).toHaveLength(2)
    expect(after[1].options?.spendConfirmed).toBe(true)
  })

  it('卡被拒/超时（invoke 抛错）→ 不记信任，下一次照旧弹卡', async () => {
    harness = new SpendHarness(true)
    await harness.initialize(false)
    harness.failNextGenerate = true
    harness.callGenerate('p1')
    const failed = await harness.next()
    expect(failed.result).toMatchObject({ isError: true })

    harness.callGenerate('p1')
    await harness.next()
    const calls = harness.generateCalls()
    expect(calls).toHaveLength(2)
    // 两次都没被预批：说明信任没被错记。
    expect(calls.every((c) => c.options?.spendConfirmed !== true)).toBe(true)
  })
})
