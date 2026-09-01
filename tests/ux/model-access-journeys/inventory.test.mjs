import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { scanProductionInventory } from './inventory.mjs'
import { MODEL_ACCESS_JOURNEYS } from './manifest.mjs'
import { IGNORED_DRAWER_COMPONENTS, JOURNEY_ENTRY_COMPONENTS } from './harnessContract.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const inventory = scanProductionInventory(repoRoot)

function covered(dimension) {
  return new Set(MODEL_ACCESS_JOURNEYS.flatMap((item) => item.covers[dimension] || []))
}

describe('model access production inventory', () => {
  it('is discovered from production sources rather than the journey manifest', () => {
    expect(inventory.billingKinds).toEqual(['audio', 'image', 'model3d', 'text', 'video'])
    expect(inventory.entryComponents.length).toBeGreaterThan(5)
    expect(inventory.providerPresets.length).toBeGreaterThan(10)
  })

  it('assigns every production enum and archetype wire shape to at least one journey', () => {
    // `outputs` is intentionally excluded: the manifest models a journey's
    // outputs as transport result shapes (url / async-asset / base64 / …), a
    // different (broader) contract than GenerationResultType media kinds, and it
    // is covered by the manifest test against MODEL_ACCESS_CAPABILITIES.
    for (const dimension of ['billingKinds', 'taskKinds', 'providers', 'auth', 'ingestion', 'slots', 'modeShapes']) {
      const missing = inventory[dimension].filter((value) => !covered(dimension).has(value))
      expect(missing, `${dimension} missing a real user journey`).toEqual([])
    }
  })

  it('owns or explicitly excludes every locally rendered model-drawer component', () => {
    const owned = new Set(Object.values(JOURNEY_ENTRY_COMPONENTS).flat())
    const unknown = inventory.entryComponents.filter((component) => !owned.has(component) && !IGNORED_DRAWER_COMPONENTS[component])
    expect(unknown, 'new drawer surface needs a journey or a scoped exclusion').toEqual([])
    for (const component of Object.keys(IGNORED_DRAWER_COMPONENTS)) expect(inventory.entryComponents).toContain(component)
  })

  it('covers each production provider-preset class without pretending every brand is a new protocol', () => {
    const classes = new Set(inventory.providerPresets.map((preset) => `${preset.group || 'ungrouped'}:${preset.providerKind}`))
    expect(classes).toEqual(new Set(['official:anthropic', 'official:openai-compatible', 'relay:openai-compatible']))
    for (const preset of inventory.providerPresets) expect(covered('providers')).toContain(preset.providerKind)
  })

  it('keeps every journey owner id a subset of the journey manifest', () => {
    const manifestIds = new Set(MODEL_ACCESS_JOURNEYS.map((journey) => journey.id))
    const unknown = Object.keys(JOURNEY_ENTRY_COMPONENTS).filter((id) => !manifestIds.has(id))
    expect(unknown, 'harness owns a journey id the manifest does not define').toEqual([])
  })
})
