import type { ProductionJob, ProductionRun } from './productionRunTypes'
import { decideShotClaim } from '../shared/decideShotClaim'

export type ProductionShotDispatchGuard = (input: { run: ProductionRun; job: ProductionJob }) => void

/**
 * Shared production dispatch boundary: always decide against the newest durable Run.
 *
 * 提交 outbox 在第一笔耐久写（预留 / 提交意向）**之前**调它，所以它看到的这一镜还是 `authorized`：
 * 画布已接手、节点已删、Run 已急停，都在这里被拒，拒了就什么都没写。它若排在提交意向之后，
 * 看到的永远是 in_flight（制作自己占着），这道闸就形同虚设（2026-09-29 #921 真额度验收）。
 */
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
