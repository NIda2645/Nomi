import { describe, expect, it } from 'vitest'
import {
  resolveComposerViewportGeometry,
  resolveComposerViewportPanDelta,
  toolbarClearanceInCanvasUnits,
} from './useComposerViewportPlacement'

describe('toolbarClearanceInCanvasUnits', () => {
  it('converts the screen-space toolbar height back into canvas units and keeps the visual gap', () => {
    expect(toolbarClearanceInCanvasUnits(42, 0.7, 18)).toBe(78)
    expect(toolbarClearanceInCanvasUnits(42, 1, 18)).toBe(60)
  })

  it('does not reserve a phantom gap when no toolbar is mounted', () => {
    expect(toolbarClearanceInCanvasUnits(0, 0.7, 18)).toBe(0)
  })
})

describe('resolveComposerViewportGeometry', () => {
  it('abandons a stale upward attachment when neither side fits and below has more room', () => {
    const placement = resolveComposerViewportGeometry({
      previousFlipUp: true,
      spaceAbove: 180,
      spaceBelow: 300,
      toolbarScreenHeight: 42,
      canvasZoom: 1,
      gap: 14,
      contentHeight: 400,
      preferredMaxHeight: 400,
      minUsableHeight: 0,
    })

    expect(placement.flipUp).toBe(false)
    expect(placement.availableBelow).toBe(274)
    expect(placement.maxHeight).toBe(274)
  })

  it('subtracts the floating toolbar and both visual gaps from upward space', () => {
    const placement = resolveComposerViewportGeometry({
      previousFlipUp: false,
      spaceAbove: 420,
      spaceBelow: 260,
      toolbarScreenHeight: 42,
      canvasZoom: 1,
      gap: 14,
      contentHeight: 350,
      preferredMaxHeight: 400,
      minUsableHeight: 0,
    })

    expect(placement.aboveClearance).toBe(60)
    expect(placement.availableAbove).toBe(334)
    expect(placement.availableBelow).toBe(234)
    expect(placement.flipUp).toBe(true)
  })

  it('clamps the card height to the selected side so its prompt scrolls inside the viewport', () => {
    const placement = resolveComposerViewportGeometry({
      previousFlipUp: false,
      spaceAbove: 180,
      spaceBelow: 338,
      toolbarScreenHeight: 0,
      canvasZoom: 1,
      gap: 14,
      contentHeight: 520,
      preferredMaxHeight: 460,
      minUsableHeight: 0,
    })

    expect(placement.flipUp).toBe(false)
    expect(placement.maxHeight).toBe(312)
  })
})

