import { describe, expect, it } from 'vitest'
import { resolveCatalogKind } from './modelCatalogStatus'

describe('resolveCatalogKind', () => {
  it('maps each node kind to its own catalog bucket (never silently to text)', () => {
    expect(resolveCatalogKind('image')).toBe('image')
    expect(resolveCatalogKind('imageEdit')).toBe('image')
    expect(resolveCatalogKind('video')).toBe('video')
    expect(resolveCatalogKind('audio')).toBe('audio')
    // Regression: a 3D node must fetch from the 'model3d' catalog bucket. Falling
    // back to 'text' left the 3D composer's model selector permanently empty
    // (options filtered against text models by text_to_3d mode → nothing), so the
    // 3D generation path was stuck with no way to pick an already-onboarded model.
    expect(resolveCatalogKind('model3d')).toBe('model3d')
  })

  it('defaults unknown/text kinds to the text bucket', () => {
    expect(resolveCatalogKind('text')).toBe('text')
    expect(resolveCatalogKind(undefined)).toBe('text')
  })
})
