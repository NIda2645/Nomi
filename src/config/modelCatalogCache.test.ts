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

const row = (modelKey: string, publishedModes: string[] = ['text_to_image'], meta?: unknown) => ({
  modelKey,
  vendorKey: 'relay',
  labelZh: modelKey,
  kind: 'image' as const,
  enabled: true,
  published: publishedModes.length > 0,
  publishedModes,
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
      row('staged', [], { adapter: { state: 'unverified', modes: [], updatedAt: 't' } }),
      row('failed-new', [], { adapter: { state: 'failed', modes: [], updatedAt: 't' } }),
      row('active-repair', ['text_to_image'], { adapter: { state: 'failed', activeRevision: 'revision-good', modes: [], updatedAt: 't' } }),
      {
        ...row('scripted-repair', ['text_to_image'], { adapter: { state: 'failed', modes: [], updatedAt: 't' } }),
      },
    ])

    const options = await preloadModelOptions('image')

    expect(options.map((option) => option.value)).toEqual(expect.arrayContaining(['legacy', 'active-repair', 'scripted-repair']))
    expect(options.map((option) => option.value)).not.toEqual(expect.arrayContaining(['staged', 'failed-new']))
    expect(options).toHaveLength(3)
  })

  it('filters partial publication by the picker task mode, including image and video cross-modes', async () => {
    mocks.listModels.mockImplementation(async ({ kind }: { kind: string }) => kind === 'image'
      ? [
          row('t2i-only', ['text_to_image']),
          row('edit-only', ['image_edit']),
        ]
      : [
          { ...row('t2v-only', ['text_to_video']), kind: 'video' },
          { ...row('i2v-only', ['image_to_video']), kind: 'video' },
        ])

    await expect(preloadModelOptions('image')).resolves.toMatchObject([{ value: 't2i-only' }])
    await expect(preloadModelOptions('imageEdit')).resolves.toMatchObject([{ value: 'edit-only' }])
    await expect(preloadModelOptions('video', 'text_to_video')).resolves.toMatchObject([{ value: 't2v-only' }])
    await expect(preloadModelOptions('video', 'image_to_video')).resolves.toMatchObject([{ value: 'i2v-only' }])
  })
})
