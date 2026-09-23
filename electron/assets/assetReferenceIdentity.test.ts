import { describe, expect, it, vi } from 'vitest';
import { findProjectAssetById } from './assetReferenceIdentity';
describe('project asset identity traverses existing cursor pages', () => {
  const first = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
  it('finds requested identity beyond item 500 without exposing other records', () => {
    const read = vi.fn((cursor: string | null) => cursor === null ? { items: first, cursor: '500' } : { items: [{ id: 'wanted' }], cursor: null });
    expect(findProjectAssetById('wanted', read)).toEqual({ id: 'wanted' });
    expect(read.mock.calls).toEqual([[null], ['500']]);
  });
  it('returns unavailable after all pages are exhausted', () => {
    expect(findProjectAssetById('missing', cursor => cursor === null ? { items: first, cursor: '500' } : { items: [], cursor: null })).toBeUndefined();
  });
  it('fails closed when malformed cursor repeats or cycles', () => {
    expect(() => findProjectAssetById('missing', () => ({ items: [], cursor: 'same' }))).toThrow('cursor_stalled');
    expect(() => findProjectAssetById('missing', cursor => ({ items: [], cursor: cursor === 'a' ? 'b' : 'a' }))).toThrow('cursor_stalled');
  });
});
