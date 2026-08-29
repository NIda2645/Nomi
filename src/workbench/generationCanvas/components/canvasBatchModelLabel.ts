import type { CanvasGenerationExecutionGroup } from './canvasProductionScope'

export function resolveCanvasBulkModelLabelKey(
  group: CanvasGenerationExecutionGroup,
  peerGroups: readonly CanvasGenerationExecutionGroup[],
): string {
  const sameKindHasAnotherMode = peerGroups.some(
    (peer) => peer.executionKind === group.executionKind && peer.requiredMode !== group.requiredMode,
  )
  return sameKindHasAnotherMode
    ? `generationCommon.production.modeModelGroup.${group.requiredMode}`
    : `generationCommon.production.modelGroup.${group.executionKind}`
}
