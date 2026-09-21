import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogState, Model } from './types'

const memory = vi.hoisted(() => ({ catalog: null as CatalogState | null, writes: 0 }))
vi.mock('electron', () => ({ app: { getPath: () => process.cwd(), getAppPath: () => process.cwd() }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('../runtimePaths', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), getSettingsRoot: () => '/synthetic-catalog', readJson: () => structuredClone(memory.catalog) }))
vi.mock('../jsonFile', () => ({ writeJsonFileAtomic: (_path: string, value: CatalogState) => { memory.catalog = structuredClone(value); memory.writes += 1 } }))
import { deleteModelCatalogModels, ensureBuiltinModelSeeds, mutateCatalog, readCatalog, upsertModelCatalogModel } from './catalogStore'
import { CURRENT_CATALOG_VERSION } from './types'
import { modelListReconciliation } from './modelListReconcile'

beforeEach(() => {
  const model: Model = { vendorKey: 'apimart', modelKey: 'deepseek-v4-flash', labelZh: 'My label', kind: 'text', enabled: true,
    meta: { catalogLifecycle: 'value' }, createdAt: 'a', updatedAt: 'a', customCall: { script: 'return 1', updatedAt: 'a' },
    tokenPricing: { inputPerMTokUsd: 1, outputPerMTokUsd: 2, source: { url: 'https://example.test', checkedAt: '2026-09-08' } } }
  memory.catalog = { version: CURRENT_CATALOG_VERSION, vendors: [{ key: 'apimart', name: 'APIMart', authType: 'bearer', enabled: true, createdAt: 'a', updatedAt: 'a' }], models: [model], mappings: [], apiKeysByVendor: {} }
  memory.writes = 0
})
describe('catalog persistence liveness owner', () => {
  it('writes the listing note atomically, retains user configuration, and never flips the enable decision', () => {
    const original = readCatalog().models[0]
    const apply = (ids: string[]): void => { mutateCatalog((tx, state) => {
      modelListReconciliation(state.models, 'apimart', { ok: true, models: ids, statuses: [200] }).forEach(tx.upsertModel)
    }) }
    // 「有清单但不含这一条」才是证据；空清单不是（2026-09-21）。
    apply(['some-other-model'])
    expect(memory.writes).toBe(1)
    expect(readCatalog().models[0]).toMatchObject({ enabled: true, unlisted: true, labelZh: 'My label', tokenPricing: original.tokenPricing, customCall: original.customCall })
    apply(['deepseek-v4-flash'])
    expect(readCatalog().models[0]).toMatchObject({ enabled: true, unlisted: false })
    upsertModelCatalogModel({ vendorKey: 'apimart', modelKey: 'deepseek-v4-flash', enabled: false })
    expect(readCatalog().models[0]).toMatchObject({ enabled: false, unlisted: false, tokenPricing: original.tokenPricing })
  })
  it('rolls back both state fields if the transaction fails', () => {
    expect(() => mutateCatalog((tx) => { tx.upsertModel({ vendorKey: 'apimart', modelKey: 'deepseek-v4-flash', unlisted: true, enabled: false }); throw new Error('rollback') })).toThrow('rollback')
    expect(memory.writes).toBe(0)
    expect(readCatalog().models[0]).toMatchObject({ enabled: true })
    expect(readCatalog().models[0].unlisted).toBeUndefined()
  })
  it('one-click deletion persists through refresh and subsequent startup seeding', () => {
    deleteModelCatalogModels([{ vendorKey: 'apimart', modelKey: 'deepseek-v4-flash' }])
    ensureBuiltinModelSeeds()
    ensureBuiltinModelSeeds()
    expect(readCatalog().models.some((model) => model.vendorKey === 'apimart' && model.modelKey === 'deepseek-v4-flash')).toBe(false)
  })
})
