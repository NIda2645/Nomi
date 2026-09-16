import { describe, expect, it } from 'vitest'
import { AssetImportError, unwrapAssetImportResult, type AssetImportResult } from './assetImportResult'

describe('asset import wire envelope', () => {
  it.each([undefined, {}, { ok: true }, { ok: true, asset: undefined }, { ok: false },
    { ok: false, failure: null }, { ok: false, failure: { code: 'invented', reason: 'invented' } },
    { ok: false, failure: { code: 'project_binding_stale', reason: '/private/path' } },
  ])('rejects malformed results with a safe typed failure: %j', (wire) => {
    expect(() => unwrapAssetImportResult(wire as AssetImportResult<unknown>)).toThrow(AssetImportError)
    expect(() => unwrapAssetImportResult(wire as AssetImportResult<unknown>)).toThrow('import-failed')
  })

  it('preserves explicit native cancellation and successful asset data', () => {
    expect(unwrapAssetImportResult({ ok: true, asset: null })).toBeNull()
    const asset = { id: 'asset-a', projectId: 'a' }
    expect(unwrapAssetImportResult({ ok: true, asset })).toBe(asset)
  })

  it('preserves only recognized failure codes and reasons', () => {
    try { unwrapAssetImportResult({ ok: false, failure: { code: 'capability_execution_failed', reason: 'no-disk-space' } }) }
    catch (error) { expect(error).toMatchObject({ code: 'capability_execution_failed', reason: 'no-disk-space' }); return }
    throw new Error('must reject')
  })
})
