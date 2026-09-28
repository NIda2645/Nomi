import type { LaneConversationRef, LaneWorkspaceProjection } from './laneContracts'

/** Identity comes from the same published snapshot as the selected conversation. */
export function laneConversationOf(snapshot: LaneWorkspaceProjection): LaneConversationRef | null {
  if (snapshot.closed) return null
  const lane = snapshot.lanes.find(item => item.laneName === snapshot.active.lane)
  return lane ? { laneName: lane.laneName, sessionId: lane.sessionId } : null
}
