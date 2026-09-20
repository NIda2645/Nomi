import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { DesktopProductionRunBridge } from '../../../desktop/productionRunBridgeTypes'
type ProductionRunSummary = Awaited<ReturnType<DesktopProductionRunBridge['list']>>[number]
import { productionRunApi } from '../../production/productionRunApi'
import { useWorkbenchStore } from '../../workbenchStore'

type Snapshot = { projectId: string | null; runs: ProductionRunSummary[]; loading: boolean; error: string | null }
// Read projection only. Canonical plans and revision checks stay in the main-process Run repository.
let snapshot: Snapshot = { projectId: null, runs: [], loading: false, error: null }
let request = 0
let consumers = 0
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const getSnapshot = () => snapshot
function publish(value: Snapshot) { snapshot = value; listeners.forEach(listener => listener()) }
export function creationRunTitle(run: ProductionRunSummary): string { return run.authoring?.title?.trim() || run.draft?.promptLine?.trim() || run.playbook.name }
export function runsForDocument(runs: ProductionRunSummary[], projectId: string, documentId: string): ProductionRunSummary[] {
  return runs.filter(run => run.projectId === projectId && run.origin.sourceDocument?.documentId === documentId)
}
export function selectedRunForDocument(runs: ProductionRunSummary[], projectId: string, documentId: string, runId: string | null): ProductionRunSummary | null {
  return runsForDocument(runs, projectId, documentId).find(run => run.runId === runId) ?? null
}
export async function refreshCreationRunPlans(projectId?: string | null): Promise<void> {
  if (!projectId || snapshot.projectId !== projectId) return
  const epoch = ++request
  try {
    const runs = await productionRunApi.list(projectId)
    if (epoch !== request || snapshot.projectId !== projectId) return
    publish({ projectId, runs, loading: false, error: null })
  } catch (error) {
    if (epoch !== request || snapshot.projectId !== projectId) return
    publish({ ...snapshot, loading: false, error: error instanceof Error ? error.message : String(error) })
  }
}
export function useCreationRunPlans(projectId?: string | null) {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  useEffect(() => {
    consumers += 1
    // Only mounted consumers bind the read owner. Save callbacks can refresh it,
    // but cannot switch the visible project or invalidate its pending reads.
    if (snapshot.projectId !== (projectId ?? null)) {
      request += 1
      publish({ projectId: projectId ?? null, runs: [], loading: Boolean(projectId), error: null })
    }
    if (projectId) void refreshCreationRunPlans(projectId)
    if (!timer) timer = setInterval(() => { if (snapshot.projectId) void refreshCreationRunPlans(snapshot.projectId) }, 1500)
    return () => {
      consumers -= 1
      if (!consumers) { clearInterval(timer); timer = undefined; request += 1; publish({ projectId: null, runs: [], loading: false, error: null }) }
    }
  }, [projectId])
  const refresh = useCallback(() => refreshCreationRunPlans(projectId), [projectId])
  return { runs: value.projectId === projectId ? value.runs : [], loading: value.projectId === projectId ? value.loading : Boolean(projectId), error: value.projectId === projectId ? value.error : null, refresh }
}
export function readCreationRunSelection(projectId?: string | null): { runId: string; title: string; revision: number; sourceDocumentId: string; sourceDocumentRevision: number; sourceDocumentContentHash: string } | null {
  if (!projectId || snapshot.projectId !== projectId) return null
  const { activeCreationRunId, activeDocumentId } = useWorkbenchStore.getState()
  const run = selectedRunForDocument(snapshot.runs, projectId, activeDocumentId, activeCreationRunId)
  return run ? { runId: run.runId, title: creationRunTitle(run), revision: run.revision, sourceDocumentId: run.origin.sourceDocument!.documentId, sourceDocumentRevision: run.origin.sourceDocument!.revision, sourceDocumentContentHash: run.origin.sourceDocument!.contentHash } : null
}
export function useCreationRunSelection(projectId?: string | null) {
  useCreationRunPlans(projectId)
  useWorkbenchStore(state => state.activeCreationRunId)
  useWorkbenchStore(state => state.activeDocumentId)
  return readCreationRunSelection(projectId)
}

export function creationRunStatusKey(status: ProductionRunSummary['status']): string {
  return `taskCenter.productionRun.statuses.${status.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`
}
