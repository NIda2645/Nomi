// 能力核 · 「上一镜是哪一镜」的纯判据（L3-F1 实测抓出：连贯轴在 MCP 单镜路上从来没评过）。
//
// 背景：审片环对外说三轴（身份/构图/连贯），但 `previousShotPrompt` 从来没人传过——
// 旧 headless 单次生成每次都是独立调用，判分器手上只有当前镜，于是 continuity 恒为
// 「无前一镜 → 不评」。**三轴实际只跑了两轴**，而「接不接得上」恰恰是短剧最容易崩的那一轴。
//
// 但「上一镜」并非拿不到：画布上镜头带 shotIndex，前一镜 = 同分类里 shotIndex 最大且小于当前的那个。
// derive 得出来，只是以前没接。本模块复用共享镜头身份，保持纯函数，可裸测。
//
// 铁律：**拿不准就返回 undefined**（判不了「上一镜是谁」时，宁可不评连贯，也不要拿一个错的镜去比——
// 拿错参照物比不比更糟，会凭空判出「断裂」并触发一轮救不回来的重滚）。

import { resolveShotIdentities, type ShotNumberedNode } from '../shared/canvas/shotNumbering'

export type ShotOrderNode = ShotNumberedNode & { prompt?: unknown }

/**
 * 找 nodeId 的「上一镜」提示词。返回 undefined = 没有上一镜 / 判不出（此时不该评 continuity）。
 *
 * 判据：同 categoryId 内，shotIndex 严格小于当前镜的节点里取 shotIndex 最大的那个。
 * 首帧从 first_frame 边派生所属镜号；参考卡、孤立/多归属首帧不猜上一镜。
 */
export function previousShotPromptFor(
  nodes: readonly ShotOrderNode[],
  nodeId: string,
  edges: readonly { source: string; target: string; mode?: string }[] = [],
): string | undefined {
  const current = nodes.find((n) => n.id === nodeId)
  const identities = resolveShotIdentities(nodes, edges)
  const currentIndex = identities.get(nodeId)?.shotIndex ?? null
  if (currentIndex === null || !Number.isFinite(currentIndex)) return undefined
  const category = String(current?.categoryId ?? 'shots')

  let best: { index: number; prompt: string } | null = null
  for (const node of nodes) {
    if (node.id === nodeId) continue
    if (String(node.categoryId ?? 'shots') !== category) continue
    const identity = identities.get(node.id)
    if (identity?.shotRole === 'first_frame') continue
    const index = identity?.shotIndex ?? null
    if (index === null || !Number.isFinite(index) || index >= currentIndex) continue
    const prompt = typeof node.prompt === 'string' ? node.prompt.trim() : ''
    if (!prompt) continue
    if (!best || index > best.index) best = { index, prompt }
  }
  return best ? best.prompt : undefined
}
