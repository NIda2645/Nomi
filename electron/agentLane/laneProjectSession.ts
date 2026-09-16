import type { CanvasReadSurfaceRegistry, ProjectSurfaceSession } from '../capabilityCore/canvasReadSurfaceRegistry'

/** A closed window/project retires interactive authority before awaiting lane cleanup. */
export function bindLaneProjectSession<T extends { close(): Promise<void> }>(
  workspace: T,
  registry: CanvasReadSurfaceRegistry,
  session: ProjectSurfaceSession,
  onClosed: () => void,
): T {
  const { signal } = registry.resolveProjectSession(session)
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    if (closing) return closing
    signal.removeEventListener('abort', revoked)
    closing = Promise.resolve().then(async () => {
      try { await workspace.close() } finally { onClosed() }
    })
    registry.revokeProjectSession(session)
    return closing
  }
  const revoked = () => { void close().catch(error => console.error('[agent-lane] session close failed', error)) }
  signal.addEventListener('abort', revoked, { once: true })
  return { ...workspace, close }
}
