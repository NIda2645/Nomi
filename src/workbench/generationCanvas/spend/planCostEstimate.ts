// 执行计划的「本波预估额度」（F15 确认条 F11：确认前先让用户看到大概花多少）。
//
// 语义铁律：**未知 ≠ 0**。catalog 有 pricing → 累加 cost（金币，非负整数）；只要**任一节点的模型解不出
// pricing** → 整批标「价格未知」，绝不把解不出的当 0 悄悄少报（少报比不报更坏——用户以为便宜）。
// 纯函数：喂节点 + 该 kind 的模型选项，不碰 store，可裸测。

import type { ModelOption } from '../../../config/models'
import { findModelOptionByIdentifier } from '../adapters/modelOptionsAdapter'
import { nodeSelectedModelAddress } from '../nodes/controls/parameterControlModel'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

export type PlanCostEstimate =
  | { known: true; credits: number }
  | { known: false; credits: number; unresolved: number }

/**
 * 累加一批节点的模型额度。
 * @param nodes 计划内节点（waves 拍平后取到的节点对象；缺失节点计入 unresolved）
 * @param optionsByKind 取模型选项的函数（按节点 kind 拿对应模型列表；渲染层传 useGenerationModelOptionsState 的结果）
 */
export function estimatePlanCost(
  nodes: readonly (GenerationCanvasNode | undefined)[],
  resolveOption: (node: GenerationCanvasNode) => ModelOption | undefined,
): PlanCostEstimate {
  let credits = 0
  let unresolved = 0
  for (const node of nodes) {
    if (!node) {
      unresolved += 1
      continue
    }
    const option = resolveOption(node)
    const pricing = option?.pricing
    if (!pricing || typeof pricing.cost !== 'number' || !Number.isFinite(pricing.cost)) {
      unresolved += 1
      continue
    }
    credits += Math.max(0, pricing.cost)
  }
  return unresolved > 0 ? { known: false, credits, unresolved } : { known: true, credits }
}

/** 便利入口：从模型选项表按节点 meta 解析模型选项（供渲染层直接喂 estimatePlanCost 的 resolveOption）。 */
export function optionForNode(
  node: GenerationCanvasNode,
  optionsForKind: readonly ModelOption[],
): ModelOption | undefined {
  const address = nodeSelectedModelAddress(node.meta || {})
  return findModelOptionByIdentifier(optionsForKind, address.modelKey, address.vendorKey) ?? undefined
}
