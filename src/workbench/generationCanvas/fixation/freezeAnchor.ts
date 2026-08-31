// 视觉锚「定妆」（写 meta.frozen）的**唯一操作者**（纯 action，别塞进 BaseGenerationNode 巨壳）。
//
// 冻结门（dependencyWaves W2 / productionRun / core 单镜提醒）三处都读 `meta.frozen` 来拦下游镜头，
// 但在此之前**全仓没有任何生产代码写它**——门造了、门把手从来没装（F15 死锁根因）。这里补上那个把手：
// 用户在锚卡上点「定妆」= 视觉确认这张参考卡的形象定了 → 写 `{ at, by:'user' }` → 下游镜头才放行。
//
// 判据/键名走 anchorBibleKeys 单一镜像（与 headless 冻结门同语义，electron equivalence 钉死）。
// 写入务必**全量 spread 旧 meta**：漏了 `referenceSheet` 这张卡就不再是「视觉锚」，冻结门直接对它失明
// （F15 破案 case D：半个 meta spread 是隐形的第二个坑）。

import { ANCHOR_META_KEYS, isVisualAnchorNode, isAnchorFrozen, type AnchorFrozenMark } from '../model/anchorBibleKeys'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { applyFixationMakeup } from './buildFixationNode'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

/** 这个节点现在是不是「已定妆」的视觉锚（供 UI 决定按钮态；非锚恒 false）。 */
export function isAnchorLookConfirmed(node: GenerationCanvasNode | undefined | null): boolean {
  return isVisualAnchorNode(node) && isAnchorFrozen(node)
}

/** 定妆：把这张视觉锚标记为「形象已确认」。非视觉锚 = no-op（防误调）。返回是否真的写入。 */
export function confirmAnchorLook(nodeId: string): boolean {
  const store = useGenerationCanvasStore.getState()
  const node = store.nodes.find((candidate) => candidate.id === nodeId)
  if (!isVisualAnchorNode(node) || !node) return false
  if (isAnchorFrozen(node)) return true // 幂等：已定妆
  const frozen: AnchorFrozenMark = { at: Date.now(), by: 'user' }
  // 全量 spread 旧 meta —— 别丢 referenceSheet（否则这张卡不再算锚，冻结门失明）。
  store.updateNode(nodeId, { meta: { ...(node.meta || {}), [ANCHOR_META_KEYS.frozen]: frozen } })
  return true
}

/** 撤销定妆：删掉 frozen 标记（改了参考图要重新确认形象时用）。非锚/未冻结 = no-op。 */
export function undoAnchorLook(nodeId: string): boolean {
  const store = useGenerationCanvasStore.getState()
  const node = store.nodes.find((candidate) => candidate.id === nodeId)
  if (!isVisualAnchorNode(node) || !node || !isAnchorFrozen(node)) return false
  const nextMeta = { ...(node.meta || {}) }
  delete nextMeta[ANCHOR_META_KEYS.frozen]
  store.updateNode(nodeId, { meta: nextMeta })
  return true
}

/** 定妆开关（按当前态翻转）：UI 一个按钮承载「定妆 / 撤销定妆」。 */
export function toggleAnchorLook(nodeId: string): void {
  const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === nodeId)
  if (isAnchorFrozen(node)) undoAnchorLook(nodeId)
  else confirmAnchorLook(nodeId)
}

/**
 * 锚卡浮条的「创作主动作」四件套（isAnchor/frozen/onToggleFreeze/onMakeup），一次算好回给巨壳 spread。
 * 一功能一个家：isAnchor 时浮条显「定妆」（放行下游镜头），非锚显「建参考卡」——两者互斥、同位。
 */
export function anchorFreezeToolbarProps(node: GenerationCanvasNode): {
  isAnchor: boolean
  frozen: boolean
  onToggleFreeze: () => void
  onMakeup: () => void
} {
  return {
    isAnchor: isVisualAnchorNode(node),
    frozen: isAnchorFrozen(node),
    onToggleFreeze: () => toggleAnchorLook(node.id),
    onMakeup: () => applyFixationMakeup(node),
  }
}
