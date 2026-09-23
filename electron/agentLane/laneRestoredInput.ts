import type { LaneDraftInput } from '../shared/agentLane/laneContracts'
import type { LaneRestoredDesktopInput } from '../shared/agentLane/laneDesktopContracts'
import type { ProjectAgentAttachmentClaim, ProjectAgentAttachmentRef } from '../shared/workbenchInput'

/** Desktop display resolution for inputs already returned by pi cancellation. */
export function restoreLaneDraftInputs(
  entries: readonly LaneDraftInput[],
  resolve: (claims: readonly ProjectAgentAttachmentClaim[]) => readonly ProjectAgentAttachmentRef[],
): readonly LaneRestoredDesktopInput[] {
  return entries.map((entry) => ({ ...entry,
    ...(entry.attachments?.length ? { attachments: entry.attachments.map((claim) => {
      // Cancellation already consumed the queue entry. A missing file must remain a
      // visible, unsendable claim; it cannot turn a successful withdrawal into data loss.
      try {
        const ref = resolve([claim])[0]
        return ref?.assetId === claim.assetId ? { ...ref, version: claim.version } : claim
      } catch { return claim }
    }) } : {}),
  }))
}
