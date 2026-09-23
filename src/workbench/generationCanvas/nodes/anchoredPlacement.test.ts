import { describe, expect, it } from 'vitest'
import { resolveAnchoredPlacement, type AnchoredRect } from './anchoredPlacement'

/** 1000×800 的舞台，锚点是中间一个 200×200 的节点。 */
const stage: AnchoredRect = { left: 0, top: 0, right: 1000, bottom: 800 }
const centerNode: AnchoredRect = { left: 400, top: 300, right: 600, bottom: 500 }
const base = { stage, anchor: centerNode, width: 400, height: 200, gap: 12, aboveClearance: 0 }

const contains = (placement: { left: number; top: number; width: number; height: number }, region: AnchoredRect): boolean =>
  placement.left >= region.left
  && placement.top >= region.top
  && placement.left + placement.width <= region.right
  && placement.top + placement.height <= region.bottom

describe('resolveAnchoredPlacement', () => {
  it('attaches directly below the anchor, horizontally centred on it', () => {
    const placement = resolveAnchoredPlacement(base)
    expect(placement.side).toBe('below')
    expect(placement.top).toBe(centerNode.bottom + base.gap)
    expect(placement.left + placement.width / 2).toBe((centerNode.left + centerNode.right) / 2)
    expect(placement.width).toBe(base.width)
    expect(placement.height).toBe(base.height)
  })

  it('flips above when the region below cannot hold the card', () => {
    const lowNode: AnchoredRect = { left: 400, top: 560, right: 600, bottom: 760 }
    const placement = resolveAnchoredPlacement({ ...base, anchor: lowNode })
    expect(placement.side).toBe('above')
    expect(placement.top + placement.height).toBe(lowNode.top - base.gap)
    expect(contains(placement, stage)).toBe(true)
  })

  it('reserves the floating toolbar clearance when it flips above', () => {
    const lowNode: AnchoredRect = { left: 400, top: 560, right: 600, bottom: 760 }
    const placement = resolveAnchoredPlacement({ ...base, anchor: lowNode, aboveClearance: 40 })
    expect(placement.side).toBe('above')
    expect(placement.top + placement.height).toBe(lowNode.top - base.gap - 40)
  })

  it('keeps the whole card inside the stage when the anchor hugs an edge', () => {
    for (const anchor of [
      { left: -60, top: 300, right: 40, bottom: 400 },
      { left: 960, top: 300, right: 1060, bottom: 400 },
      { left: 400, top: -80, right: 600, bottom: 20 },
    ] satisfies AnchoredRect[]) {
      const placement = resolveAnchoredPlacement({ ...base, anchor })
      expect(contains(placement, stage)).toBe(true)
    }
  })

  it('narrows the card to the stage when the stage is narrower than the natural width', () => {
    const narrowStage: AnchoredRect = { left: 0, top: 0, right: 260, bottom: 800 }
    const placement = resolveAnchoredPlacement({ ...base, stage: narrowStage, anchor: { left: 30, top: 300, right: 230, bottom: 500 } })
    expect(placement.width).toBe(260)
    expect(contains(placement, narrowStage)).toBe(true)
  })

  it('takes the larger side and shortens the card when neither side can hold it', () => {
    const shortStage: AnchoredRect = { left: 0, top: 0, right: 1000, bottom: 560 }
    const anchor: AnchoredRect = { left: 400, top: 120, right: 600, bottom: 500 }
    const placement = resolveAnchoredPlacement({ ...base, stage: shortStage, anchor })
    // 上方剩 108（120-12），下方剩 48（560-500-12）→ 取上方，并压到 108。
    expect(placement.side).toBe('above')
    expect(placement.height).toBe(108)
    expect(contains(placement, shortStage)).toBe(true)
  })

  it('keeps natural height when the anchor fills the usable stage', () => {
    const placement = resolveAnchoredPlacement({ ...base, anchor: stage })
    expect(placement.height).toBe(base.height)
    expect(contains(placement, stage)).toBe(true)
  })

  it('never reports a negative size for a degenerate stage', () => {
    const collapsed: AnchoredRect = { left: 500, top: 400, right: 480, bottom: 380 }
    const placement = resolveAnchoredPlacement({ ...base, stage: collapsed })
    expect(placement.width).toBeGreaterThanOrEqual(0)
    expect(placement.height).toBeGreaterThanOrEqual(0)
  })

  // 调用方（useComposerViewportPlacement）不是把整个视口当 stage，而是先扣掉左缘常驻
  // 工具条（CanvasToolbar）量到的真实矩形，传进来的 stage.left 因此常年不是 0——
  // 这条守住「stage 本身左移之后，居中 + clamp 仍然是同一套算法」，不会因为 left≠0
  // 悄悄漏出另一条分支（2026-09-10 反馈 #10：浮框左缘被左栏压住的复现根因）。
  it('keeps the card clear of an inset stage.left, as when a fixed left dock narrows the usable area', () => {
    const dockedStage: AnchoredRect = { left: 96, top: 0, right: 1000, bottom: 800 }
    // 锚点紧贴收窄后的左边界——如果调用方仍按 stage.left=0 算居中，卡片会被推出
    // dockedStage.left 之外，被这条测试的 contains() 抓到。
    const anchorNearDock: AnchoredRect = { left: 100, top: 300, right: 300, bottom: 500 }
    const placement = resolveAnchoredPlacement({ ...base, stage: dockedStage, anchor: anchorNearDock })
    expect(contains(placement, dockedStage)).toBe(true)
    expect(placement.left).toBeGreaterThanOrEqual(dockedStage.left)
  })

  it('narrows the card to an inset stage that is narrower than the natural width', () => {
    // 模拟左栏很宽 + agent 面板把画布挤窄的极端窄视口：可用宽度只剩 220。
    const narrowDockedStage: AnchoredRect = { left: 96, top: 0, right: 316, bottom: 800 }
    const placement = resolveAnchoredPlacement({ ...base, stage: narrowDockedStage, anchor: { left: 150, top: 300, right: 260, bottom: 500 } })
    expect(placement.width).toBe(220)
    expect(contains(placement, narrowDockedStage)).toBe(true)
  })

  // 这条就是「不漂移」的机器判据：函数签名里根本没有障碍物这个入口，所以画布上
  // 别的节点、别的浮条、别的结果堆叠怎么动，同一个锚点算出来的位置必须逐字节相同。
  it('is a pure function of stage and anchor: the same anchor always resolves to the same rectangle', () => {
    const first = resolveAnchoredPlacement(base)
    const second = resolveAnchoredPlacement({ ...base, anchor: { ...centerNode } })
    expect(second).toEqual(first)
    expect(Object.keys(base)).toEqual(['stage', 'anchor', 'width', 'height', 'gap', 'aboveClearance'])
  })
})

