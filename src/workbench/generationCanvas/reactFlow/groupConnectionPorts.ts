import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { CollapsedGroupCardProjection } from '../model/canvasCardStackModel'
import type { CanvasGroupBox } from '../components/GroupFrame'
import { withGroupPort } from '../model/groupPort'

/**
 * 把编组投影成画布内核里的端口节点（model/groupPort.ts），拼在可见节点后面交给 React Flow。
 *
 * - 折叠编组：复用承接聚合边的 proxy 节点（id = 编组 id，位置 / 尺寸 = 折叠卡），一直在，
 *   「+」圈只在选中时出。
 * - 展开编组：只有被选中的那一个投影端口节点（位置 / 尺寸 = 框体）。没选中就不投影——
 *   反正没有圈可画，少一个节点就少一份测量和一次重排。
 */
export function projectGroupConnectionPorts(input: {
  visibleNodes: readonly GenerationCanvasNode[]
  cards: readonly CollapsedGroupCardProjection[]
  edgeNodeById: ReadonlyMap<string, GenerationCanvasNode>
  boxes: readonly CanvasGroupBox[]
  selectedGroupId: string | null
}): readonly GenerationCanvasNode[] {
  const { visibleNodes, cards, edgeNodeById, boxes, selectedGroupId } = input
  const ports: GenerationCanvasNode[] = cards.flatMap((card) => {
    const proxy = edgeNodeById.get(card.groupId)
    return proxy ? [withGroupPort(proxy, { groupId: card.groupId, selected: selectedGroupId === card.groupId })] : []
  })
  const selectedBox = selectedGroupId
    ? boxes.find((box) => box.group.id === selectedGroupId && !box.group.collapsed && box.memberCount > 0)
    : undefined
  if (selectedBox) {
    ports.push(withGroupPort({
      id: selectedBox.group.id,
      kind: 'image',
      title: selectedBox.group.name,
      categoryId: selectedBox.group.categoryId,
      position: { x: selectedBox.left, y: selectedBox.top },
      size: { width: selectedBox.width, height: selectedBox.height },
      prompt: '',
      status: 'idle',
    } as GenerationCanvasNode, { groupId: selectedBox.group.id, selected: true }))
  }
  return ports.length ? [...visibleNodes, ...ports] : visibleNodes
}
