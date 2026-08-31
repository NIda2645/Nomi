import { describe, it, expect, vi, afterEach } from 'vitest'
import { createProgressReporter } from './mcpProgress'

type Frame = { method?: string; params?: { progressToken?: unknown; progress?: number; message?: string; total?: unknown } }

afterEach(() => {
  vi.useRealTimers()
})

describe('createProgressReporter (A1 进度桥)', () => {
  it('没有 progressToken 时完全静默（no-op，客户端没要进度就不发）', () => {
    const send = vi.fn()
    const reporter = createProgressReporter({ send, progressToken: undefined })
    reporter.emit('阶段')
    reporter.stop()
    expect(send).not.toHaveBeenCalled()
  })

  it('起始帧 + emit：progress 单调递增、token 回显、不带 total（不造百分比）', () => {
    const send = vi.fn()
    const reporter = createProgressReporter({ send, progressToken: 'tok-1', startMessage: '已受理 · kling · video' })
    reporter.emit('镜头 3/16 · 供应商已受理')
    reporter.stop()
    const frames = send.mock.calls.map(([f]) => f as Frame)
    expect(frames).toHaveLength(2)
    expect(frames[0].method).toBe('notifications/progress')
    expect(frames[0].params?.progressToken).toBe('tok-1')
    expect(frames[0].params?.progress).toBe(1)
    expect(frames[0].params?.message).toBe('已受理 · kling · video')
    expect(frames[1].params?.progress).toBe(2)
    expect(frames[1].params?.message).toContain('镜头 3/16')
    expect('total' in (frames[1].params ?? {})).toBe(false)
  })

  it('心跳报真实已用时长，emit 会重置心跳计时；stop 后不再发', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const reporter = createProgressReporter({ send, progressToken: 7, heartbeatMs: 10_000 })
    vi.advanceTimersByTime(10_000)
    expect(send).toHaveBeenCalledTimes(1)
    const beat = send.mock.calls[0][0] as Frame
    expect(beat.params?.message).toContain('00:10')
    reporter.emit('真事件') // 重置心跳
    send.mockClear()
    vi.advanceTimersByTime(9_000)
    expect(send).not.toHaveBeenCalled() // 未到新周期
    vi.advanceTimersByTime(1_000)
    expect(send).toHaveBeenCalledTimes(1) // 从 emit 起重新计满 10s
    reporter.stop()
    send.mockClear()
    vi.advanceTimersByTime(30_000)
    reporter.emit('停后事件')
    expect(send).not.toHaveBeenCalled()
  })

  it('英文 locale 心跳用英文', () => {
    vi.useFakeTimers()
    const send = vi.fn()
    createProgressReporter({ send, progressToken: 'tok', heartbeatMs: 5_000, locale: 'en' })
    vi.advanceTimersByTime(5_000)
    const beat = send.mock.calls[0][0] as Frame
    expect(beat.params?.message).toContain('still working')
    expect(beat.params?.message).toContain('00:05')
  })
})
