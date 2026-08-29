import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CRITICAL_CANVAS_SCENARIOS,
  DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS,
  FULL_CANVAS_SCENARIOS,
  PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS,
  runCanvasScenario,
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

  it('keeps the full performance matrix bounded without using the short journey budget', () => {
    const performance = FULL_CANVAS_SCENARIOS.find((scenario) => scenario.id === 'medium-canvas-performance')
    expect(performance?.timeoutMs).toBe(PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS)
    expect(PERFORMANCE_CANVAS_SCENARIO_TIMEOUT_MS).toBeGreaterThan(DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS)
  })

  it('terminates and reports a canvas scenario that exceeds its hard timeout', () => {
    let launch
    const result = runCanvasScenario(
      { id: 'stuck', script: 'tests/ux/stuck.walk.mjs' },
      {
        cwd: '/tmp/nomi-suite',
        env: { NOMI_E2E: '1' },
        spawnProcess: (executable, args, options) => {
          launch = { executable, args, options }
          return {
            status: null,
            signal: 'SIGKILL',
            error: Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' }),
          }
        },
      },
    )

    expect(launch).toMatchObject({
      executable: process.execPath,
      args: ['tests/ux/stuck.walk.mjs'],
      options: {
        timeout: DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      },
    })
    expect(result).toMatchObject({
      exitCode: 1,
      signal: 'SIGKILL',
      timedOut: true,
      timeoutMs: DEFAULT_CANVAS_SCENARIO_TIMEOUT_MS,
    })
  })
})
