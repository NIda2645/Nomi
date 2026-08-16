import type { ProductionRunStatus, ProductionRunSummary } from '../../../electron/productionRun/productionRunTypes'
import type { ProductionRunTaskCenterProjection } from './taskCenterProjection'

type Labels = {
  title: string
  statuses: Record<ProductionRunStatus, string>
}

const TERMINAL = new Set<ProductionRunStatus>(['completed', 'cancelled'])

/** Keep the list projection and the opened full Run on the newest shared revision. */
export function mergeProductionRunSummaries(
  runs: readonly ProductionRunSummary[],
  detailed: ProductionRunSummary | null,
): ProductionRunSummary[] {
  if (!detailed) return [...runs]
  let found = false
  const merged = runs.map((run) => {
    if (run.projectId !== detailed.projectId || run.runId !== detailed.runId) return run
    found = true
    return detailed.revision >= run.revision ? detailed : run
  })
  return found ? merged : [detailed, ...merged]
}

export function buildProductionRunTaskRows(
  runs: readonly ProductionRunSummary[],
  labels: Labels,
): ProductionRunTaskCenterProjection[] {
  return runs.map((run) => {
    const terminal = TERMINAL.has(run.status)
    return {
      id: `production-run:${run.runId}`,
      kind: 'production_run',
      projectId: run.projectId,
      runId: run.runId,
      title: `${labels.title} · ${run.playbook.name}`,
      group: terminal ? 'done' : 'running',
      ...(run.status === 'completed'
        ? { outcome: 'success' as const }
        : run.status === 'cancelled'
          ? { outcome: 'cancelled' as const }
          : {}),
      recoverable: false,
      phaseText: labels.statuses[run.status],
      cancel: 'none',
      target: { kind: 'production_run', projectId: run.projectId, runId: run.runId },
      action: null,
    }
  })
}
