import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ProductionRunSummary } from '../../../../electron/productionRun/productionRunTypes'
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
export function creationRunTitle(run: ProductionRunSummary): string { return run.draft?.promptLine?.trim() || run.playbook.name }
export async function refreshCreationRunPlans(projectId?: string | null): Promise<void> {
  if (!projectId) return
  const epoch = ++request
  if (snapshot.projectId !== projectId) publish({ projectId, runs: [], loading: true, error: null })
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
export function readCreationRunSelection(projectId?: string | null): { runId: string; title: string; revision: number } | null {
  if (!projectId || snapshot.projectId !== projectId) return null
  const { activeCreationRunId } = useWorkbenchStore.getState()
  const run = snapshot.runs.find(value => value.runId === activeCreationRunId)
  return run ? { runId: run.runId, title: creationRunTitle(run), revision: run.revision } : null
}
export function useCreationRunSelection(projectId?: string | null) {
  useCreationRunPlans(projectId)
  useWorkbenchStore(state => state.activeCreationRunId)
  return readCreationRunSelection(projectId)
}
