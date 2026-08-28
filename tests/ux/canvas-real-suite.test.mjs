import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CRITICAL_CANVAS_SCENARIOS,
  FULL_CANVAS_SCENARIOS,
  scenariosForProfile,
} from './canvas-real-suite.mjs'

describe('real canvas acceptance suite', () => {
  it('keeps every critical scenario in the full profile exactly once', () => {
    const criticalIds = CRITICAL_CANVAS_SCENARIOS.map((scenario) => scenario.id)
    const fullIds = FULL_CANVAS_SCENARIOS.map((scenario) => scenario.id)

    expect(new Set(criticalIds).size).toBe(criticalIds.length)
    expect(new Set(fullIds).size).toBe(fullIds.length)
    expect(fullIds.slice(0, criticalIds.length)).toEqual(criticalIds)
  })

  it('references executable repository test files', () => {
    for (const scenario of FULL_CANVAS_SCENARIOS) {
      expect(fs.existsSync(path.resolve(scenario.script)), scenario.script).toBe(true)
    }
  })

  it('fails closed for unknown profiles', () => {
    expect(() => scenariosForProfile('typo')).toThrow('unknown canvas suite profile')
  })
})
