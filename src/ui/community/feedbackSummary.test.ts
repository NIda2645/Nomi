import { describe, expect, it } from 'vitest'
import { feedbackSummaryLine, feedbackSurfaceOf } from './feedbackSummary'

describe('摘要行的格式（只管排版，不管分类）', () => {
  const now = new Date('2026-09-15T02:41:00')

  it('人话 · 时间 · 版本 · 模型，按这个顺序', () => {
    expect(feedbackSummaryLine({ summary: '画布写入层没接受草案节点', appVersion: '0.22.0', model: 'gpt-5.5', now }))
      .toBe('画布写入层没接受草案节点 · 02:41 · 0.22.0 · gpt-5.5')
  })

  it('缺的格**直接不出现**，不留「未知」占位', () => {
    // 一行里三个「未知」比短一点更难读，而且会让用户以为是我们没取到本该有的东西。
    expect(feedbackSummaryLine({ summary: '这一步没成功', now })).toBe('这一步没成功 · 02:41')
    expect(feedbackSummaryLine({ summary: '这一步没成功', appVersion: '0.22.0', model: null, now }))
      .toBe('这一步没成功 · 02:41 · 0.22.0')
  })

  it('只到分钟：秒对「什么时候出的问题」没有信息', () => {
    const line = feedbackSummaryLine({ summary: 'x', now: new Date('2026-09-15T02:41:37') })
    expect(line).toBe('x · 02:41')
  })
})

describe('打开请求 → surface', () => {
  it('显式给了就认它', () => {
    expect(feedbackSurfaceOf({ surface: 'agent' })).toBe('agent')
  })

  it('老调用点只带 stage 时按 stage 归位', () => {
    expect(feedbackSurfaceOf({ stage: 'model' })).toBe('model-validation')
    expect(feedbackSurfaceOf({ stage: 'upload' })).toBe('import')
    expect(feedbackSurfaceOf({ stage: 'generation' })).toBe('generation')
    expect(feedbackSurfaceOf({ stage: 'export' })).toBe('generation')
  })

  it('什么上下文都没有（规范入口）落 unspecified，**不许**兜底成 generation', () => {
    // 走查第一版真跑出来的报文里写着 "surface":"generation"，而那份报告跟生成毫无关系。
    // 分诊时把「用户主动来说一件事」读成「生成坏了」，比没有这一格更糟。
    expect(feedbackSurfaceOf(null)).toBe('unspecified')
    expect(feedbackSurfaceOf({})).toBe('unspecified')
    expect(feedbackSurfaceOf({ intent: 'suggestion' })).toBe('unspecified')
    expect(feedbackSurfaceOf({ stage: 'other' })).toBe('unspecified')
  })
})
