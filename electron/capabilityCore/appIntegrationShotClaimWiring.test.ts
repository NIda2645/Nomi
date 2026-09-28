import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production shot claim wiring', () => {
  it('passes the shared beforeDispatch guard to every production submission and re-reads the durable Run', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'electron/capabilityCore/appIntegration.ts'), 'utf8')
    expect((source.match(/beforeDispatch:\s*assertProductionShotCanDispatch/g) ?? []).length).toBe(3)
    expect(source).toContain("generationService.repository.read(run.projectId, run.runId) ?? run")
    expect(source).toContain("code: 'production_shot_claimed'")
    expect(source).toContain("reason: decision.reason")
  })
})
