import { getDesktopBridge } from '../../desktop/bridge'
import type { RunCommand } from '../../../electron/productionRun/productionRunTypes'

function bridge() {
  const value = getDesktopBridge()?.productionRuns
  if (!value) throw new Error('Production runs require the Electron desktop runtime')
  return value
}

export const productionRunApi = {
  list: (projectId: string) => bridge().list(projectId),
  read: (projectId: string, runId: string) => bridge().read(projectId, runId),
  createDraft: (input: Parameters<ReturnType<typeof bridge>['createDraft']>[0]) => bridge().createDraft(input),
  command: (projectId: string, runId: string, command: RunCommand) => bridge().command(projectId, runId, command),
  materializeStoryboard: (projectId: string, runId: string, artifactId: string, expectedVersion: number) => bridge().materializeStoryboard(projectId, runId, artifactId, expectedVersion),
  events: (projectId: string, runId: string, afterCursor: number) => bridge().events(projectId, runId, afterCursor),
}
