import { describe, expect, it } from 'vitest'
import { projectGenerationRecovery } from './generationRecoveryProjection'

describe('projectGenerationRecovery', () => {
  it('keeps the normal observe-only provider usable while making unknown receipt reconcile-only', () => {
    expect(projectGenerationRecovery({ state: 'submission_unknown', profile: 'observe_only', providerReference: 'task-1' })).toEqual({
      state: 'submission_unknown',
      profile: 'observe_only',
      title: '可能已经提交',
      message: '供应商任务 task-1 可能已经接受；Nomi 可以继续查询，不会自动重提。',
      nextAction: 'reconcile',
      allowAutomaticRetry: false,
      allowNewAttempt: true,
      providerReference: 'task-1',
    })
  })

  it('does not invent a provider reference for submit-only providers', () => {
    const projection = projectGenerationRecovery({ state: 'submission_unknown', profile: 'submit_only' })
    expect(projection.nextAction).toBe('manual_review')
    expect(projection.allowAutomaticRetry).toBe(false)
    expect(projection.allowNewAttempt).toBe(true)
    expect(projection).not.toHaveProperty('providerReference')
  })

  it('stops local waiting without promising remote cancellation', () => {
    expect(projectGenerationRecovery({ state: 'cancel_requested', profile: 'observe_only', providerReference: 'task-1' })).toMatchObject({
      title: '已停止等待',
      status: 'detached',
      nextAction: 'observe',
      allowAutomaticRetry: false,
    })
  })

  it('allows a deliberate new attempt only after the previous state is explicit', () => {
    expect(projectGenerationRecovery({ state: 'cancelled', profile: 'full_recovery' })).toMatchObject({
      nextAction: 'create_new_attempt',
      allowNewAttempt: true,
      allowAutomaticRetry: false,
    })
  })
})
