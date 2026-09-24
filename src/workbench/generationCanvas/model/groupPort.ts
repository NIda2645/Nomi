import type { GenerationCanvasNode } from './generationCanvasTypes'

/**
 * 编组在画布内核（React Flow）里的「端口节点」标记。
 *
 * 编组不是节点，但 React Flow 的连线只能从挂在节点里的 `Handle` 起。所以每个编组投影一个端口节点：
 * 折叠编组复用本来就用来承接聚合边的 proxy 节点；展开编组只在被选中时临时投影一个覆盖框体的端口节点。
 * 端口节点不渲染卡面、自身不吃指针，只渲染左右两个源把手（见 GenerationCanvasReactFlowNodes）。
 * 它从不落盘：只存在于画布投影里。
 */
export type GroupPortMeta = {
  groupId: string
  /** 这个编组此刻被选中（model/selectedGroup.ts）——只有选中才出「+」圈。 */
  selected: boolean
}

export function readGroupPort(node: Pick<GenerationCanvasNode, 'meta'>): GroupPortMeta | null {
  const value = (node.meta as Record<string, unknown> | undefined)?.groupPort
  if (!value || typeof value !== 'object') return null
  const port = value as Partial<GroupPortMeta>
  return typeof port.groupId === 'string' ? { groupId: port.groupId, selected: port.selected === true } : null
}

export function withGroupPort(node: GenerationCanvasNode, port: GroupPortMeta): GenerationCanvasNode {
  return { ...node, meta: { ...(node.meta || {}), groupPort: port } }
}
