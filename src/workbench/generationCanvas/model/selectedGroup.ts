import type { NodeGroup } from './generationCanvasTypes'

/**
 * 画布上「此刻被选中的那一个编组」——编组「+」拉环出不出现的唯一判据。
 *
 * 两种选中法，对应编组的两种样子：
 * - 空框 / 折叠编组卡：框本身就是选区（`selectedFrameId`，Delete 删的就是它，见 useCanvasFrameActions）。
 * - 有成员的展开框：点框 = 选中它的全部成员（useCanvasSelectionDrag.handleGroupFramePointerDown），
 *   所以「选区恰好等于某个编组的全部成员」就是选中了这个编组。多选了成员之外的卡、或只选了一部分成员，
 *   都不算——那一刻用户在搬 / 删一批卡，不是在拿这一组起线。
 */
export function resolveSelectedGroupId(input: {
  selectedFrameId: string | null
  selectedNodeIds: readonly string[]
  groups: readonly Pick<NodeGroup, 'id' | 'nodeIds'>[]
  existingNodeIds: ReadonlySet<string>
}): string | null {
  const { selectedFrameId, selectedNodeIds, groups, existingNodeIds } = input
  if (selectedFrameId) return groups.some((group) => group.id === selectedFrameId) ? selectedFrameId : null
  if (selectedNodeIds.length === 0) return null
  const selected = new Set(selectedNodeIds)
  for (const group of groups) {
    const members = group.nodeIds.filter((nodeId) => existingNodeIds.has(nodeId))
    if (members.length > 0 && members.length === selected.size && members.every((nodeId) => selected.has(nodeId))) {
      return group.id
    }
  }
  return null
}
