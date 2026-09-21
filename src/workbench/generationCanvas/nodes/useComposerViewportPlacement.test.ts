import { describe, expect, it } from 'vitest'
import { resolveAnchoredPlacement, type AnchoredRect } from './anchoredPlacement'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { aboveClearanceFromNodeChrome, referenceScrollportHeight } from './useComposerViewportPlacement'

/**
 * 翻到节点上方的浮框要让开**节点自己画在上沿之外的东西**：标签行（「镜头 1 · 图片」）、
 * 行内状态条、浮动工具条（锁 / 复制变体）。2026-09-21 走查截图 01：卡底 y=268、浮条顶 y=262——
 * 旧算法只扣「浮条高度 + 18」，漏了浮条底下那 40 个画布单位（标签行所在的带）。
 */
describe('aboveClearanceFromNodeChrome', () => {
  // 截图 01 的实测几何（zoom 1）：节点卡顶 343；标签行 309–337；浮条 262–300。
  const nodeTop = 343
  const labelRow = { top: 309, width: 340, height: 28 }
  const toolbar = { top: 262, width: 78, height: 38 }

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
        const label = { top: top - (6 + 28) * zoom, width: 200, height: 28 * zoom }
        const lift = (inlineStatus ? 72 : 40) * zoom
        const bar = { top: top - lift - 38, width: 80, height: 38 }
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
    expect(aboveClearanceFromNodeChrome(343, [{ top: 0, width: 0, height: 0 }])).toBe(0)
    // 画在节点**里面**的东西（top ≥ 节点顶）不是上沿之外的 chrome。
    expect(aboveClearanceFromNodeChrome(343, [{ top: 350, width: 40, height: 30 }])).toBe(0)
  })
})

/**
 * 2026-09-21 走查 01/07：卡片被压到最小高度时，参考区滚动口被压到 1–28px，而「生成方式」切换住在
 * 滚动口里——tab 只露下半截、EN 的「Generation mode」只剩一条线。模式栏是卡片的固定内容：
 * 它必须是卡片的直接子行、在滚动口之外，放置层量 fixedHeight 时才会把它算进最小高度。
 */
describe('composer mode bar is fixed content, not scrollable reference content', () => {
  const composer = readFileSync(fileURLToPath(new URL('./NodeGenerationComposer.tsx', import.meta.url)), 'utf8')
  const controls = readFileSync(fileURLToPath(new URL('./NodeParameterControls.tsx', import.meta.url)), 'utf8')

  it('renders the mode section as its own card row before the references scrollport', () => {
    const modeRow = composer.indexOf('<NodeParameterControls node={node} section="mode" />')
    const scrollport = composer.indexOf('<div data-node-composer-references')
    expect(modeRow).toBeGreaterThan(-1)
    expect(scrollport).toBeGreaterThan(modeRow)
    // 模式行不在滚动口里：两者之间有滚动口外层 div 的闭合。
    expect(composer.slice(modeRow, scrollport)).toContain('</div>')
  })

  it('the references section no longer renders the mode bar inside the scrollport', () => {
    expect(controls).toContain("if (section === 'mode')")
    expect(controls).not.toContain('showReferences && showModeBar ? (')
  })
})

/**
 * 模式栏挪出滚动口之后第一次走查：卡片最小高度没算参考格，滚动口被压到 0，改图模式下「加参考」整行消失。
 * 参考区滚动口有下限（第一行参考格），且随卡片多出来的高度一比一长。
 */
describe('referenceScrollportHeight', () => {
  const firstRow = 64
  const otherFixed = 220 // 内边距 + 模式栏 + 提示词最小高 + 底栏

  it('reported case: at the minimum card height the first reference row is still visible', () => {
    const fixedHeight = otherFixed + firstRow
    expect(referenceScrollportHeight(fixedHeight, fixedHeight, firstRow)).toBe(firstRow)
  })

  it('class: never below the floor, and grows one-for-one with spare card height', () => {
    const fixedHeight = otherFixed + firstRow
    for (const spare of [-40, 0, 1, 37, 300]) {
      const height = referenceScrollportHeight(fixedHeight + spare, fixedHeight, firstRow)
      expect(height).toBeGreaterThanOrEqual(firstRow)
      if (spare >= 0) expect(height).toBe(firstRow + spare)
    }
  })

  it('no references section, no floor', () => {
    expect(referenceScrollportHeight(150, 150, 0)).toBe(0)
  })
})
