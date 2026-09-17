import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFeedbackReport, isFeedbackReportRequest, type FeedbackReportDeps } from './feedbackReport'
import type { TrajectoryTurnInput } from '../shared/agentLane/laneTrajectory'
import type { FeedbackReportRequest } from '../shared/contracts/feedback'

const FIXTURE = path.join(__dirname, '../../tests/fixtures/standard-formats/nomi-agent-trace-view/trace.jsonl')
const fixtureTurns = (): TrajectoryTurnInput[] =>
  fs.readFileSync(FIXTURE, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as TrajectoryTurnInput)

function deps(overrides: Partial<FeedbackReportDeps> = {}): FeedbackReportDeps {
  return {
    now: new Date('2026-09-15T02:41:00.000Z'),
    app: { version: '0.22.0', electron: '43.0.0', node: '22.0.0', chrome: '130' },
    system: { platform: 'darwin', arch: 'arm64', osRelease: '25.5.0', locale: 'zh-CN', timeZone: 'Asia/Shanghai' },
    projectId: 'winter-bus',
    readLogTail: () => [
      'ts=2026-09-15T02:40:59Z event=generation-start model=gpt-5.5',
      'ts=2026-09-15T02:41:00Z event=generation-failed path=/Users/aoqimin/Documents/Nomi Projects/winter-bus/refs/glass-fog.png key=sk-live-9QhT2mVx7Zb4Lp0RwEaYcN1sKdJf',
    ],
    // nomi-secret-scan:allow 这是金测试的合成靶子（同 tests/fixtures 里那份 trace.jsonl），不是任何真实账号的 key；它存在的意义就是被断言「不许出现在产物里」
    readModelCatalog: () => ({ apiKeys: [{ vendor: 'apimart', apiKey: 'sk-live-9QhT2mVx7Zb4Lp0RwEaYcN1sKdJf', enabled: true }] }),
    readTrajectory: async () => fixtureTurns(),
    ...overrides,
  }
}

const request: FeedbackReportRequest = {
  surface: 'model-validation',
  summary: '模型验证失败：接口地址返回 404',
  errorCode: 'adapter_probe_not_found',
  laneName: 'winter-bus-lane',
}