/**
 * 2026-09-21 用户截图：图片节点浮框底栏被画布左下的缩放条与底部「时间轴」胶囊压住。
 * 那两块是固定停靠的画布 chrome（DOM 上自带 `data-canvas-bottom-dock`），不随视口滚动、
 * 也不随别的节点移动——它们是「可用视口」的一部分边界，不是要躲的邻居。
 */
describe('resolveAnchoredPlacement × bottom docks', () => {
  // 1280×933 窗口里量到的真实几何（stage 已扣 12px 边距）。
  const shotStage: AnchoredRect = { left: 134, top: 68, right: 848, bottom: 921 }
  const shotNode: AnchoredRect = { left: 363, top: 301, right: 703, bottom: 641 }
  const zoomBar: AnchoredRect = { left: 76, top: 880, right: 434, bottom: 920 }
  const timelinePill: AnchoredRect = { left: 440, top: 887, right: 622, bottom: 918 }
  const shot = { stage: shotStage, anchor: shotNode, width: 574, height: 265, gap: 14, aboveClearance: 60 }
  const intersects = (placement: { left: number; top: number; width: number; height: number }, dock: AnchoredRect) =>
    placement.left < dock.right && placement.left + placement.width > dock.left
    && placement.top < dock.bottom && placement.top + placement.height > dock.top

  it('reported case: the card never lands on the zoom bar or the timeline pill', () => {
    const placement = resolveAnchoredPlacement({ ...shot, bottomDocks: [zoomBar, timelinePill], dockClearance: 12 })
    expect(intersects(placement, zoomBar)).toBe(false)
    expect(intersects(placement, timelinePill)).toBe(false)
    expect(contains(placement, shotStage)).toBe(true)
  })

  it('a dock that does not share the card\'s horizontal span does not move it', () => {
    const farRightDock: AnchoredRect = { left: 1000, top: 880, right: 1200, bottom: 920 }
    expect(resolveAnchoredPlacement({ ...shot, bottomDocks: [farRightDock], dockClearance: 12 }))
      .toEqual(resolveAnchoredPlacement(shot))
  })

  it('class: for any anchor row and any dock band, the card is outside every dock and inside the stage', () => {
    const docks = [zoomBar, timelinePill]
    for (let top = shotStage.top; top <= shotStage.bottom - 40; top += 37) {
      for (let left = shotStage.left - 80; left <= shotStage.right; left += 61) {
        const anchor: AnchoredRect = { left, top, right: left + 200, bottom: top + 200 }
        const placement = resolveAnchoredPlacement({ ...shot, anchor, bottomDocks: docks, dockClearance: 12 })
        for (const dock of docks) expect(intersects(placement, dock), JSON.stringify({ anchor, placement })).toBe(false)
        expect(contains(placement, shotStage)).toBe(true)
      }
    }
  })
})

