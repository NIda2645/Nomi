import { describe, expect, it } from 'vitest'
import { DIRECTOR_ASSET_CATALOG, DIRECTOR_PLANNER_ASSETS } from './index'

describe('director A asset catalog', () => {
  it('keeps planner projection compact and one-to-one', () => {
    expect(DIRECTOR_ASSET_CATALOG.length).toBeGreaterThan(30)
    expect(new Set(DIRECTOR_ASSET_CATALOG.map((asset) => asset.id)).size).toBe(DIRECTOR_ASSET_CATALOG.length)
    expect(DIRECTOR_PLANNER_ASSETS).toHaveLength(DIRECTOR_ASSET_CATALOG.length)
    expect(DIRECTOR_PLANNER_ASSETS.every((asset) => !('file' in asset) && !('source' in asset))).toBe(true)
  })
})
