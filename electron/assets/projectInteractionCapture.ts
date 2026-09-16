import type { WebContents } from 'electron'
import type { CanvasReadSurfaceIpcCapture } from '../capabilityCore/canvasReadSurfaceIpc'
import { assertProjectAgentBinding, sameProjectAgentBinding, type ProjectBinding } from '../shared/projectBinding'
import type { WindowProjectIssuance } from './windowProjectCapture'

export type ProjectInteractionCapture = (event: Electron.IpcMainInvokeEvent, payload: unknown) => (() => void) | undefined

/** Resolves a child window's authority from its parent window's session (undefined = not a child window). */
export type ChildWindowProjectIssuer = (sender: WebContents) => WindowProjectIssuance | undefined

function staleProject(): Error {
  return Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' })
}

/**
 * Main-side issuance for a renderer-started project action (imports, frame extraction).
 * A payload that names the full ProjectBinding its action was issued for opens/joins that
 * window's project session now, before any await; the returned assertion is re-checked before
 * publication. A payload without a binding is explicit project IO: the store still fixes disk
 * identity, it just carries no interactive authority to revoke.
 *
 * A child window (the browser asset overlay) owns no session: it may only act inside its parent
 * window's committed project. Whatever project the payload names must be that one, and the
 * authority is revoked together with the parent's session; without one the call is refused.
 */
export function createProjectInteractionCapture(
  surface: CanvasReadSurfaceIpcCapture,
  childWindowProject: ChildWindowProjectIssuer,
): ProjectInteractionCapture {
  return (event, payload) => {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const child = childWindowProject(event.sender)
    if (child) {
      const namedProjectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : ''
      if (namedProjectId && namedProjectId !== child.binding.projectId) throw staleProject()
      if (raw.projectBinding !== undefined && !sameProjectAgentBinding(raw.projectBinding as ProjectBinding, child.binding)) throw staleProject()
      return child.assertCurrent
    }
    if (raw.projectBinding === undefined) return undefined
    const binding = raw.projectBinding as ProjectBinding
    assertProjectAgentBinding(binding)
    const session = surface.openProjectSession(event, binding)
    return () => surface.assertProjectSession(event, session)
  }
}
