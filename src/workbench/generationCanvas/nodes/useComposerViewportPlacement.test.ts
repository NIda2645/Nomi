import { describe, expect, it } from 'vitest'
import { resolveAnchoredPlacement, type AnchoredRect } from './anchoredPlacement'
import { aboveClearanceFromNodeChrome } from './useComposerViewportPlacement'

/**
 * 翻到节点上方的浮框要让开**节点自己画在上沿之外的东西**：标签行（「镜头 1 · 图片」）、
 * 行内状态条、浮动工具条（锁 / 复制变体）。2026-09-21 走查截图 01：卡底 y=268、浮条顶 y=262——
 * 旧算法只扣「浮条高度 + 18」，漏了浮条底下那 40 个画布单位（标签行所在的带）。
 */
describe('aboveClearanceFromNodeChrome', () => {
  // 截图 01 的实测几何（zoom 1）：节点卡顶 343；标签行 309–337；浮条 262–300。
  const nodeTop = 343
  const labelRow = { top: 309, bottom: 337, width: 340, height: 28 }
  const toolbar = { top: 262, bottom: 300, width: 78, height: 38 }

  it('reported case: reserves up to the toolbar top, not just its height', () => {
    expect(aboveClearanceFromNodeChrome(nodeTop, [labelRow, toolbar])).toBe(81)
  })

  it('reported case: the flipped card ends a full gap above the toolbar', () => {
    const stage: AnchoredRect = { left: 134, top: 68, right: 848, bottom: 921 }
    const anchor: AnchoredRect = { left: 247, top: nodeTop, right: 587, bottom: 683 }
    const gap = 14
    const placement = resolveAnchoredPlacement({
      stage, anchor, width: 574, height: 265, gap,
      aboveClearance: aboveClearanceFromNodeChrome(nodeTop, [labelRow, toolbar]),
      bottomDocks: [{ left: 76, top: 880, right: 434, bottom: 920 }], dockClearance: 12,
    })
    expect(placement.side).toBe('above')
    expect(placement.top + placement.height).toBeLessThanOrEqual(toolbar.top - gap)
  })

  it('class: whatever the node draws above itself, the flipped card never overlaps any of it', () => {
    const stage: AnchoredRect = { left: 0, top: 0, right: 1200, bottom: 900 }
    for (const zoom of [0.4, 0.7, 1, 1.6]) {
      for (const inlineStatus of [false, true]) {
        const top = 600
        // 与 CSS 同源的相对位置：标签行 bottom = 100% + 6（画布单位），浮条 bottom = 100% + 40 / 72，浮条屏幕高恒 38。
        const label = { top: top - (6 + 28) * zoom, bottom: top - 6 * zoom, width: 200, height: 28 * zoom }
        const lift = (inlineStatus ? 72 : 40) * zoom
        const bar = { top: top - lift - 38, bottom: top - lift, width: 80, height: 38 }
        const chrome = [label, bar]
        const anchor: AnchoredRect = { left: 500, top, right: 700, bottom: 860 }
        const placement = resolveAnchoredPlacement({
          stage, anchor, width: 480, height: 220, gap: 14 * zoom,
          aboveClearance: aboveClearanceFromNodeChrome(top, chrome),
        })
        expect(placement.side).toBe('above')
        for (const rect of chrome) expect(placement.top + placement.height, JSON.stringify({ zoom, inlineStatus })).toBeLessThanOrEqual(rect.top)
      }
    }
  })

  it('nothing measured above the node (not mounted yet, zero-size, or hidden) reserves nothing', () => {
    expect(aboveClearanceFromNodeChrome(343, [])).toBe(0)
    expect(aboveClearanceFromNodeChrome(343, [{ top: 0, bottom: 0, width: 0, height: 0 }])).toBe(0)
    // 画在节点**里面**的东西（top ≥ 节点顶）不是上沿之外的 chrome。
    expect(aboveClearanceFromNodeChrome(343, [{ top: 350, bottom: 380, width: 40, height: 30 }])).toBe(0)
  })
})
