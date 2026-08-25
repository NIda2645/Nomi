// 确认条「本波预估额度」的取价 hook（F15 F11）。计划里的节点可能跨 kind（图/视频/配音），
// 一个 hook 不能循环调 useGenerationModelOptionsState——所以这里 preloadModelOptions(kind) 异步预取
// 计划涉及的每种 kind 的模型选项（有 catalog 缓存，重复调很便宜），再交给纯函数 estimatePlanCost 累加。
// 未知 ≠ 0：任一节点解不出 pricing → 整批标未知（见 planCostEstimate）。

import React from 'react'
import { preloadModelOptions, MODEL_REFRESH_EVENT } from '../../../config/modelCatalogCache'
import type { ModelOption, NodeKind } from '../../../config/models'
import { getGenerationNodeCatalogKind } from '../model/generationNodeKinds'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { estimatePlanCost, optionForNode, type PlanCostEstimate } from '../spend/planCostEstimate'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

/** 计划内 nodeIds → 预估额度（未知/已知）。nodeIds 变或 catalog 刷新时重算。 */
export function useBatchPlanCost(nodeIds: readonly string[]): PlanCostEstimate | null {
  const key = nodeIds.join(',')
  const [estimate, setEstimate] = React.useState<PlanCostEstimate | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const compute = async (): Promise<void> => {
      const nodes = useGenerationCanvasStore.getState().nodes
      const plannedNodes = nodeIds
        .map((id) => nodes.find((node) => node.id === id))
        .filter((node): node is GenerationCanvasNode => Boolean(node))
      const kinds = [...new Set(plannedNodes.map((node) => getGenerationNodeCatalogKind(node.kind)))]
      const byKind = new Map<NodeKind, ModelOption[]>()
      await Promise.all(
        kinds.map(async (kind) => {
          try {
            byKind.set(kind, await preloadModelOptions(kind))
          } catch {
            byKind.set(kind, []) // 取不到该 kind 选项 → 该 kind 的节点会计入 unresolved（标未知，不当 0）
          }
        }),
      )
      if (cancelled) return
      const result = estimatePlanCost(
        // 用计划里的全部 id（含解析不到节点的）——缺失节点也算未知，不悄悄漏。
        nodeIds.map((id) => nodes.find((node) => node.id === id)),
        (node) => optionForNode(node, byKind.get(getGenerationNodeCatalogKind(node.kind)) ?? []),
      )
      setEstimate(result)
    }
    void compute()
    const onRefresh = (): void => void compute()
    if (typeof window !== 'undefined') window.addEventListener(MODEL_REFRESH_EVENT, onRefresh)
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') window.removeEventListener(MODEL_REFRESH_EVENT, onRefresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return estimate
}
