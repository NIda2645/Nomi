import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listModels: vi.fn(),
  listVendors: vi.fn(),
}))

vi.mock('../workbench/api/modelCatalogApi', () => ({
  getWorkbenchModelCatalogHealth: vi.fn(),
  listWorkbenchModelCatalogModels: mocks.listModels,
  listWorkbenchModelCatalogVendors: mocks.listVendors,
}))

import { notifyModelOptionsRefresh, preloadModelOptions } from './modelCatalogCache'

const row = (modelKey: string, meta?: unknown) => ({
  modelKey,
  vendorKey: 'relay',
  labelZh: modelKey,
  kind: 'image' as const,
  enabled: true,
  ...(meta ? { meta } : {}),
  createdAt: 't',
  updatedAt: 't',
})

describe('normal picker verified-only projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notifyModelOptionsRefresh()
    mocks.listVendors.mockResolvedValue([{ key: 'relay', name: 'Relay', enabled: true, authType: 'none' }])
  })

  it('hides staged rows while preserving legacy and active-revision models', async () => {
    mocks.listModels.mockResolvedValue([
      row('legacy'),
      row('staged', { adapter: { state: 'unverified', modes: [], updatedAt: 't' } }),
      row('failed-new', { adapter: { state: 'failed', modes: [], updatedAt: 't' } }),
      row('active-repair', { adapter: { state: 'failed', activeRevision: 'revision-good', modes: [], updatedAt: 't' } }),
      {
        ...row('scripted-repair', { adapter: { state: 'failed', modes: [], updatedAt: 't' } }),
        customCall: { script: "return { text: 'ok' }", updatedAt: 't' },
      },
    ])

    const options = await preloadModelOptions('image')

    expect(options.map((option) => option.value)).toEqual(expect.arrayContaining(['legacy', 'active-repair', 'scripted-repair']))
    expect(options.map((option) => option.value)).not.toEqual(expect.arrayContaining(['staged', 'failed-new']))
    expect(options).toHaveLength(3)
  })
})
