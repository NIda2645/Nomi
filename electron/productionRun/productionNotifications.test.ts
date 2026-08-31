import { describe, expect, it } from 'vitest'
import { createNoticeDedupe, decideProductionNotice } from './productionNotifications'
import type { ProductionRun, RunEvent } from './productionRunTypes'

// A5 通知决策矩阵：四类才打扰、按严重度取最高、批空/无关不吵、去重窗口只放一次。

function fakeRun(status: ProductionRun['status']): ProductionRun {
  return { runId: 'run-n1', projectId: 'project-1', status } as ProductionRun
}
function ev(type: string, message = ''): RunEvent {
  return { type, message } as RunEvent
}

describe('decideProductionNotice (A5)', () => {
  it('空批 / 无关事件（skill.loaded 等）→ null 不打扰', () => {
    expect(decideProductionNotice([], fakeRun('running'))).toBeNull()
    expect(decideProductionNotice([ev('skill.loaded'), ev('job.ready')], fakeRun('running'))).toBeNull()
  })

  it('gate.waiting → 等你确认，body 优先用事件自带人话', () => {
    const decided = decideProductionNotice([ev('gate.waiting', '预算 ¥99.74 等待批准')], fakeRun('awaiting_contract'))
    expect(decided?.title).toContain('等你确认')
    expect(decided?.body).toBe('预算 ¥99.74 等待批准')
    expect(decided?.target).toEqual({ projectId: 'project-1', runId: 'run-n1' })
  })

  it('严重度排序：submission_unknown > gate.waiting；needs_attention > gate.waiting', () => {
    const unknownFirst = decideProductionNotice(
      [ev('gate.waiting'), ev('job.submission_unknown')],
      fakeRun('running'),
    )
    expect(unknownFirst?.key).toBe('submission_unknown:run-n1')
    expect(unknownFirst?.recovery).toMatchObject({ allowAutomaticRetry: false, nextAction: 'manual_review' })
    const attentionFirst = decideProductionNotice(
      [ev('gate.waiting'), ev('job.needs_attention', '镜头 5 提交失败')],
      fakeRun('running'),
    )
    expect(attentionFirst?.key).toBe('attention:run-n1')
    expect(attentionFirst?.body).toContain('镜头 5')
  })

  it('完成：run.status.changed 且 run 已 completed → 制作完成；running 时同事件不报完成', () => {
    expect(decideProductionNotice([ev('run.status.changed')], fakeRun('completed'))?.key).toBe('completed:run-n1')
    expect(decideProductionNotice([ev('run.status.changed')], fakeRun('running'))).toBeNull()
  })

  it('en locale 出英文', () => {
    const decided = decideProductionNotice([ev('gate.waiting')], fakeRun('running'), 'en')
    expect(decided?.title).toContain('approval')
  })
})

describe('createNoticeDedupe (A5)', () => {
  it('窗口期内同 key 只放行一次，过窗后重新放行；不同 key 互不影响', () => {
    let clock = 0
    const allow = createNoticeDedupe(60_000, () => clock)
    expect(allow('gate:run-1')).toBe(true)
    expect(allow('gate:run-1')).toBe(false)
    expect(allow('completed:run-1')).toBe(true)
    clock = 59_999
    expect(allow('gate:run-1')).toBe(false)
    clock = 60_000
    expect(allow('gate:run-1')).toBe(true)
  })
})
