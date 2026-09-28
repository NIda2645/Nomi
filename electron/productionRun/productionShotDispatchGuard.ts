import type { ProductionJob, ProductionRun } from './productionRunTypes'
import { decideShotClaim } from '../shared/decideShotClaim'

export type ProductionShotDispatchGuard = (input: { run: ProductionRun; job: ProductionJob }) => void

/** Shared production dispatch boundary: always decide against the newest durable Run. */
export function createProductionShotDispatchGuard(input: {
  readRun: (projectId: string, runId: string) => ProductionRun | undefined
}): ProductionShotDispatchGuard {
  return ({ run, job }) => {
    const durable = input.readRun(run.projectId, run.runId) ?? run
    const shotId = typeof job.metadata?.shotId === 'string' && job.metadata.shotId.trim()
      ? job.metadata.shotId.trim()
      : durable.generationPlan?.candidate?.candidateId
    const decision = decideShotClaim(durable, shotId, 'production')
    if (!decision.granted) {
      throw Object.assign(new Error(`production_shot_claimed: ${decision.reason}`), {
        code: 'production_shot_claimed',
        reason: decision.reason,
      })
    }
  }
}
