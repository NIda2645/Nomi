import { describe, expect, it } from 'vitest'
import { projectModelSettingsCatalog } from './modelSettingsCatalogProjection'

describe('model settings catalog projection', () => {
  it('marks a mode-only script as a custom call without inventing a fallback script', () => {
    const result = projectModelSettingsCatalog([{
      vendorKey: 'future-cloud',
      modelKey: 'future-video-v1',
      labelZh: 'Future Video',
      kind: 'video',
      customCall: { modes: { reference: { script: 'return input.images[0]' } } },
    }])

    expect(result.models[0]).toMatchObject({ hasCustomCall: true, enabled: true })
    expect(result.fallbackScripts.size).toBe(0)
  })

  it('keeps the legacy fallback script for editor hydration', () => {
    const result = projectModelSettingsCatalog([{
      vendorKey: 'future-cloud',
      modelKey: 'future-video-v1',
      kind: 'video',
      customCall: { script: 'return "ok"' },
      onboarding: { addedVia: 'manual' },
    }])

    expect(result.models[0]).toMatchObject({ hasCustomCall: true, canRetype: true })
    expect(result.fallbackScripts.get('future-cloud/future-video-v1')).toBe('return "ok"')
  })

  it('drops identity-less rows and normalizes incomplete display fields before they reach Settings', () => {
    const result = projectModelSettingsCatalog([
      null,
      { vendorKey: 'future-cloud', kind: 'video' },
      { vendorKey: ' future-cloud ', modelKey: ' future-model ', labelZh: {}, kind: null },
    ] as unknown as Array<Record<string, unknown>>)

    expect(result.models).toEqual([
      expect.objectContaining({
        vendorKey: 'future-cloud',
        modelKey: 'future-model',
        labelZh: 'future-model',
        kind: 'text',
      }),
    ])
  })

  it('sanitizes malformed kinds and adapter metadata before rendering a detail panel', () => {
    const result = projectModelSettingsCatalog([{
      vendorKey: ' future-cloud ',
      modelKey: ' future-model ',
      kind: { broken: true },
      meta: {
        adapter: {
          state: 'mystery-state',
          runId: { broken: true },
        },
      },
    }])

    expect(result.models).toEqual([
      expect.objectContaining({
        vendorKey: 'future-cloud',
        modelKey: 'future-model',
        kind: 'text',
        adapterState: undefined,
        adapterRunId: undefined,
      }),
    ])
  })

  it('exposes only known adapter states and stable run ids', () => {
    const result = projectModelSettingsCatalog([{
      vendorKey: 'future-cloud',
      modelKey: 'future-video-v1',
      kind: 'video',
      meta: {
        adapter: {
          state: 'testing',
          runId: ' adapter-run-1 ',
        },
      },
    }])

    expect(result.models[0]).toMatchObject({
      adapterState: 'testing',
      adapterRunId: 'adapter-run-1',
    })
  })

  it('deduplicates damaged catalog snapshots by stable model identity', () => {
    const result = projectModelSettingsCatalog([
      { vendorKey: 'future-cloud', modelKey: 'same-model', kind: 'video' },
      { vendorKey: ' future-cloud ', modelKey: ' same-model ', kind: 'image' },
    ])

    expect(result.models).toHaveLength(1)
    expect(result.models[0]).toMatchObject({ vendorKey: 'future-cloud', modelKey: 'same-model' })
  })
})
