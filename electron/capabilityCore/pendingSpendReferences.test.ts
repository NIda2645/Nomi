import { describe, expect, it, vi } from 'vitest';
import { resolveSpendReferenceInputs, type SpendReferenceAssets, withSpendReferencePreviews } from './pendingSpendReferences';
import type { PendingSpendConfirm } from '../shared/contracts/pendingSpendConfirm';
const binding = { projectId: 'p', immutableProjectUuid: 'uuid', projectGeneration: 1 };
const old = { assetId: 'old', contentHash: 'hash-before', version: 2, kind: 'image' as const, role: 'character' as const };
function fixture() {
  const indexed = [{ id: 'old', data: { url: 'nomi-local://asset/p/old.png', contentType: 'image/png' } }];
  const assets: SpendReferenceAssets = { list: () => indexed, identity: () => ({ contentHash: 'real-hash', version: 1 }), import: vi.fn(async () => undefined) };
  return { assets, indexed, input: { projectId: 'p', binding, existing: [old], assets, assertCurrent() {} } };
}
describe('spend reference inputs are pinned at project asset owner', () => {
  it('projects preview URLs while preserving canonical reference fields', () => {
    const { assets } = fixture();
    const pending: PendingSpendConfirm = { projectId: 'p', runId: 'r', operationId: 'r', planVersion: 1, quoteId: 'q', candidateRevision: 1, currency: 'CNY', knownSubtotal: 0, unknownShotCount: 0, shots: [{ shotId: 's', index: 1, prompt: 'fixture', providerId: 'fixture', modelId: 'fixture', parameters: {}, price: { known: true, amount: 0 }, references: [old] }] };
    expect(withSpendReferencePreviews(pending, assets).shots[0].references).toEqual([{ ...old, url: 'nomi-local://asset/p/old.png' }]);
    expect(pending.shots[0].references).toEqual([old]);
  });
  it('preserves unchanged pinned references, including version, and supports explicit empty', async () => {
    const { input, assets } = fixture();
    expect(await resolveSpendReferenceInputs({ ...input, values: [{ reference: old }] })).toEqual([old]);
    expect(await resolveSpendReferenceInputs({ ...input, values: [] })).toEqual([]);
    expect(assets.import).not.toHaveBeenCalled();
  });
  it('pins new URL using host identity and rejects forged pinned or media claims', async () => {
    const { input } = fixture();
    expect(await resolveSpendReferenceInputs({ ...input, values: [{ url: 'nomi-local://asset/p/old.png', kind: 'image', role: 'character' }] })).toEqual([{ ...old, contentHash: 'real-hash', version: 1 }]);
    await expect(resolveSpendReferenceInputs({ ...input, values: [{ reference: { ...old, contentHash: 'forged' } }] })).rejects.toThrow('identity_changed');
    await expect(resolveSpendReferenceInputs({ ...input, values: [{ url: 'nomi-local://asset/p/old.png', kind: 'audio' }] })).rejects.toThrow('kind_mismatch');
  });
  it('revalidates original owner after import and never resolves into another owner', async () => {
    const { input, indexed, assets } = fixture();
    let current = true;
    const importingAssets = { ...assets, import: vi.fn(async () => { current = false; indexed.push({ id: 'new', data: { url: 'https://fixture.test/new.png', contentType: 'image/png' } }); return { id: 'new' } }) };
    await expect(resolveSpendReferenceInputs({ ...input, assets: importingAssets, values: [{ url: 'https://fixture.test/new.png', kind: 'image' }], assertCurrent: () => { if (!current) throw new Error('owner_changed') } })).rejects.toThrow('owner_changed');
  });
  it('requires imported assets to belong to indexed project owner; no bare path fallback', async () => {
    const { input, assets } = fixture();
    await expect(resolveSpendReferenceInputs({ ...input, values: [{ url: 'nomi-local://asset/other/a.png', kind: 'image' }] })).rejects.toThrow('unsupported');
    expect(assets.import).toHaveBeenCalledWith('p', 'nomi-local://asset/other/a.png', binding, input.assertCurrent);
  });
});
