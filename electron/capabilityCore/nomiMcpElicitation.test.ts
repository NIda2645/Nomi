import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMcpProtocol, type McpTransport } from './mcpProtocol'

// MCP 协议层的 elicitation 付费确认握手。
// 验证手搓双向 JSON-RPC：服务端能发 elicitation/create 给客户端、按 id 路由响应、按确认结果放行/拦截。
// 直接驱动纯协议层 mcpProtocol.ts（注入假 transport）——不 spawn 任何进程、不触发真实生成。
//
// 路由判据 = 「谁能替我们问到真人」，**不是「Nomi 窗口开着没」**（2026-08-18 修：窗口开着 ≠ 用户注意力
// 在 Nomi，旧判据害得人从 Claude 跑回 App 点一下）。下面 4 条锁死 {支持 elicitation × App 开/关} 全矩阵。

type RpcMessage = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { code?: number; message?: string } }

/** 充当 MCP 客户端：收集服务端发来的帧，把客户端的帧喂回协议层。 */
class ProtocolHarness {
  readonly invoke: ReturnType<typeof vi.fn>
  private protocol: ReturnType<typeof createMcpProtocol>
  private queue: RpcMessage[] = []
  private waiters: Array<(msg: RpcMessage) => void> = []

  constructor(
    appOpen = false,
    invokeImpl: (method: string, params: Record<string, unknown>) => Promise<unknown> = async () => {
      throw new Error('invoke 不该在 decline / 不支持 路径被调用')
    },
  ) {
    this.invoke = vi.fn(invokeImpl)
    const transport: McpTransport = {
      send: (message) => {
        const msg = message as RpcMessage
        const waiter = this.waiters.shift()
        if (waiter) waiter(msg)
        else this.queue.push(msg)
      },
      invoke: this.invoke,
      isAppOpen: () => appOpen,
    }
    this.protocol = createMcpProtocol(transport)
  }

  send(msg: RpcMessage): void {
    this.protocol.handleIncoming(msg)
  }

  next(timeoutMs = 5000): Promise<RpcMessage> {
    const queued = this.queue.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('等待 MCP 消息超时')), timeoutMs)
      this.waiters.push((msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
    })
  }

  async initialize(elicitation: boolean, protocolVersion = '2025-11-25'): Promise<RpcMessage> {
    this.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion, capabilities: elicitation ? { elicitation: {} } : {} },
    })
    const res = await this.next()
    expect(res.id).toBe(1)
    return res
  }
}

let harness: ProtocolHarness | null = null

afterEach(() => {
  harness = null
})

describe('nomi-mcp · 付费确认按「谁能问到真人」路由', () => {
  const GENERATE_ARGS = { projectId: 'p', vendor: 'apimart', modelKey: 'doubao-seedance-2.0', intent: 'video', prompt: '巷口回头' }
  const callGenerate = (h: ProtocolHarness) =>
    h.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nomi_generate', arguments: GENERATE_ARGS } })
  /** 生成成功的 invoke 桩：只有「真人确认过」的路径才该走到这里。 */
  const generateOk = async (method: string) => {
    if (method === 'generate') return { nodeId: 'n1', assetPath: '/tmp/a.mp4' }
    throw new Error(`unexpected invoke: ${method}`)
  }

  it('① 支持 elicitation + App 关：弹在调用方 → decline → 拦截不生成', async () => {
    harness = new ProtocolHarness(false)
    await harness.initialize(true)
    callGenerate(harness)
    // 服务端应先发 elicitation/create 请求给客户端。
    const elicit = await harness.next()
    expect(elicit.method).toBe('elicitation/create')
    expect(typeof elicit.id).toBe('string')
    const params = elicit.params as { message?: string }
    expect(params.message).toContain('doubao-seedance-2.0')
    // 旧文案硬编码了「Nomi 未打开。」开头；改判据后 App 开着也走这条，那句话不再成立 → 必须已删。
    expect(params.message).not.toContain('Nomi 未打开')
    // 真人点了取消 → decline。
    harness.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'decline' } })
    const toolRes = await harness.next()
    expect(toolRes.id).toBe(2)
    const result = toolRes.result as { content: Array<{ text: string }>; isError?: boolean }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('已取消')
    expect(harness.invoke).not.toHaveBeenCalled()
  })

  it('② 支持 elicitation + App 开：仍弹在调用方（不赶人回 Nomi），accept 才带 spendConfirmed 放行', async () => {
    // 这条就是本次修复的核心：旧判据下 App 一开就跳过 elicitation、把人赶去点应用内卡片。
    harness = new ProtocolHarness(true, generateOk)
    await harness.initialize(true)
    callGenerate(harness)
    const elicit = await harness.next()
    expect(elicit.method).toBe('elicitation/create')
    expect((elicit.params as { message?: string }).message).not.toContain('Nomi 未打开')
    harness.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'accept', content: { confirm: true } } })
    const toolRes = await harness.next()
    expect(toolRes.id).toBe(2)
    expect(toolRes.result).not.toMatchObject({ isError: true })
    // 真人在调用方确认过 → 必须带 spendConfirmed 过线，否则 App 会再弹一次卡（双问）。
    expect(harness.invoke).toHaveBeenCalledWith('generate', expect.anything(), { spendConfirmed: true })
  })

  it('③ 不支持 elicitation + App 开：不弹、原样 invoke（由应用内确认卡兜底），绝不自带 spendConfirmed', async () => {
    harness = new ProtocolHarness(true, generateOk)
    await harness.initialize(false)
    callGenerate(harness)
    const toolRes = await harness.next()
    expect(toolRes.id).toBe(2)
    expect(toolRes.result).not.toMatchObject({ isError: true })
    // 没人替我们问过真人 → 这次 invoke 不许预批付费，确认权留给应用内卡片。
    expect(harness.invoke).toHaveBeenCalledTimes(1)
    expect(harness.invoke.mock.calls[0][2]).not.toMatchObject({ spendConfirmed: true })
  })

  it('④ 不支持 elicitation + App 关：无处问真人 → 诚实报错，不生成', async () => {
    harness = new ProtocolHarness(false)
    await harness.initialize(false)
    callGenerate(harness)
    const toolRes = await harness.next()
    expect(toolRes.id).toBe(2)
    const result = toolRes.result as { content: Array<{ text: string }>; isError?: boolean }
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('不支持弹确认')
    expect(harness.invoke).not.toHaveBeenCalled()
  })

  it('握手回显客户端请求的协议版本（兼容只讲老协议的客户端，如 Codex/Cursor 早期）', async () => {
    harness = new ProtocolHarness(false)
    // 老客户端只讲 2025-03-26（elicitation 之前的修订）。
    const res = await harness.initialize(false, '2025-03-26')
    const result = res.result as { protocolVersion?: string }
    expect(result.protocolVersion).toBe('2025-03-26')
  })
})

