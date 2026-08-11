import { describe, it, expect } from 'vitest'
import { buildToolOutcome, buildToolErrorOutcome, buildProgressStartMessage } from './mcpToolResults'

describe('buildToolOutcome (A2 结果重写：转述原材料 + 参数回显)', () => {
  it('start_playbook：状态首行 + 参数回显 + 下一步；结构化字段齐 runId/nextActions', () => {
    const { text, outcome } = buildToolOutcome(
      'nomi_start_playbook',
      { projectId: 'p1', playbook: 'brand.promo', brief: { goal: '一条 60 秒品牌宣传片，主角小满', durationSeconds: 60 } },
      { runId: 'run_7f32', openInNomi: 'nomi://open/run_7f32' },
    )
    expect(text).toContain('✓')
    expect(text).toContain('run_7f32')
    expect(text).toContain('未花费')
    expect(text).toContain('brand.promo')
    expect(text).toContain('60s')
    expect(text).toContain('在 Nomi 打开 nomi://open/run_7f32')
    expect(outcome).toMatchObject({ kind: 'run_draft', runId: 'run_7f32', projectId: 'p1', nextActions: ['pick_direction'] })
  })

  it('get_run：状态翻成人话 + 预算行 + 下一步（en locale 全英文）', () => {
    const { text, outcome } = buildToolOutcome(
      'nomi_get_run',
      { projectId: 'p1', runId: 'run_1' },
      { runId: 'run_1', status: 'awaiting_contract', stageId: 'contract', budget: { authorized: 99.74, actual: 0 } },
      'en',
    )
    expect(text).toContain('awaiting budget approval')
    expect(text).toContain('budget cap 99.74')
    expect(text).toContain('approve the production contract')
    expect(outcome).toMatchObject({ kind: 'run_status', status: 'awaiting_contract', nextActions: ['approve_contract'] })
  })

  it('subscribe_run 空事件：明说「暂无」+ cursor；有事件逐行透出', () => {
    const empty = buildToolOutcome('nomi_subscribe_run', { runId: 'r' }, { events: [], nextCursor: 5 })
    expect(empty.text).toContain('暂无新的重要事件')
    expect(empty.text).toContain('next cursor 5')
    const some = buildToolOutcome('nomi_subscribe_run', { runId: 'r' }, {
      events: [{ type: 'gate.waiting', message: '等待预算批准' }], nextCursor: 6,
    })
    expect(some.text).toContain('gate.waiting · 等待预算批准')
    expect(some.outcome).toMatchObject({ eventCount: 1, nextCursor: 6 })
  })

  it('generate：参数回显（模型/意图/参考数/截断提示词）+ 结构化 params', () => {
    const { text, outcome } = buildToolOutcome(
      'nomi_generate',
      { projectId: 'p1', vendor: 'kling', modelKey: 'v2', intent: 'video', prompt: 'x'.repeat(60), references: ['a', 'b'] },
      { assetId: 'a1' },
    )
    expect(text).toContain('已生成一段视频')
    expect(text).toContain('kling · v2')
    expect(text).toContain('参考 2')
    expect(text).toContain('…') // 提示词截断
    expect(outcome).toMatchObject({ kind: 'generation', params: { vendor: 'kling', modelKey: 'v2', intent: 'video', references: 2 } })
  })

  it('画布低层工具维持 JSON 直出（text=null 不接管）', () => {
    const { text, outcome } = buildToolOutcome('nomi_read_canvas', { projectId: 'p1' }, { nodes: [] })
    expect(text).toBeNull()
    expect(outcome).toBeNull()
  })
})

describe('nomi_control_run 诚实敞口（中转已提交≈收不回）', () => {
  it('pausing 且有在途任务：⚠ 报数量 + 会跑完并计费 + 自动落停；outcome 带 inFlightJobs', () => {
    const { text, outcome } = buildToolOutcome(
      'nomi_control_run',
      { projectId: 'p1', runId: 'run_1', action: 'pause' },
      { runId: 'run_1', status: 'pausing', jobs: [
        { jobId: 'j1', status: 'polling' },
        { jobId: 'j2', status: 'provider_accepted' },
        { jobId: 'j3', status: 'authorized' },
      ] },
    )
    expect(text).toContain('✓ 正在暂停')
    expect(text).toContain('⚠ 2 个已提交的任务无法撤回，会跑完并计费')
    expect(text).toContain('完成后自动落停')
    expect(text).toContain('未提交的任务不再提交、不计费')
    expect(outcome).toMatchObject({ kind: 'run_control', inFlightJobs: 2 })
  })

  it('paused 无在途：不出 ⚠ 行；cancel 有在途：⚠ 仍会计费', () => {
    const clean = buildToolOutcome('nomi_control_run', { runId: 'r', action: 'pause' }, { runId: 'r', status: 'paused', jobs: [] })
    expect(clean.text).toContain('✓ 已暂停')
    expect(clean.text).not.toContain('⚠')
    const cancelled = buildToolOutcome('nomi_control_run', { runId: 'r', action: 'cancel' }, {
      runId: 'r', status: 'cancelled', jobs: [{ jobId: 'j1', status: 'downloading' }],
    })
    expect(cancelled.text).toContain('⚠ 1 个已提交的任务无法撤回，会跑完并计费')
    expect(cancelled.text).toContain('已完成的产物保留在项目里')
  })
})

describe('buildToolErrorOutcome (A6 错误契约)', () => {
  it('已知错误码：人话原因 + 诊断码 + 恢复动作编号列表', () => {
    const { text, outcome } = buildToolErrorOutcome('nomi_generate', new Error('generate failed: renderer_or_provider_unknown'))
    expect(text).toContain('✗')
    expect(text).toContain('找不到能执行这次生成的渲染器或供应商配置')
    expect(text).toContain('诊断 renderer_or_provider_unknown')
    expect(text).toContain('1. ')
    expect(outcome).toMatchObject({ kind: 'error', errorCode: 'renderer_or_provider_unknown' })
    expect((outcome.recoveryActions as string[]).length).toBeGreaterThan(0)
  })

  it('未知错误：原样透传 message，不编造原因；generate 附「已完成内容安全」提示', () => {
    const { text, outcome } = buildToolErrorOutcome('nomi_generate', new Error('ECONNRESET boom'))
    expect(text).toContain('ECONNRESET boom')
    expect(text).toContain('已完成的内容安全')
    expect(outcome).toMatchObject({ errorCode: null, message: 'ECONNRESET boom' })
  })
})

describe('buildProgressStartMessage (A1 起始帧参数回显)', () => {
  it('generate：已受理 + 模型 + 意图；start_playbook：草稿 + playbook；其它工具 null', () => {
    expect(buildProgressStartMessage('nomi_generate', { vendor: 'kling', modelKey: 'v2', intent: 'video' }))
      .toBe('已受理 · kling · v2 · video')
    expect(buildProgressStartMessage('nomi_start_playbook', { playbook: 'brand.promo' }))
      .toBe('正在创建制作草稿 · brand.promo')
    expect(buildProgressStartMessage('nomi_read_canvas', {})).toBeNull()
  })
})