describe('resolveComposerViewportPanDelta', () => {
  it('moves the canvas by the smallest amount that makes one full attachment side fit', () => {
    expect(resolveComposerViewportPanDelta({
      availableAbove: 130,
      availableBelow: 145,
      viewportAvailableBelow: 200,
      headroomAbove: 200,
      headroomBelow: 200,
      neededHeight: 236,
    })).toBe(-91)
  })

  it('does not pan when a side already fits', () => {
    expect(resolveComposerViewportPanDelta({
      availableAbove: 130,
      availableBelow: 240,
      headroomAbove: 200,
      headroomBelow: 200,
      neededHeight: 236,
    })).toBe(0)
  })

  it('does not pan when the canvas has nowhere left to move', () => {
    expect(resolveComposerViewportPanDelta({
      availableAbove: 40,
      availableBelow: 40,
      headroomAbove: 0,
      headroomBelow: 0,
      neededHeight: 236,
    })).toBe(0)
  })

  // 回归（2026-08-26 win32 j5 塌陷）：平移余量必须用「节点还能移多远」，
  // 不能用「那一侧装得下多少 composer」——后者白扣了 60px 工具条让位，把逃生口整个算死。
  // 实测几何：availableAbove 56 / availableBelow 65.5 / needed 118，真实上移余量 spaceAbove 140 - 12 = 128。
  it('pans using real headroom, not the toolbar-discounted attachment space', () => {
    expect(resolveComposerViewportPanDelta({
      availableAbove: 56,
      availableBelow: 65.5,
      headroomAbove: 128,
      headroomBelow: 123,
      neededHeight: 118,
    })).toBe(-52.5)
  })

  // 旧实现要求「缺口 <= 那一侧装得下多少」才肯动，于是缺口一过 ~121.5 就整个放弃（实测：
  // needed 118 时旧代码还推得动 -52.5，needed 150/191 时直接返回 0）。而真实上移余量有 128，
  // 本来推得动。需求高度一旦按真实内容（191）或最小可用高度（150）算，旧实现必然卡死——这条钉住它。
  it('still pans when the need is the real content height, where the old rule gave up', () => {
    expect(resolveComposerViewportPanDelta({
      availableAbove: 56,
      availableBelow: 65.5,
      headroomAbove: 128,
      headroomBelow: 123,
      neededHeight: 191,
    })).toBe(-125.5)
  })

  it('pans as far as it can when no amount fully satisfies the need', () => {
    // 全有全无会在这里放弃并留下不可用的缝；部分平移至少把空间推到极限。
    expect(resolveComposerViewportPanDelta({
      availableAbove: 20,
      availableBelow: 30,
      headroomAbove: 40,
      headroomBelow: 10,
      neededHeight: 200,
    })).toBe(-40)
  })

  // 回归（2026-08-27 linux J5）：节点+composer 在 stage 内放得下，但底部居中的时间轴把手让
  // 「完全不重叠障碍」变成无解。旧 fallback 会在上下 partial gain 之间反复换向，最终把 composer 翻到顶外。
  // 退路必须分清「障碍边界」和「真实视口边界」：先守住 stage containment，再接受与把手少量重叠。
  it('falls back to stage containment instead of oscillating when the timeline handle makes both attachments impossible', () => {
    expect(resolveComposerViewportPanDelta({
      availableAbove: 0,
      availableBelow: 78.8,
      viewportAvailableBelow: 124.3,
      headroomAbove: 41.7,
      headroomBelow: 92.8,
      neededHeight: 153,
    })).toBeCloseTo(-28.7)

    expect(resolveComposerViewportPanDelta({
      availableAbove: 0,
      availableBelow: 107.5,
      viewportAvailableBelow: 153,
      headroomAbove: 13,
      headroomBelow: 121.5,
      neededHeight: 153,
    })).toBe(0)
  })
})

describe('composer never collapses below its minimum usable height', () => {
  // 26px = padding 12+12 + border 1+1，content box 归零：提示词 0 高、底栏被裁到卡外。
  // 这是「看着有控件、其实一个都点不到」的形态，任何空间下都不允许出现。
  it('floors maxHeight at the minimum usable height even when both sides are squeezed', () => {
    const placement = resolveComposerViewportGeometry({
      previousFlipUp: false,
      spaceAbove: 140,
      spaceBelow: 89.5,
      toolbarScreenHeight: 42,
      canvasZoom: 1,
      gap: 14,
      contentHeight: 118,
      preferredMaxHeight: 400,
      minUsableHeight: 150,
    })

    expect(placement.maxHeight).toBeGreaterThanOrEqual(150)
  })

  it('does not let a clamped self-measurement claim the side fits', () => {
    // contentHeight 118 是「卡片被自己夹小后」的读数（真实内容 191）。
    // 需求高度下限拉到 minUsable 后，belowFits 必须仍为 false，翻转/平移才不会被压掉。
    const squeezed = resolveComposerViewportGeometry({
      previousFlipUp: false,
      spaceAbove: 400,
      spaceBelow: 160,
      toolbarScreenHeight: 0,
      canvasZoom: 1,
      gap: 14,
      contentHeight: 118,
      preferredMaxHeight: 400,
      minUsableHeight: 150,
    })

    expect(squeezed.availableBelow).toBe(134)
    expect(squeezed.flipUp).toBe(true)
  })

  it('leaves prompt-less composers free to stay short', () => {
    const placement = resolveComposerViewportGeometry({
      previousFlipUp: false,
      spaceAbove: 140,
      spaceBelow: 89.5,
      toolbarScreenHeight: 42,
      canvasZoom: 1,
      gap: 14,
      contentHeight: 60,
      preferredMaxHeight: 400,
      minUsableHeight: 0,
    })

    expect(placement.maxHeight).toBeLessThan(150)
  })
})
