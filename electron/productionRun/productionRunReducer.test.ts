import { describe, expect, it } from 'vitest'

import { applyProductionCommand } from './productionRunReducer'
import type { ProductionRun } from './productionRunTypes'

const now = '2026-08-21T00:00:00.000Z'

function runWithCandidateScript(): ProductionRun {
  return {
    schemaVersion: 1, runId: 'run-review', projectId: 'project-review', revision: 1,
    status: 'awaiting_script_review', stageId: 'script', playbook: { name: 'brand.promo', version: '1.0.0' },
    origin: { host: 'codex' }, brief: { goal: 'review fixture' },
    policy: { mode: 'balanced', trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 1, minimizeUploads: true },
    budget: { currency: 'CNY', authorized: 0, reserved: 0, actual: 0, unsettled: 0 }, planVersion: 1, snapshotCursor: 1,
    stages: ['brief', 'direction', 'script', 'storyboard'].map((stageId, order) => ({ stageId, title: stageId, status: 'completed' as const, order })),
    gates: [], jobs: [], artifacts: [{
      artifactId: 'artifact-script-v1', stageId: 'script', kind: 'script', status: 'candidate', version: 1,
      source: 'nomi-agent', contentHash: 'hash-v1', reviewStatus: 'waiting', createdAt: now,
    }], createdAt: now, updatedAt: now,
  }
}

describe('production run script review reducer', () => {
  it('adopts a script only after an approved review', () => {
    const effect = applyProductionCommand(runWithCandidateScript(), {
      commandId: 'script-review-approved', expectedRevision: 1, type: 'script.review',
      payload: { artifactId: 'artifact-script-v1', decision: 'approved' }, issuedAt: now,
    }, now)

    expect(effect.run.artifacts[0]).toMatchObject({ status: 'adopted', reviewStatus: 'approved', adoptedAt: now })
    expect(effect.run.stageId).toBe('storyboard')
    expect(effect.run.status).toBe('running')
  })

  it('keeps request-changes in review without creating paid jobs', () => {
    const effect = applyProductionCommand(runWithCandidateScript(), {
      commandId: 'script-review-changes', expectedRevision: 1, type: 'script.review',
      payload: { artifactId: 'artifact-script-v1', decision: 'changes_requested' }, issuedAt: now,
    }, now)

    expect(effect.run.artifacts[0]).toMatchObject({ status: 'candidate', reviewStatus: 'changes_requested' })
    expect(effect.run.jobs).toHaveLength(0)
    expect(effect.run.budget.actual).toBe(0)
  })
})
