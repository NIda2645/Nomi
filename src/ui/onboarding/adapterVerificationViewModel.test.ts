import { describe, expect, it } from 'vitest'
import type { DesktopProviderAdapterRun } from '../../desktop/bridge'
import { adapterProviderState, adapterRunProgress, isAdapterModelLocked, isAdapterRunTerminal } from './adapterVerificationViewModel'

const run = (stage: DesktopProviderAdapterRun['stage']): DesktopProviderAdapterRun => ({
  id: 'run-1',
  vendorKey: 'example-com',
  vendorName: 'Example',
  selectedModelKeys: ['text-v1', 'paint-v2'],
  stage,
  repairAttempt: 0,
  sourceUrls: [],
  createdAt: '2026-08-07T00:00:00.000Z',
  updatedAt: '2026-08-07T00:00:00.000Z',
  models: [
    {
      modelKey: 'text-v1',
      labelZh: 'Text V1',
      kind: 'text',
      modes: [{ taskKind: 'chat', state: 'verified', attempts: 1 }],
    },
    {
      modelKey: 'paint-v2',
      labelZh: 'Paint V2',
      kind: 'image',
      modes: [
        { taskKind: 'text_to_image', state: 'verified', attempts: 1 },
        { taskKind: 'image_edit', state: 'testing', attempts: 1 },
      ],
    },
  ],
})

describe('adapterRunProgress', () => {
  it('reports real completed models rather than a fabricated percentage', () => {
    expect(adapterRunProgress(run('testing'))).toEqual({ completed: 1, total: 2, verified: 1, failed: 0 })
  })

  it('treats a model with at least one pass and one failure as partially usable', () => {
    const value = run('partial')
    value.models[1].modes[1] = { taskKind: 'image_edit', state: 'failed', attempts: 3, error: 'HTTP 400' }

    expect(adapterRunProgress(value)).toEqual({ completed: 2, total: 2, verified: 2, failed: 0 })
  })
})

describe('adapterProviderState', () => {
  it('keeps the current card language while deriving verification state from model metadata', () => {
    const state = adapterProviderState([
      { enabled: false, meta: { adapter: { state: 'testing' } } },
      { enabled: true, meta: { adapter: { state: 'verified' } } },
    ])

    expect(state).toEqual({ state: 'testing', enabled: 1, total: 2 })
  })

  it('returns partial when any staged model has only some working modes', () => {
    expect(adapterProviderState([
      { enabled: true, meta: { adapter: { state: 'verified' } } },
      { enabled: true, meta: { adapter: { state: 'partial' } } },
    ])).toEqual({ state: 'partial', enabled: 2, total: 2 })
  })
})

describe('isAdapterRunTerminal', () => {
  it('recognizes every terminal state', () => {
    expect(['completed', 'partial', 'failed', 'needs_ai', 'stale'].every(stage =>
      isAdapterRunTerminal(stage as DesktopProviderAdapterRun['stage']),
    )).toBe(true)
    expect(isAdapterRunTerminal('repairing')).toBe(false)
  })
})

describe('isAdapterModelLocked', () => {
  it('only locks while a verification run is still in flight', () => {
    expect(isAdapterModelLocked({ adapter: { state: 'testing' } })).toBe(true)
    expect(isAdapterModelLocked({ adapter: { state: 'partial' } })).toBe(false)
    expect(isAdapterModelLocked(undefined)).toBe(false)
  })

  // 「接不进来」的最后一道墙（2026-08-11 用户接 DeepSeek 踩到）：验证没过就锁住勾选框，
  // 用户改了地址也没法自己启用，只能删掉整个供应商重来——而失败若是我们探测的 bug，
  // 重来多少遍都一样。判死权不归探测。
  it('never locks a model just because verification failed', () => {
    expect(isAdapterModelLocked({ adapter: { state: 'failed' } })).toBe(false)
  })
})