/**
 * 最小窗口（1100×720）里节点本身就占了大半屏：上下两侧都放不下浮框「非收不可」的那部分
 * （内边距 + 提示词最小高 + 底栏）。旧算法把卡压到可用空间那么矮，底栏被挤出卡外、落到停靠区上。
 * 放不下时宁可压住节点下半截（Floating UI shift 的标准行为：留在边界内，可以盖住参照物），
 * 也不许压 chrome、不许把底栏挤出卡片。
 */
describe('resolveAnchoredPlacement × minimum content height', () => {
  const stage: AnchoredRect = { left: 134, top: 68, right: 728, bottom: 708 }
  const zoomBar: AnchoredRect = { left: 76, top: 665, right: 434, bottom: 705 }
  const tallNode: AnchoredRect = { left: 239, top: 200, right: 579, bottom: 540 }
  const input = { stage, anchor: tallNode, width: 574, height: 200, gap: 14, aboveClearance: 81, bottomDocks: [zoomBar], dockClearance: 12 }

  it('reported case: never shorter than the fixed content, never onto the dock', () => {
    const placement = resolveAnchoredPlacement({ ...input, minHeight: 150 })
    expect(placement.height).toBeGreaterThanOrEqual(150)
    expect(placement.top + placement.height).toBeLessThanOrEqual(zoomBar.top - 12)
    expect(placement.top).toBeGreaterThanOrEqual(stage.top)
  })

  it('class: for any anchor and minimum, the card keeps its minimum and stays in the usable stage', () => {
    for (let top = 40; top <= 660; top += 31) {
      for (const minHeight of [0, 90, 150, 200]) {
        const anchor: AnchoredRect = { left: 239, top, right: 579, bottom: top + 340 }
        const placement = resolveAnchoredPlacement({ ...input, anchor, minHeight })
        const usableBottom = zoomBar.top - 12
        expect(placement.height, JSON.stringify({ top, minHeight })).toBeGreaterThanOrEqual(Math.min(minHeight, usableBottom - stage.top))
        expect(placement.top + placement.height, JSON.stringify({ top, minHeight })).toBeLessThanOrEqual(usableBottom)
        expect(placement.top).toBeGreaterThanOrEqual(stage.top)
      }
    }
  })
})
