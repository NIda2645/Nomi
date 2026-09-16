// 后台运行（已提交的生成 / 找回 / 本地派生）的项目归属与结局投递——唯一实现。
//
// 已批准行为：已提交的后台生成属于**原项目**，用户切页/切项目都不取消它。所以运行的项目身份
// 在提交那一刻固定（RunProjectTarget = 完整 ProjectBinding），之后只读它，绝不重读「当前项目」：
//   · 原项目正打开 → 结局照常写进画布 store（用户立刻看见）；
//   · 原项目不在前台 → 走既有的按项目读写盘路径（localProjectStore，与关闭项目删结果同一个 owner），
//     用户回到原项目时就在节点上看到；新项目零副作用。
import type { ProjectBinding } from '../../../../electron/shared/projectBinding'
import { isProjectBindingOpen } from '../../project/projectCanvasReadSurface'
import { readLocalProjectAsync, saveLocalProject } from '../../library/localProjectStore'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { nodeRunOutcomePatch, type NodeRunOutcome } from '../store/nodeRunOutcome'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'

export type RunProjectTarget = ProjectBinding

export type RunOutcomeDelivery = 'store' | 'disk' | 'missing'

/** 运行所属项目此刻是否就是画布里加载着的那个（身份逐字段比，不按 id 猜）。 */
export function isRunTargetLoaded(target: RunProjectTarget): boolean {
  return isProjectBindingOpen(target)
}

/** 仅当原项目正打开时才执行（进度、占位等瞬态只给前台看，不写别的项目）。 */
export function whenRunTargetLoaded(target: RunProjectTarget, apply: () => void): boolean {
  if (!isRunTargetLoaded(target)) return false
  apply()
  return true
}

function applyToStore(nodeId: string, outcome: NodeRunOutcome): RunOutcomeDelivery {
  const store = useGenerationCanvasStore.getState()
  if (!store.nodes.some((node) => node.id === nodeId)) return 'missing'
  if (outcome.kind === 'result') store.addNodeResult(nodeId, outcome.result)
  else if (outcome.kind === 'status') store.setNodeStatus(nodeId, outcome.status, outcome.error)
  else if (outcome.kind === 'run-started') store.appendNodeRun(nodeId, outcome.run)
  else if (outcome.kind === 'content') store.updateNode(nodeId, { contentJson: outcome.contentJson })
  else store.setNodeProgress(nodeId, outcome.progress)
  return 'store'
}

export type RunGraph = { nodes: GenerationCanvasNode[]; edges: GenerationCanvasEdge[] }

/**
 * 运行读它自己项目的画布：原项目正打开读 store（含未落盘编辑），否则读它在盘上的那一份——
 * 批量后续波次在用户切走之后仍按原项目的上游产物解析参考，绝不读到新项目的图。
 */
export async function readRunGraph(target: RunProjectTarget): Promise<RunGraph | null> {
  if (isRunTargetLoaded(target)) {
    const state = useGenerationCanvasStore.getState()
    return { nodes: state.nodes, edges: state.edges }
  }
  await (diskDeliveryQueues.get(target.projectId) ?? Promise.resolve()).catch(() => undefined)
  if (isRunTargetLoaded(target)) {
    const state = useGenerationCanvasStore.getState()
    return { nodes: state.nodes, edges: state.edges }
  }
  const canvas = (await readLocalProjectAsync(target.projectId))?.payload.generationCanvas
  return canvas ? { nodes: canvas.nodes, edges: canvas.edges } : null
}

const diskDeliveryQueues = new Map<string, Promise<unknown>>()

/** 同一项目的盘上投递串行：两个结局各读同一份旧快照再各存一遍会互相覆盖。 */
function serializeDiskDelivery<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
  const previous = diskDeliveryQueues.get(projectId) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(operation)
  const tail = result.then(() => undefined, () => undefined)
  diskDeliveryQueues.set(projectId, tail)
  void tail.finally(() => { if (diskDeliveryQueues.get(projectId) === tail) diskDeliveryQueues.delete(projectId) })
  return result
}

/** 把一次运行的结局投递到它的原项目。 */
export async function deliverRunOutcome(target: RunProjectTarget, nodeId: string, outcome: NodeRunOutcome): Promise<RunOutcomeDelivery> {
  if (isRunTargetLoaded(target)) return applyToStore(nodeId, outcome)
  return serializeDiskDelivery(target.projectId, async () => {
    if (isRunTargetLoaded(target)) return applyToStore(nodeId, outcome)
    const record = await readLocalProjectAsync(target.projectId)
    // 读盘期间用户恰好打开了原项目：此刻 store 才是真相，写 store，不回头覆盖盘。
    if (isRunTargetLoaded(target)) return applyToStore(nodeId, outcome)
    const canvas = record?.payload.generationCanvas
    const node = canvas?.nodes.find((candidate) => candidate.id === nodeId)
    if (!record || !canvas || !node) return 'missing'
    const nodes = canvas.nodes.map((candidate) => candidate.id === nodeId ? { ...candidate, ...nodeRunOutcomePatch(candidate, outcome) } : candidate)
    await saveLocalProject(target.projectId, { ...record.payload, generationCanvas: { ...canvas, nodes } }, record.name)
    return 'disk'
  })
}
