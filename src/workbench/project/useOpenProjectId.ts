import React from 'react'
import { subscribeProjectOpened, withProjectAction } from './projectCanvasReadSurface'

/**
 * Display-only view of the project this window has open (asset pickers, disabled states,
 * feedback scoping). It is fed by the single issuance point and cleared when that project's
 * lifetime ends; it never hands out authority. Code that acts on a project issues its own
 * context with withProjectAction at the action start instead of reading this value.
 */
export function useOpenProjectId(): string | null {
  const [projectId, setProjectId] = React.useState<string | null>(() => withProjectAction((project) => project.binding.projectId) ?? null)
  React.useEffect(() => subscribeProjectOpened((project) => {
    const openedId = project.binding.projectId
    setProjectId(openedId)
    project.signal.addEventListener('abort', () => setProjectId((current) => (current === openedId ? null : current)), { once: true })
  }), [])
  return projectId
}
