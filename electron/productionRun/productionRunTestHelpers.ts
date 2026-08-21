import type { createProductionRunService } from './productionRunService'

type ProductionService = ReturnType<typeof createProductionRunService>

export async function waitForProduction(
  check: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  if (!check()) throw new Error('waitFor timed out')
}

/** Move legacy production fixtures through the same script review gate as the
 * real Agent path. Tests that care about later gates should not bypass it. */
export async function approveLatestScript(
  service: ProductionService,
  projectId: string,
  runId: string,
): Promise<void> {
  await waitForProduction(() => service.readFull(projectId, runId).artifacts.some((artifact) => artifact.kind === 'script'))
  const run = service.readFull(projectId, runId)
  const script = [...run.artifacts].reverse().find((artifact) => artifact.kind === 'script' && artifact.status === 'candidate')
  if (!script) throw new Error('script candidate missing in test fixture')
  await service.command(projectId, runId, {
    commandId: `approve-script-${runId}`,
    expectedRevision: run.revision,
    type: 'script.review',
    payload: { artifactId: script.artifactId, decision: 'approved' },
    issuedAt: new Date().toISOString(),
  })
  await waitForProduction(() => service.readFull(projectId, runId).artifacts.some((artifact) => artifact.kind === 'storyboard'))
}

export async function approveLatestStoryboard(
  service: ProductionService,
  projectId: string,
  runId: string,
): Promise<void> {
  await waitForProduction(() => service.readFull(projectId, runId).artifacts.some((artifact) => artifact.kind === 'storyboard'))
  const run = service.readFull(projectId, runId)
  const storyboard = [...run.artifacts].reverse().find((artifact) => artifact.kind === 'storyboard' && artifact.status === 'candidate')
  if (!storyboard) throw new Error('storyboard candidate missing in test fixture')
  await service.command(projectId, runId, {
    commandId: `approve-storyboard-${runId}`,
    expectedRevision: run.revision,
    type: 'artifact.review',
    payload: { artifactId: storyboard.artifactId, decision: 'approved' },
    issuedAt: new Date().toISOString(),
  })
}
