import { isProjectExecutionContextCurrent, withProjectAction, type ProjectExecutionContext } from '../../project/projectCanvasReadSurface'
import { alertDialog } from '../../../design'
import { productionRunApi } from '../../production/productionRunApi'
import { executeProductionRunCommand } from '../../production/productionRunCommands'
import { friendlyError } from '../resident/residentShellDisplay'
import type { TaskCandidate, V4FlowItem } from '../v4/agentPanelV4Types'

const inFlight = new Set<string>()
type CandidateIdentity = Required<Pick<TaskCandidate, 'projectId' | 'productionRunId' | 'artifactId'>>
type AdoptionDeps = {
  read: typeof productionRunApi.read
  command: typeof productionRunApi.command
  /** 点「采用」那一刻签发的已打开项目。 */
  project: ProjectExecutionContext
}

/** Explicit user adoption uses the existing domain command; this never grants review approval. */
export async function executeLaneTaskCandidateAdoption(candidate: TaskCandidate, deps: AdoptionDeps): Promise<void> {
  if (!candidate.canAdopt || candidate.adopted || !candidate.thumbnailUrl
    || !candidate.projectId || !candidate.productionRunId || !candidate.artifactId) return
  const { projectId, productionRunId, artifactId } = candidate as CandidateIdentity
  if (deps.project.binding.projectId !== projectId || !isProjectExecutionContextCurrent(deps.project)) return
  const key = JSON.stringify([projectId, productionRunId, artifactId])
  if (inFlight.has(key)) return
  inFlight.add(key)
  try {
    const run = await deps.read(projectId, productionRunId)
    if (!isProjectExecutionContextCurrent(deps.project)) return
    if (!run || run.projectId !== projectId || run.runId !== productionRunId) throw new Error('project_binding_stale')
    const artifact = run.artifacts.find(item => item.artifactId === artifactId)
    if (artifact?.status === 'adopted') return
    // Revision recovery, IPC sender/project checks and canAdoptArtifact remain the existing owners.
    await executeProductionRunCommand(projectId, productionRunId, {
      commandId: globalThis.crypto.randomUUID(), expectedRevision: run.revision,
      type: 'artifact.adopt', payload: { artifactId }, issuedAt: new Date().toISOString(),
    }, { read: deps.read, execute: deps.command })
  } finally { inFlight.delete(key) }
}

export function adoptLaneTaskCandidate(
  flow: readonly V4FlowItem[], index: number, candidateIndex: number,
  translate: Parameters<typeof friendlyError>[1],
): void {
  const item = flow[index]
  const candidate = item?.kind === 'task' ? item.task.candidates?.[candidateIndex] : undefined
  if (!candidate) return
  const project = withProjectAction((issued) => issued)
  if (!project) return
  void executeLaneTaskCandidateAdoption(candidate, {
    read: productionRunApi.read, command: productionRunApi.command, project,
  }).catch(error => alertDialog({ title: translate('generationCommon.production.gate.failed'), message: friendlyError(error, translate) }))
}
