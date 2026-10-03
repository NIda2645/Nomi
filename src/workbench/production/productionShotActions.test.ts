import { notifications, notificationsStore } from '@mantine/notifications'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import type { ProductionShotActionFailure } from './productionRunApi'
import { resumeProductionBatch, reworkProductionShot, SHOT_ACTION_FAILURE_COPY } from './productionShotActions'

const api = vi.hoisted(() => ({ rework: vi.fn(), resumeBatch: vi.fn() }))
vi.mock('./productionRunApi', () => ({ productionRunApi: api }))
const rendererLog = vi.hoisted(() => ({ logRendererError: vi.fn() }))
vi.mock('../../desktop/rendererLog', () => rendererLog)

/** 主进程英文原话的样子：它们只许进日志，不许上屏。 */
const RAW_MAIN_TEXT = /run status|not resumable|Generation (?:rework|authorization)|previously authorized|Provider unavailable|Connection lost|revision conflict/i
/** 被删掉的那句笼统话（和它的英文）：任何一种失败都不许再落回它。 */
const OLD_GENERIC = /操作没成功|稍后再试|didn't go through; the reason is in the log|try again later/i

const FAILURES = Object.keys(SHOT_ACTION_FAILURE_COPY) as ProductionShotActionFailure[]

describe('production action feedback ownership', () => {
  beforeEach(() => { vi.clearAllMocks(); notifications.clean() })
  it.each(['reworked', 'rework_declined'] as const)('clears old feedback without echoing %s', async (code) => {
    api.rework.mockResolvedValue({ ok: code === 'reworked', code })
    const present = vi.fn()
    await reworkProductionShot('project', 'run', 'shot', present)
    expect(api.rework).toHaveBeenCalledWith('project', 'run', 'shot')
    expect(present.mock.calls).toEqual([['']])
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
  it.each(['resumed'] as const)('keeps resume %s silent and never tells the main process why the run stopped', async (code) => {
    api.resumeBatch.mockResolvedValue({ ok: code === 'resumed', code })
    const present = vi.fn()
    await resumeProductionBatch('project', 'run', present)
    // 这一下点击续哪几镜的同意、怎么接着拍由主进程定：渲染层只说「继续」。
    expect(api.resumeBatch).toHaveBeenCalledWith('project', 'run')
    expect(present.mock.calls).toEqual([['']])
  })
  it('says the structured failure in plain words at the requesting shot, and clears on a successful retry', async () => {
    api.rework
      .mockResolvedValueOnce({ ok: false, code: 'failed', failure: 'previous_attempt_unsettled' })
      .mockResolvedValueOnce({ ok: true, code: 'reworked' })
    const present = vi.fn()
    await reworkProductionShot('project', 'run', 'shot', present)
    const shown = present.mock.calls.at(-1)?.[0] as string
    expect(shown).toBe(i18n.t('generationCommon.production.canvasLanding.actionFailure.previousAttemptUnsettled'))
    expect(shown).not.toMatch(RAW_MAIN_TEXT)
    await reworkProductionShot('project', 'run', 'shot', present)
    expect(present.mock.calls.at(-1)).toEqual([''])
    expect(notificationsStore.getState().notifications).toHaveLength(0)
  })
  it('a window that cannot reach the main process says exactly that (bridge_unavailable), and the error is logged', async () => {
    const error = new Error('Connection lost')
    api.resumeBatch.mockRejectedValue(error)
    const present = vi.fn()
    const result = await resumeProductionBatch('project', 'run', present)
    expect(result).toEqual({ ok: false, code: 'failed', failure: 'bridge_unavailable' })
    expect(rendererLog.logRendererError).toHaveBeenCalledWith('production-resume-bridge-unavailable', error)
    const shown = present.mock.calls.at(-1)?.[0] as string
    expect(shown).toBe(i18n.t('generationCommon.production.canvasLanding.actionFailure.bridgeUnavailable'))
    expect(shown).not.toMatch(RAW_MAIN_TEXT)
  })
  it.each(['zh-CN', 'en'])('every failure has its own real sentence in %s — no raw keys, no main-process text, no catch-all line', (lng) => {
    // 测试工程不收 i18next 的键类型增强：这里只按字符串取句子。
    const t = i18n.getFixedT(lng) as unknown as (key: string) => string
    const sentences = FAILURES.map((failure) => t(SHOT_ACTION_FAILURE_COPY[failure]))
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/^generationCommon\./)
      expect(sentence).not.toMatch(RAW_MAIN_TEXT)
      expect(sentence).not.toMatch(OLD_GENERIC)
      if (lng === 'en') expect(sentence).not.toMatch(/[㐀-鿿]/)
    }
    expect(new Set(sentences).size, 'each failure says something different').toBe(sentences.length)
  })
})
