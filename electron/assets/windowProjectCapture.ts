import type { BrowserWindow, WebContents } from 'electron'
import { canvasReadSurfaceRuntime } from '../capabilityCore/canvasReadSurfaceRuntime'
import type { SurfacePortBinding } from '../capabilityCore/canvasReadSurfaceRegistry'
import { sameProjectAgentBinding, type ProjectBinding } from '../shared/projectBinding'
import { captureAssetWriteContext, type AssetWriteContext } from './assetWriteContext'

export type WindowProjectIssuance = Readonly<{
  binding: ProjectBinding
  surfaceBinding: SurfacePortBinding
  /** Throws project_binding_stale once that window's committed project epoch is gone (A→B→A included). */
  assertCurrent(): void
}>

function staleProject(): Error {
  return Object.assign(new Error('project_binding_stale'), { code: 'project_binding_stale' })
}

function unavailableProject(): Error {
  return Object.assign(new Error('project_identity_unavailable'), { code: 'project_identity_unavailable' })
}

/**
 * Main-side issuance for work that main starts or relays on behalf of a window without a renderer
 * issued context: the global screenshot hotkey (main window) and child windows such as the browser
 * asset overlay (their parent window). Identity is only the committed project surface that this
 * window owns, fixed synchronously before any await; the returned assertion re-checks that exact
 * epoch, so the authority is revoked together with the window's project session. There is no
 * renderer-reported projectId and no fallback: no committed surface for this window = null.
 */
export function issueWindowProject(win: BrowserWindow, expected?: ProjectBinding): WindowProjectIssuance | null {
  const { registry } = canvasReadSurfaceRuntime
  const selection = canvasReadSurfaceRuntime.getCommittedProjectSelection()
  if (!selection || win.isDestroyed()) return null
  const { canonicalRootDigest, ...binding } = selection
  const captured = registry.captureCommittedCanvasReadPort({ binding, canonicalRootDigest })
  if (!captured) return null
  const surface = registry.resolveCapturedCanvasReadPort(captured)
  // The committed surface must belong to this very window; never credit window A's project to B.
  if (surface.owner.contents !== win.webContents) return null
  if (expected && !sameProjectAgentBinding(expected, surface.binding.binding)) throw staleProject()
  const assertCurrent = (): void => {
    try {
      registry.resolveCapturedCanvasReadPort(captured)
    } catch {
      throw staleProject()
    }
  }
  return Object.freeze({ binding: surface.binding.binding, surfaceBinding: surface.binding, assertCurrent })
}

/** The issued project's store identity, still revocable by the window session. */
export function captureIssuedProjectWrite(issuance: WindowProjectIssuance): Promise<AssetWriteContext> {
  return captureAssetWriteContext(issuance.binding.projectId, issuance.binding, issuance.assertCurrent)
}

/**
 * A child window (it has a parent BrowserWindow) owns no project session of its own. It may act
 * only inside its parent's committed project: derived here, revoked with it, refused without it.
 * Returns undefined for a top-level window, whose own issuance rules apply unchanged.
 */
export function issueChildWindowProject(sender: WebContents, fromWebContents: (sender: WebContents) => BrowserWindow | null): WindowProjectIssuance | undefined {
  const parent = fromWebContents(sender)?.getParentWindow()
  if (!parent) return undefined
  const issued = issueWindowProject(parent)
  if (!issued) throw unavailableProject()
  return issued
}
