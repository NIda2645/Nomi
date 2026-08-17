import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMcpProtocol, type McpTransport } from './mcpProtocol'

// T2 · 可见性栈协议级测试（注入假 transport，不 spawn 进程、不碰真库/App）。覆盖：
//  ① 进度：nomi_generate 带 _meta.progressToken → 至少 1 条 notifications/progress（token 回显、progress 增序、message 非空）；
//     不带 token → 零条 progress（spec：客户端没要就不发）。
//  ② 图片块：结果夹带 _nomiThumbnail → tool result content 里恰含一个 {type:image,data,mimeType:image/jpeg}；
//     无 thumbnail → 无 image 块（结果其余完好）。
//  ③ 深链：结果带 openInNomi → tool result 文本含链接 + structuredContent.nomiOutcome.openInNomi。

type RpcMessage = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { code?: number; message?: string } }

/** 假 MCP 客户端：收集服务端所有帧；invoke 返回可控 generate 结果。 */
function makeHarness(generateResult: unknown) {
  const frames: RpcMessage[] = []
  const invoke = vi.fn(async (method: string) => {
    if (method === 'generate') return generateResult
    throw new Error(`unexpected invoke: ${method}`)
  })
  const transport: McpTransport = {
    send: (m) => frames.push(m as RpcMessage),
    invoke: invoke as McpTransport['invoke'],
    isAppOpen: () => true, // App 开着 → 跳过 spend elicitation，直接 invoke（聚焦可见性栈）
  }
  const protocol = createMcpProtocol(transport)
  return { protocol, frames, invoke }
}

function callGenerate(protocol: ReturnType<typeof createMcpProtocol>, extraParams: Record<string, unknown> = {}) {
  protocol.handleIncoming({
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: {
      name: 'nomi_generate',
      arguments: { projectId: 'p1', vendor: 'kling', modelKey: 'v2', intent: 'image', prompt: '一只橘猫' },
      ...extraParams,
    },
  })
}

async function flush() {
  // handleIncoming 是异步 handle 的 fire-and-forget；等微任务队列清空拿到最终 reply。
  await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => vi.useRealTimers())

describe('交付① 进度（notifications/progress opt-in）', () => {
  it('带 _meta.progressToken → ≥1 条 progress（token 回显、progress 单调增、message 非空）', async () => {
    const { protocol, frames } = makeHarness({ status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://asset/p1/a.png' }] })
    callGenerate(protocol, { _meta: { progressToken: 'tok-9' } })
    await flush()
    const progressFrames = frames.filter((f) => f.method === 'notifications/progress')
    expect(progressFrames.length).toBeGreaterThanOrEqual(1)
    for (const f of progressFrames) {
      expect(f.params?.progressToken).toBe('tok-9')
      expect(typeof f.params?.progress).toBe('number')
      expect(String(f.params?.message || '').length).toBeGreaterThan(0)
    }
    // 增序：progress 严格递增。
    const seq = progressFrames.map((f) => f.params?.progress as number)
    for (let i = 1; i < seq.length; i += 1) expect(seq[i]).toBeGreaterThan(seq[i - 1])
    // 起始帧 message = 参数回显。
    expect(String(progressFrames[0].params?.message)).toContain('kling')
  })

  it('不带 progressToken → 零条 progress（spec：没要就不发）', async () => {
    const { protocol, frames } = makeHarness({ status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://asset/p1/a.png' }] })
    callGenerate(protocol)
    await flush()
    expect(frames.filter((f) => f.method === 'notifications/progress').length).toBe(0)
  })

  it('心跳：token 在手且任务耗时 → 起始帧后还有「仍在进行」心跳帧（真实已用时长）', async () => {
    vi.useFakeTimers()
    // invoke 拖到 25s 后才 resolve → 期间应有心跳（默认 10s 一跳）。
    let resolveInvoke: (v: unknown) => void = () => {}
    const invoke = vi.fn(() => new Promise((res) => { resolveInvoke = res }))
    const frames: RpcMessage[] = []
    const transport: McpTransport = { send: (m) => frames.push(m as RpcMessage), invoke: invoke as McpTransport['invoke'], isAppOpen: () => true }
    const protocol = createMcpProtocol(transport)
    callGenerate(protocol, { _meta: { progressToken: 7 } })
    await vi.advanceTimersByTimeAsync(25_000)
    resolveInvoke({ status: 'succeeded', assets: [] })
    await vi.advanceTimersByTimeAsync(0)
    const progressFrames = frames.filter((f) => f.method === 'notifications/progress')
    // 起始帧 + 至少两次心跳（10s、20s）。
    expect(progressFrames.length).toBeGreaterThanOrEqual(3)
    expect(progressFrames.some((f) => String(f.params?.message || '').includes('仍在进行'))).toBe(true)
  })
})

describe('交付② 图片内容块（native MCP ImageContent）', () => {
  it('结果带 _nomiThumbnail → content 恰含一个 image 块（base64 + image/jpeg），且不重复', async () => {
    const { protocol, frames } = makeHarness({
      status: 'succeeded',
      assets: [{ type: 'image', url: 'nomi-local://asset/p1/a.png' }],
      _nomiThumbnail: { data: 'QUJD', mimeType: 'image/jpeg' },
    })
    callGenerate(protocol)
    await flush()
    const reply = frames.find((f) => f.id === 42)
    const content = (reply?.result as { content?: Array<Record<string, unknown>> })?.content || []
    const images = content.filter((c) => c.type === 'image')
    expect(images.length).toBe(1)
    expect(images[0]).toMatchObject({ type: 'image', data: 'QUJD', mimeType: 'image/jpeg' })
    // 文本块仍在（纯文本宿主兜底）。
    expect(content.some((c) => c.type === 'text')).toBe(true)
    // base64 不该同时漏进文本块。
    const textBlock = content.find((c) => c.type === 'text') as { text?: string }
    expect(String(textBlock.text)).not.toContain('_nomiThumbnail')
  })

  it('结果无 _nomiThumbnail → 无 image 块，结果其余完好', async () => {
    const { protocol, frames } = makeHarness({ status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://asset/p1/a.png' }] })
    callGenerate(protocol)
    await flush()
    const reply = frames.find((f) => f.id === 42)
    const content = (reply?.result as { content?: Array<Record<string, unknown>> })?.content || []
    expect(content.filter((c) => c.type === 'image').length).toBe(0)
    expect(content.some((c) => c.type === 'text')).toBe(true)
  })
})

describe('交付③ 深链（数据 + 文本）', () => {
  it('generate 结果 → 文本含 nomi://project/{id} 深链 + structuredContent.nomiOutcome.openInNomi', async () => {
    const { protocol, frames } = makeHarness({ status: 'succeeded', assets: [{ type: 'image', url: 'nomi-local://asset/p1/a.png' }] })
    callGenerate(protocol)
    await flush()
    const reply = frames.find((f) => f.id === 42)
    const result = reply?.result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: { nomiOutcome?: { openInNomi?: string }; nomiDraft?: { deepLink?: string } } }
    const textBlock = result.content?.find((c) => c.type === 'text')
    expect(String(textBlock?.text)).toContain('nomi://project/p1')
    expect(result.structuredContent?.nomiOutcome?.openInNomi).toBe('nomi://project/p1')
    // widget 侧也拿到工程级深链（在 Nomi 打开按钮）。
    expect(result.structuredContent?.nomiDraft?.deepLink).toBe('nomi://project/p1')
  })
})
