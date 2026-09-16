import type { CanvasReadSurfaceIpcCapture } from '../capabilityCore/canvasReadSurfaceIpc'
import { assertProjectAgentBinding, type ProjectBinding } from '../shared/projectBinding'

export type ProjectInteractionCapture = (event: Electron.IpcMainInvokeEvent, payload: unknown) => (() => void) | undefined

/**
 * Main-side issuance for a renderer-started project action (imports, frame extraction).
 * A payload that names the full ProjectBinding its action was issued for opens/joins that
 * window's project session now, before any await; the returned assertion is re-checked before
 * publication. A payload without a binding is explicit project IO: the store still fixes disk
 * identity, it just carries no interactive authority to revoke.
 */
export function createProjectInteractionCapture(surface: CanvasReadSurfaceIpcCapture): ProjectInteractionCapture {
  return (event, payload) => {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    if (raw.projectBinding === undefined) return undefined
    const binding = raw.projectBinding as ProjectBinding
    assertProjectAgentBinding(binding)
    const session = surface.openProjectSession(event, binding)
    return () => surface.assertProjectSession(event, session)
  }
}