describe('一键反馈组包', () => {
  it('入参守卫：面必须在四个里，摘要不许空', () => {
    expect(isFeedbackReportRequest(request)).toBe(true)
    expect(isFeedbackReportRequest({ ...request, surface: 'timeline' })).toBe(false)
    expect(isFeedbackReportRequest({ ...request, summary: '   ' })).toBe(false)
    expect(isFeedbackReportRequest({ ...request, note: 42 })).toBe(false)
    expect(isFeedbackReportRequest(null)).toBe(false)
  })

  it('清单逐项写 what、排除项逐条写 why，且清单与附件一一对应', async () => {
    const report = await buildFeedbackReport(request, deps())
    expect(report.manifest.entries.map((entry) => entry.path).sort())
      .toEqual(['logs/tail.txt', 'model-catalog.json', 'trajectory/turns.json'])
    for (const entry of report.manifest.entries) {
      expect(entry.what.length).toBeGreaterThan(4)
      expect(entry.bytes).toBeGreaterThan(0)
      expect(Object.hasOwn(report.attachments, entry.path)).toBe(true)
    }
    // 清单里没写的格子不许存在。
    expect(Object.keys(report.attachments).sort()).toEqual(report.manifest.entries.map((entry) => entry.path).sort())
    const why = report.manifest.excluded.map((item) => item.why)
    expect(why).toContain('never-collected-by-design')
    expect(why).toContain('content-checkbox-not-ticked')
    expect(why).toContain('available-only-via-settings-diagnostics-export')
  })

  it('密钥、路径、提示词在整包里零命中（没勾内容）', async () => {
    const serialized = JSON.stringify(await buildFeedbackReport(request, deps()))
    expect(serialized).not.toContain('sk-live-9QhT2mVx7Zb4Lp0RwEaYcN1sKdJf')
    expect(serialized).not.toContain('/Users/aoqimin/Documents/Nomi Projects/winter-bus')
    expect(serialized).not.toContain('末班公交车上只剩两个人')
    expect(serialized).not.toContain('iVBORw0KGgoAAAANSUhEUgAA')
  })

  it('勾了内容：清单那一行的 what 明说是用户勾选带上的，信封也记一笔', async () => {
    const report = await buildFeedbackReport({ ...request, includeContent: true }, deps())
    expect(report.context.contentIncluded).toBe(true)
    const trajectory = report.manifest.entries.find((entry) => entry.path === 'trajectory/turns.json')
    expect(trajectory?.what).toContain('勾选')
    expect(report.manifest.excluded.map((item) => item.why)).not.toContain('content-checkbox-not-ticked')
    // 即便勾了，密钥与路径仍然不出门。
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('sk-live-9QhT2mVx7Zb4Lp0RwEaYcN1sKdJf')
    expect(serialized).not.toContain('/Users/aoqimin/Documents/Nomi Projects/winter-bus')
  })

  it('摘要与留言也过第二道网：调用处传进来的人话可能带着服务商原话里的一段 URL', async () => {
    const report = await buildFeedbackReport({
      ...request,
      summary: '模型验证失败：https://my-private-relay.internal/v1/chat?key=abc123456789 返回 404',
      note: '我把参考图放在 /Users/aoqimin/Desktop/ref.mov 就出这个',
    }, deps())
    expect(report.context.summary).not.toContain('key=abc123456789')
    expect(report.context.summary).toContain('模型验证失败')
    expect(report.context.note).not.toContain('/Users/aoqimin/Desktop/ref.mov')
    expect(report.context.note).toContain('参考图')
  })

  it('留言空 → null，不发一个空串让接收端去判断', async () => {
    expect((await buildFeedbackReport({ ...request, note: '   ' }, deps())).context.note).toBeNull()
    expect((await buildFeedbackReport(request, deps())).context.note).toBeNull()
  })

  it('错误码形状不对就丢掉（它只用来聚类，不显示）', async () => {
    expect((await buildFeedbackReport({ ...request, errorCode: '接口 404' }, deps())).context.errorCode).toBeNull()
    expect((await buildFeedbackReport(request, deps())).context.errorCode).toBe('adapter_probe_not_found')
  })

  it('用户自建中转的 key 塌成字面量 custom，不带出私有域名', async () => {
    const report = await buildFeedbackReport({ ...request, provider: 'internal proxy corp.local', model: '我的模型' }, deps())
    expect(report.context.provider).toBe('custom')
    expect(report.context.model).toBe('custom')
    const passthrough = await buildFeedbackReport({ ...request, provider: 'apimart', model: 'gpt-5.5' }, deps())
    expect(passthrough.context.provider).toBe('apimart')
    expect(passthrough.context.model).toBe('gpt-5.5')
  })

  it('取不到的东西写进 excluded 而不是静默消失', async () => {
    const report = await buildFeedbackReport({ ...request, laneName: undefined }, deps({
      readLogTail: () => null,
      readModelCatalog: () => null,
    }))
    expect(report.manifest.entries).toHaveLength(0)
    const map = new Map(report.manifest.excluded.map((item) => [item.what, item.why]))
    expect(map.get('logs/tail.txt')).toBe('logs-unavailable')
    expect(map.get('model-catalog.json')).toBe('catalog-unavailable')
    expect(map.get('trajectory/turns.json')).toBe('no-conversation-in-context')
  })

  it('轨迹取料抛异常不炸整包，只是那一项被排除', async () => {
    const report = await buildFeedbackReport(request, deps({
      readTrajectory: async () => { throw new Error('lane locked') },
    }))
    expect(report.manifest.excluded.find((item) => item.what === 'trajectory/turns.json')?.why).toBe('trajectory-unavailable')
    expect(report.manifest.entries.map((entry) => entry.path)).not.toContain('trajectory/turns.json')
  })

  it('超预算的那一项被排除并写明 report-size-limit，不是悄悄截断', async () => {
    const huge = Array.from({ length: 40_000 }, (_item, index) => `ts=2026-09-15 event=noise-${index} detail=${'x'.repeat(40)}`)
    const report = await buildFeedbackReport(request, deps({ readLogTail: () => huge }))
    const paths = report.manifest.entries.map((entry) => entry.path)
    const excluded = report.manifest.excluded.filter((item) => item.why === 'report-size-limit').map((item) => item.what)
    expect(paths.length + excluded.length).toBe(3)
    expect(excluded.length).toBeGreaterThan(0)
    expect(report.manifest.totalBytes).toBeLessThanOrEqual(1_200_000)
  })
})
