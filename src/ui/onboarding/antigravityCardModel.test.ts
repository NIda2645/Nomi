import { describe, expect, it, vi } from 'vitest'
import type { AntigravityConnectionStatus } from '../../../electron/shared/antigravity'
import { antigravityDisplayCheckState, antigravityCatalogModelKey, persistAntigravityModelEnabled, groupAntigravityCatalogModels } from './antigravityCardModel'
import type { ChipModel } from './ModelChipGroups'

const status: AntigravityConnectionStatus = {
  state: 'unverified', checkedAt: 100, loginCommand: 'agy', version: '1.1.21',
  models: [{ id: 'upstream-exact-id', label: 'Upstream label' }, { id: 'second-id', label: 'Second' }],
  checks: [{ capability: 'text', modelId: 'upstream-exact-id', state: 'passed', version: '1.1.21', checkedAt: 90 }],
}

describe('Antigravity card catalog projection', () => {
  const chip = (modelKey: string, enabled = false): ChipModel => ({ vendorKey: 'antigravity-cli', modelKey, labelZh: modelKey, kind: 'text', enabled })
  it('groups only documented variants, keeping tools, routes and unknown IDs distinct', () => {
    const source = ['gemini-3.7-flash-high', 'gemini-3.7-flash-medium', 'gemini-3.7-flash-low', 'future-model-high', 'future-model-low', 'auto', 'generate_image'].map((id) => chip(id))
    const result = groupAntigravityCatalogModels(source)
    expect(result.map((group) => group.model.modelKey)).toEqual(['gemini-3.7-flash-medium', 'future-model-high', 'future-model-low', 'auto', 'generate_image'])
    expect(result[0].model.labelZh).toBe('Gemini 3.7 Flash')
    expect(result[0].variants.map((model) => model.modelKey)).toEqual(source.slice(0, 3).map((model) => model.modelKey))
    expect(source[1].labelZh).toBe('gemini-3.7-flash-medium')
  })
  it('preserves the selected raw ID and aggregates enabled state without enabling other tiers', () => {
    const source = [chip('gemini-3.7-flash-high', true), chip('gemini-3.7-flash-medium'), chip('gemini-3.7-flash-low')]
    const selected = { 'gemini-3.7-flash': 'gemini-3.7-flash-low' }
    const [group] = groupAntigravityCatalogModels(source, selected)
    expect(group.model).toMatchObject({ modelKey: 'gemini-3.7-flash-low', enabled: true })
    expect(group.variants.map((model) => model.enabled)).toEqual([true, false, false])
    expect(groupAntigravityCatalogModels(source)[0].model.modelKey).toBe('gemini-3.7-flash-high')
    expect(groupAntigravityCatalogModels(source.slice(2), { 'gemini-3.7-flash': 'removed' })[0].model.modelKey).toBe('gemini-3.7-flash-low')
  })
  it.each([false, true])('keeps an unknown raw ID matching a family key independent (reversed=%s)', (reversed) => {
    const unknown = chip('gemini-3.7-flash', true)
    const source = [chip('gemini-3.7-flash-medium'), chip('gemini-3.7-flash-high'), unknown]
    const result = groupAntigravityCatalogModels(reversed ? [...source].reverse() : source, {
      'gemini-3.7-flash': 'gemini-3.7-flash-high',
    })
    expect(result).toHaveLength(2)
    expect(result.find((group) => group.model.modelKey === unknown.modelKey)).toMatchObject({ model: unknown, variants: [unknown] })
    const family = result.find((group) => group.model.modelKey === 'gemini-3.7-flash-high')
    expect(family?.model).toMatchObject({ labelZh: 'Gemini 3.7 Flash', enabled: false })
    expect(family?.variants.map((model) => model.modelKey).sort()).toEqual(['gemini-3.7-flash-high', 'gemini-3.7-flash-medium'])
  })
  it('shows recorded timeouts and quota limits without inventing a passed capability', () => {
    expect(antigravityDisplayCheckState(undefined)).toBe('unverified')
    expect(antigravityDisplayCheckState({ ...status.checks![0], state: 'failed', code: 'ANTIGRAVITY_TIMEOUT' })).toBe('timeout')
    expect(antigravityDisplayCheckState({ ...status.checks![0], state: 'failed', code: 'ANTIGRAVITY_INIT_TIMEOUT' })).toBe('timeout')
    expect(antigravityDisplayCheckState({ ...status.checks![0], state: 'failed', code: 'ANTIGRAVITY_QUOTA' })).toBe('limited')
  })

  it('maps image/edit to the tool entry without changing the upstream model request', () => {
    expect(antigravityCatalogModelKey({ capability: 'image', modelId: 'auto' })).toBe('generate_image')
    expect(antigravityCatalogModelKey({ capability: 'edit', modelId: 'auto' })).toBe('generate_image')
    expect(antigravityCatalogModelKey({ capability: 'vision', modelId: 'upstream-exact-id' })).toBe('upstream-exact-id')
  })

  it('explicitly enables only the chosen catalog model and its connection; disabling never re-enables the vendor', () => {
    const catalog = { upsertModel: vi.fn(), upsertVendor: vi.fn() }
    const request = { capability: 'text' as const, modelId: 'second-id' }
    persistAntigravityModelEnabled(catalog, true, request)
    expect(catalog.upsertModel).toHaveBeenCalledWith({ vendorKey: 'antigravity-cli', modelKey: 'second-id', enabled: true })
    expect(catalog.upsertVendor).toHaveBeenCalledWith({ key: 'antigravity-cli', enabled: true })
    catalog.upsertVendor.mockClear()
    persistAntigravityModelEnabled(catalog, false, request)
    expect(catalog.upsertVendor).not.toHaveBeenCalled()
    expect(catalog.upsertModel).toHaveBeenLastCalledWith({ vendorKey: 'antigravity-cli', modelKey: 'second-id', enabled: false })
  })
})
