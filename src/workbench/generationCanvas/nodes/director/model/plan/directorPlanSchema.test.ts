import { describe, expect, it } from 'vitest'
import { collectStructuralFailures, collectVendorCompatibilityFailures, toPublishedJsonSchema } from '../../../../../../../electron/shared/agentCapabilities/modelVisibleJsonSchema'
import { directorPlanModelSchema } from './directorPlanSchema'

describe('director plan model projection', () => {
  it('is strict, described, and compatible with the shared model-schema rules', () => {
    const published = toPublishedJsonSchema(directorPlanModelSchema)
    const structural: string[] = []
    const vendor: string[] = []
    collectStructuralFailures(published, '', structural)
    collectVendorCompatibilityFailures(published, '', vendor)
    expect(structural).toEqual([])
    expect(vendor).toEqual([])
    expect(published.type).toBe('object')
    expect(published.additionalProperties).toBe(false)
    expect(published.anyOf).toBeUndefined()
    expect(published.const).toBeUndefined()
    const properties = published.properties as Record<string, { description?: string }>
    for (const field of ['version', 'scene', 'actors', 'blocking', 'shots'])
      expect(properties[field]?.description, field).toBeTruthy()
    const scene = properties.scene as unknown as { properties: Record<string, { description?: string }> }
    for (const field of ['tags', 'environment', 'template', 'dressing', 'setPieces'])
      expect(scene.properties[field]?.description, `scene.${field}`).toBeTruthy()
  })
})
