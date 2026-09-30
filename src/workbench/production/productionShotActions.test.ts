import { notifications, notificationsStore } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resumeProductionBatch, reworkProductionShot } from './productionShotActions'

const api = vi.hoisted(() => ({ rework: vi.fn(), resumeBatch: vi.fn() }))
vi.mock('./productionRunApi', () => ({ productionRunApi: api }))

describe('production action feedback ownership', () => {
  beforeEach(() => { vi.clearAllMocks(); notifications.clean() })
  it.each(['reworked', 'rework_declined'])('clears old feedback without echoing %s', async (code) => {
    api.rework.mockResolvedValue({ ok: code === 'reworked', code })
    const present = vi.fn()
    await reworkProductionShot('project', 'run', 'shot', present)
    expect(api.rework).toHaveBeenCalledWith('project', 'run', 'shot')
    expect(present.mock.calls).toEqual([['']])
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
  it.each(['resumed', 'resume_declined'])('keeps resume %s silent', async (code) => {
    api.resumeBatch.mockResolvedValue({ ok: code === 'resumed', code })
    const present = vi.fn()
    await resumeProductionBatch('project', 'run', 'budget', present)
    expect(api.resumeBatch).toHaveBeenCalledWith('project', 'run', 'budget')
    expect(present.mock.calls).toEqual([['']])
  })
  it('keeps failure reasons at the requesting shot and clears on successful retry', async () => {
    api.rework.mockResolvedValueOnce({ ok: false, code: 'failed', message: 'Provider unavailable' }).mockResolvedValueOnce({ ok: true, code: 'reworked' })
    const present = vi.fn()
    await reworkProductionShot('project', 'run', 'shot', present)
    expect(present.mock.calls.at(-1)?.[0]).toContain('Provider unavailable')
    await reworkProductionShot('project', 'run', 'shot', present)
    expect(present.mock.calls.at(-1)).toEqual([''])
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
  it('shows thrown resume failure and a next step in the same host', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.resumeBatch.mockRejectedValue(new Error('Connection lost'))
    const present = vi.fn()
    const result = await resumeProductionBatch('project', 'run', 'manual', present)
    expect(result.ok).toBe(false)
    expect(present.mock.calls.at(-1)?.[0]).toContain('Connection lost')
    expect(present.mock.calls.at(-1)?.[0]).toContain('再试')
    expect(notificationsStore.getState().notifications).toHaveLength(0)
    log.mockRestore()
  })
})
