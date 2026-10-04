import type { DirectorProject } from './model/directorTypes'
import type { DirectorStore } from './model/directorStore'

type Session = { store: DirectorStore; defaultSceneName: string }
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
  return true
}

export function hasDirectorSession(nodeId: string): boolean {
  return sessions.has(nodeId)
}