describe('nomi-mcp · 创意门由服务端强制 elicitation', () => {
  const directionProjection = {
    runId: 'run-1', projectId: 'project-1', status: 'awaiting_direction',
    gates: [{
      gateId: 'gate-direction-v1', scope: 'stage', status: 'waiting',
      title: 'Choose a direction', summary: 'Pick one before storyboard planning.',
      directionCandidates: [{ key: 'studio', title: 'Studio', oneLiner: 'Minimal product film' }],
    }],
  }

  it('客户端不支持 elicitation：不读取也不应用决定', async () => {
    harness = new ProtocolHarness(true)
    await harness.initialize(false)
    harness.send({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'nomi_decide_gate', arguments: { projectId: 'project-1', runId: 'run-1', gateId: 'gate-direction-v1', decision: 'approved', choiceKey: 'studio' } },
    })
    const response = await harness.next()
    expect(response.id).toBe(2)
    expect(response.result).toMatchObject({ isError: true })
    expect(harness.invoke).not.toHaveBeenCalled()
  })

  it('真人拒绝：只读当前门，不应用决定', async () => {
    harness = new ProtocolHarness(true, async (method) => {
      if (method === 'production.get') return directionProjection
      throw new Error(`unexpected invoke: ${method}`)
    })
    await harness.initialize(true)
    harness.send({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'nomi_decide_gate', arguments: { projectId: 'project-1', runId: 'run-1', gateId: 'gate-direction-v1', decision: 'approved', choiceKey: 'studio' } },
    })
    const elicit = await harness.next()
    expect(elicit.method).toBe('elicitation/create')
    expect((elicit.params as { message?: string }).message).toContain('Studio')
    harness.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'decline' } })
    const response = await harness.next()
    expect(response.result).toMatchObject({ isError: true })
    expect(harness.invoke).toHaveBeenCalledTimes(1)
    expect(harness.invoke).not.toHaveBeenCalledWith('production.decide-gate', expect.anything())
  })

  it('真人明确接受：确认后才应用同一个创意决定', async () => {
    harness = new ProtocolHarness(true, async (method) => {
      if (method === 'production.get') return directionProjection
      if (method === 'production.decide-gate') return {
        ...directionProjection,
        gates: [{ ...directionProjection.gates[0], status: 'approved', decidedChoiceKey: 'studio' }],
      }
      throw new Error(`unexpected invoke: ${method}`)
    })
    await harness.initialize(true)
    harness.send({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'nomi_decide_gate', arguments: { projectId: 'project-1', runId: 'run-1', gateId: 'gate-direction-v1', decision: 'approved', choiceKey: 'studio' } },
    })
    const elicit = await harness.next()
    harness.send({ jsonrpc: '2.0', id: elicit.id, result: { action: 'accept', content: { confirm: true } } })
    const response = await harness.next()
    expect(response.id).toBe(2)
    expect(response.result).not.toMatchObject({ isError: true })
    expect(harness.invoke).toHaveBeenNthCalledWith(1, 'production.get', { projectId: 'project-1', runId: 'run-1' })
    expect(harness.invoke).toHaveBeenNthCalledWith(2, 'production.decide-gate', {
      projectId: 'project-1', runId: 'run-1', gateId: 'gate-direction-v1', decision: 'approved', choiceKey: 'studio',
    })
  })

  it('预算门在协议层直接拒绝，不向客户端伪装成可批准创意门', async () => {
    harness = new ProtocolHarness(true, async (method) => {
      if (method === 'production.get') return {
        ...directionProjection,
        gates: [{ gateId: 'gate-contract-v1', scope: 'budget_envelope', status: 'waiting', title: 'Budget', summary: 'Spend' }],
      }
      throw new Error(`unexpected invoke: ${method}`)
    })
    await harness.initialize(true)
    harness.send({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'nomi_decide_gate', arguments: { projectId: 'project-1', runId: 'run-1', gateId: 'gate-contract-v1', decision: 'approved' } },
    })
    const response = await harness.next()
    expect(response.id).toBe(2)
    expect(response.result).toMatchObject({ isError: true })
    expect(JSON.stringify(response.result)).toContain('Nomi')
    expect(harness.invoke).toHaveBeenCalledTimes(1)
  })
})
