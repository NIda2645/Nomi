import { describe, expect, it } from 'vitest'
import type { ProviderAdapterRun } from './types'
import { isLiveAdapterTerminalStage, liveAdapterSummary, liveHarnessEnabled } from './liveHarness'

describe('liveAdapterSummary', () => {
  it('only permits the quota-spending live harness in explicit E2E runs', () => {
    const configured = {
      NOMI_PROVIDER_ADAPTER_LIVE_CONFIG: '{"models":["x"]}',
      NOMI_PROVIDER_ADAPTER_LIVE_OUTPUT: '/tmp/result.json',
    }

    expect(liveHarnessEnabled(configured)).toBe(false)
    expect(liveHarnessEnabled({ ...configured, NOMI_E2E: '1' })).toBe(true)
  })

  it('writes only verification evidence and never includes credentials', () => {
    const run = {
      id: 'run-1',
      vendorKey: 'custom-provider',
      vendorName: 'Custom Provider',
      connectionFingerprint: 'secret-derived-fingerprint',
      selectedModelKeys: ['paint-v2'],
      stage: 'completed',
      repairAttempt: 0,
      models: [],
      sourceUrls: ['https://docs.example.com/api'],
      activeRevision: 'rev-1',
      createdAt: '2026-08-07T00:00:00.000Z',
      updatedAt: '2026-08-07T00:01:00.000Z',
    } satisfies ProviderAdapterRun

    const summary = liveAdapterSummary(run)

    expect(summary).toMatchObject({ vendorKey: 'custom-provider', stage: 'completed', activeRevision: 'rev-1' })
    expect(summary).not.toHaveProperty('connectionFingerprint')
  })

  it.each([
    'completed',
    'partial',
    'failed',
    'needs_ai',
    'cancelled',
    'timed_out',
    'stale',
  ] satisfies ProviderAdapterRun['stage'][])('stops polling when a run reaches %s', (stage) => {
    expect(isLiveAdapterTerminalStage(stage)).toBe(true)
  })

  it.each([
    'queued',
    'discovering_docs',
    'compiling',
    'testing',
    'repairing',
  ] satisfies ProviderAdapterRun['stage'][])('keeps polling while a run remains %s', (stage) => {
    expect(isLiveAdapterTerminalStage(stage)).toBe(false)
  })
})
