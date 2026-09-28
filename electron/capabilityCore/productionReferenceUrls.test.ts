import { expect, it, vi } from 'vitest';
import { resolveProductionReferenceUrls } from './productionReferenceUrls';
import { spendReferenceKey } from '../shared/contracts/pendingSpendConfirm';
const reference = { assetId: 'asset', contentHash: 'hash', version: 1, kind: 'image' as const, role: 'first_frame' as const };
function fixture() {
  const assets = { list: () => [{ id: 'asset', data: {url:'nomi-local://asset/p/ref.png',contentType:'image/png'} }], identity: () => ({contentHash:'hash',version:1}), import: vi.fn() };
  return { assets, localize: vi.fn(async () => ['https://cdn.example/ref.png']) };
}
it('localizes pinned project assets through the existing transport before sealing', async () => {
  const deps = fixture();
  expect(await resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){}},deps)).toEqual({[spendReferenceKey(reference)]:'https://cdn.example/ref.png'});
  expect(deps.localize).toHaveBeenCalledWith('apimart',['nomi-local://asset/p/ref.png']);
});
it('rejects changed content before upload and after asynchronous upload', async () => {
  const deps = fixture();
  deps.assets.identity = () => ({contentHash:'changed',version:1});
  await expect(resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){}},deps)).rejects.toThrow('identity_changed');
  expect(deps.localize).not.toHaveBeenCalled();
  deps.assets.identity = () => ({contentHash:'hash',version:1});
  deps.localize.mockImplementation(async () => { deps.assets.identity = () => ({contentHash:'changed',version:1}); return ['https://cdn.example/ref.png']; });
  await expect(resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){}},deps)).rejects.toThrow('identity_changed');
});
it('rejects a retired project after upload', async () => {
  let current = true;
  const deps = fixture(); deps.localize.mockImplementation(async () => { current = false; return ['https://cdn.example/ref.png']; });
  await expect(resolveProductionReferenceUrls({projectId:'p',providerId:'apimart',references:[reference],assertCurrent(){if(!current)throw new Error('stale_project')}},deps)).rejects.toThrow('stale_project');
});
