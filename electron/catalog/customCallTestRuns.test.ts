import { describe, expect, it, vi } from 'vitest'
import { createCustomCallTestRunRegistry } from './customCallTestRuns'

const BASE_INPUT = {
  runId: 'run-1',
  vendorKey: 'vendor-a',
  modelKey: 'model-a',
  modeId: 'references',
  script: 'return { url: "https://assets.test/result.png" }',
}

describe('custom call test run registry', () => {
  it('publishes a running snapshot immediately and keeps the final result reopenable', async () => {
    let finish: ((value: { ok: true; assets: string[]; transcript: []; durationMs: number }) => void) | undefined
    const execute = vi.fn(() => new Promise<{ ok: true; assets: string[]; transcript: []; durationMs: number }>((resolve) => {
      finish = resolve
    }))
    const registry = createCustomCallTestRunRegistry({ execute })

    const started = registry.start(BASE_INPUT)
    expect(started.state).toBe('running')
    expect(registry.latest({ vendorKey: 'vendor-a', modelKey: 'model-a', modeId: 'references' })?.id).toBe('run-1')
    expect(registry.matchesScript(started, BASE_INPUT.script)).toBe(true)
    expect(registry.matchesScript(started, 'return null')).toBe(false)

    await Promise.resolve()
    finish?.({ ok: true, assets: ['https://assets.test/result.png'], transcript: [], durationMs: 42 })
    const completed = await registry.wait('run-1')
    expect(completed?.state).toBe('succeeded')
    expect(completed?.result?.assets).toEqual(['https://assets.test/result.png'])
    expect(registry.get('run-1')).toEqual(completed)
  })

  it('cancels the actual AbortSignal and reaches a terminal cancelled state', async () => {
    const execute = vi.fn(async (_input, signal: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      return { ok: true as const, assets: [], transcript: [], durationMs: 0 }
    })
    const registry = createCustomCallTestRunRegistry({ execute })
    registry.start(BASE_INPUT)

    await Promise.resolve()
    const cancelling = registry.cancel('run-1')
    expect(cancelling?.state).toBe('cancelling')
    const cancelled = await registry.wait('run-1')
    expect(cancelled?.state).toBe('cancelled')
    expect(execute.mock.calls[0]?.[1].aborted).toBe(true)
  })

  it('records a failed trial without losing its transcript', async () => {
    const registry = createCustomCallTestRunRegistry({
      execute: async () => ({
        ok: false,
        assets: [],
        errorMessage: '401 invalid key',
        transcript: [{ method: 'POST', url: 'https://api.test/generate', status: 'error', durationMs: 8 }],
        durationMs: 8,
      }),
    })
    registry.start(BASE_INPUT)

    const failed = await registry.wait('run-1')
    expect(failed?.state).toBe('failed')
    expect(failed?.result?.errorMessage).toBe('401 invalid key')
    expect(failed?.result?.transcript).toHaveLength(1)
  })

  it('does not let an older run replace the latest run for the same mode', async () => {
    const pending = new Map<string, (value: { ok: true; assets: string[]; transcript: []; durationMs: number }) => void>()
    const registry = createCustomCallTestRunRegistry({
      execute: (input) => new Promise((resolve) => pending.set(input.runId, resolve)),
    })
    registry.start(BASE_INPUT)
    registry.start({ ...BASE_INPUT, runId: 'run-2', script: 'return { url: "new" }' })

    await Promise.resolve()
    pending.get('run-1')?.({ ok: true, assets: ['old'], transcript: [], durationMs: 1 })
    await registry.wait('run-1')
    expect(registry.latest({ vendorKey: 'vendor-a', modelKey: 'model-a', modeId: 'references' })?.id).toBe('run-2')
  })
})
