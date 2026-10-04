import type { DirectorProject } from './model/directorTypes'
import type { DirectorStore } from './model/directorStore'

type Session = {
  store: DirectorStore
  defaultSceneName: string
  /** Persist the same export that the mounted editor now owns. */
  onExternalProjectChange?: (project: DirectorProject) => void
}
const sessions = new Map<string, Session>()

export function registerDirectorSession(nodeId: string | undefined, session: Session): () => void {
  if (!nodeId) return () => undefined
  sessions.set(nodeId, session)
  return () => {
    if (sessions.get(nodeId) === session) sessions.delete(nodeId)
  }
}

/** The single external write door reserved for stage_shot/AI in 3b. */
export function writeExternalDirectorProject(nodeId: string, project: DirectorProject): boolean {
  const session = sessions.get(nodeId)
  if (!session) return false
  session.store.getState().loadProject(project, session.defaultSceneName)
  // External AI/stage writes must cross the node boundary immediately. Waiting for
  // the editor's idle save leaves a reload/close window where the old node meta wins.
  session.onExternalProjectChange?.(session.store.getState().exportProject())
  return true
}

export function hasDirectorSession(nodeId: string): boolean {
  return sessions.has(nodeId)
}
