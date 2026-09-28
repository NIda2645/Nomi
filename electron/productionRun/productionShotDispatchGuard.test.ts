import { describe, expect, it, vi } from 'vitest'
import { createProductionShotDispatchGuard } from './productionShotDispatchGuard'
import type { ProductionRun } from './productionRunTypes'

const baseRun = (overrides: Partial<ProductionRun> = {}): ProductionRun => ({
  schemaVersion: 1, runId: 'run-1', projectId: 'project-1', revision: 1, status: 'running', stageId: 'generate',
  playbook: { name: 'generation.single-shot', version: '1.0.0' }, origin: { host: 'semantic-mcp' },
  policy: { trustedHosts: [], allowedProviders: [], allowedModels: [], maxSpend: null, maxAttemptsPerJob: 1, minimizeUploads: true },
  budget: { currency: 'CNY', authorized: 0, reserved: 0, actual: 0, unsettled: 0, unknownInFlight: 0 },
  planVersion: 1, snapshotCursor: 0, stages: [], gates: [], jobs: [], artifacts: [],
  generationPlan: { operationId: 'run-1', state: 'submitted', candidate: { candidateId: 'candidate-1', revision: 1, moduleId: 'm', providerId: 'p', modelId: 'm', mode: 't2v', prompt: '', parameters: {}, references: [] }, updatedAt: '2026-09-28T00:00:00.000Z' },
  createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z', ...overrides,
})

const job = (metadata?: Record<string, unknown>) => ({
  jobId: 'job-1', stageId: 'generate' as const, status: 'authorized' as const, attempt: 1,
  provider: 'p', model: 'm', idempotencyKey: 'k', createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z', ...(metadata ? { metadata } : {}),
})

describe('createProductionShotDispatchGuard', () => {
  it('uses the newest durable Run instead of the stale callback snapshot', () => {
    const stale = baseRun()
    const durable = baseRun({ generationPlan: { ...stale.generationPlan!, claim: { by: 'canvas', attempt: 1, claimedAt: '2026-09-28T00:00:00.000Z' } } })
    const readRun = vi.fn(() => durable)
    const guard = createProductionShotDispatchGuard({ readRun })
    expect(() => guard({ run: stale, job: job() })).toThrow(/production_shot_claimed: canvas_claimed/)
    expect(readRun).toHaveBeenCalledWith('project-1', 'run-1')
  })

  it('falls back to the callback Run when the durable read is unavailable', () => {
    const run = baseRun({ status: 'paused' })
    const guard = createProductionShotDispatchGuard({ readRun: () => undefined })
    expect(() => guard({ run, job: job() })).toThrow(/production_shot_claimed: run_stopped/)
  })

  it('uses candidateId for a single-shot job without shot metadata', () => {
    const guard = createProductionShotDispatchGuard({ readRun: () => undefined })
    expect(() => guard({ run: baseRun(), job: job() })).not.toThrow()
  })
})
