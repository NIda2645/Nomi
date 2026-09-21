import React from 'react'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useWorkbenchStore } from '../../workbenchStore'
import { CANVAS_DRAGGING_ATTRIBUTE } from '../components/canvasDraggingFlag'
import { resolveAnchoredPlacement } from './anchoredPlacement'
import { collectBottomDockElements, resolveBottomDockScope } from '../../generation/workspaceBottomDocks'

export const NODE_FLOATING_TOOLBAR_SELECTOR = '[data-node-floating-toolbar="true"]'
/**
 * 节点画在自己上沿**之外**的 chrome：浮动工具条、标签行（「镜头 1 · 图片」）、行内状态条。
 * 三者各自在 DOM 上声明标记（`NodeFloatingToolbar` / `NodeLabelRow` / `BaseGenerationNode`），这里不抄尺寸。
 */
const NODE_ABOVE_CHROME_SELECTOR = `${NODE_FLOATING_TOOLBAR_SELECTOR}, [data-node-label-row="true"], [data-node-inline-status]`
/** 画布左缘常驻工具条（`CanvasToolbar`）自己挂的标记——同 `useCanvasBottomDockRects.ts` 底部停靠的机制。 */
const CANVAS_LEFT_DOCK_SELECTOR = '[data-canvas-left-dock="true"]'
const VIEWPORT_MARGIN = 12
const LEFT_DOCK_GAP = 12
const COMPOSER_MAX_WIDTH = 880
const COMPOSER_MIN_WIDTH = 360

/**
 * 翻到上方时要让出的高度（屏幕 px）= 节点顶 − 它上沿之外那堆 chrome 里最高的那个顶。
 *
 * 为什么量「顶」而不是「浮条高度」：浮条并不贴着节点——它下面还隔着标签行那条 40 画布单位的带
 * （有行内状态时是 72）。2026-09-21 之前按「浮条高度 + 18」算，漏了这条带，翻上去的浮框压住浮条 6px。
 * 实测每一块的真实矩形，缩放、行内状态、浮条有没有挂上都自动算对，不抄 CSS 里的 40 / 72。
 *
 * 规则：只算**有尺寸**且**顶在节点顶之上**的块；一块都量不到（浮条还没挂上、节点没有标签行）就一格
 * 不让——浮框与节点之间只剩调用方那个 gap。浮框与最高那块之间的间距同样是 gap。缩放 < 0.4 时标签行
 * 是 `visibility: hidden`，矩形仍在，照样让出：多留一条空带无害，压上去才有害。
 */
export function aboveClearanceFromNodeChrome(
  nodeTop: number,
  chrome: readonly Readonly<{ top: number; width: number; height: number }>[],
): number {
  let highest = nodeTop
  for (const rect of chrome) {
    if (!(rect.width > 0 && rect.height > 0)) continue
    if (rect.top < highest) highest = rect.top
  }
  return Math.max(0, nodeTop - highest)
}

/**
 * One placement owner for every composer: all measurements are screen pixels.
 *
 * 位置只跟着**这个节点**走：视口内 clamp + below/above 翻转，别的什么都不看
 * （几何本体在 `anchoredPlacement.ts`）。以前这里挂着一套「全场障碍 ResizeObserver +
 * workspace 子树 MutationObserver」，任何无关元素动一下都会重排浮框，那就是用户报的漂移
 * （2026-09-10 反馈 #10）。
 *
 * 要观测的因此**正好是那两个入参**：节点自己的屏幕矩形，和舞台的屏幕矩形。
 * 观测方式见下面 `recompute` 后面那段——`ResizeObserver` 一个人办不到。
 *
 * 「舞台矩形」本身不等于「可用区」：画布左缘常驻着 `CanvasToolbar`，是固定停靠的画布
 * chrome，不随视口滚动。`recompute` 里量它的真实矩形来收窄 `stage.left`（2026-09-10
 * 反馈 #10 复核：截图里浮框左缘、「生成方式」标签被它压住，根因是可用区算漏了这一块）。
 * 底部同理：缩放条、时间轴胶囊、Nomi 收起坞等自己声明 `data-canvas-bottom-dock`，名单与让位
 * 判据的 owner 在 `generation/workspaceBottomDocks.ts`（画布多选浮条读同一份）。2026-09-21
 * 用户截图：浮框底栏被缩放条与时间轴胶囊压住——那次只补了左缘，底部这一排漏了。
 * 它们同样只随外壳布局变，不随别的节点动，所以不破坏「不漂移」。
 */
export function useComposerViewportPlacement(input: {
  node: GenerationCanvasNode
  visualSize: { width: number; height: number }
  gap: number
  preferredMaxHeight: number
  minUsableHeight: number
}) {
  const { node, visualSize, gap, preferredMaxHeight, minUsableHeight } = input
  const canvasZoom = useWorkbenchStore((state) => state.categoryViewports[state.activeCategoryId]?.zoom ?? 1)
  const canvasOffset = useWorkbenchStore((state) => state.categoryViewports[state.activeCategoryId]?.offset)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = React.useState({ left: 0, top: visualSize.height + gap, maxWidth: COMPOSER_MAX_WIDTH, maxHeight: preferredMaxHeight, referenceMaxHeight: preferredMaxHeight, flipUp: false })

  React.useLayoutEffect(() => {
    const anchor = anchorRef.current
    const stage = anchor?.closest('.generation-canvas-v2__stage')
    const nodeEl = anchor?.parentElement
    if (!anchor || !stage || !nodeEl) return

    // 底部停靠区的元素缓存：每次 recompute 重新收集（挂上/摘下），每帧只读它们的矩形。
    let dockElements: Element[] = []
    // 节点上沿之外的 chrome 只在节点自己的子树里找（几十个元素），每帧现查：浮条会在浮框之后才挂上、
    // 行内状态出现时浮条会整体上移 32，这两件都不改节点矩形，只能靠它们自己的矩形进签名。
    const aboveChromeElements = () => Array.from(nodeEl.querySelectorAll(NODE_ABOVE_CHROME_SELECTOR))
      .filter((element) => !anchor.contains(element))
    const recompute = () => {
      const stageRect = stage.getBoundingClientRect()
      const nodeRect = nodeEl.getBoundingClientRect()
      const card = anchor.querySelector<HTMLElement>('.generation-canvas-v2-node__composer-card')
      if (!card) return
      // Measure the current content unconstrained, then restore before paint. This lets both
      // a smaller model form and a newly freed region resize naturally after clipping.
      const references = card.querySelector<HTMLElement>('[data-node-composer-references]')
      const previousReferenceMaxHeight = references?.style.maxHeight ?? ''
      if (references) references.style.maxHeight = 'none'
      const previousStyle = { maxWidth: card.style.maxWidth, minWidth: card.style.minWidth, maxHeight: card.style.maxHeight, minHeight: card.style.minHeight }
      Object.assign(card.style, { maxWidth: `${COMPOSER_MAX_WIDTH}px`, minWidth: `${COMPOSER_MIN_WIDTH}px`, maxHeight: `${preferredMaxHeight}px`, minHeight: `${minUsableHeight}px` })
      const naturalSize = { width: card.offsetWidth, height: card.offsetHeight }
      // Prompt and actions own their minimums. Recommendations are optional;
      // only references may need an additional inner scrollport in a dense canvas.
      const children = Array.from(card.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
      const cardStyle = getComputedStyle(card)
      const pixels = (value: string) => Number.parseFloat(value) || 0
      const fixedHeight = pixels(cardStyle.paddingTop) + pixels(cardStyle.paddingBottom)
        + pixels(cardStyle.borderTopWidth) + pixels(cardStyle.borderBottomWidth)
        + pixels(cardStyle.rowGap) * Math.max(0, children.length - 1)
        + children.reduce((sum, child) => {
          if (child === references || child.hasAttribute('data-node-effect-chips')) return sum
          return sum + (child.hasAttribute('data-node-composer-prompt') ? pixels(getComputedStyle(child).minHeight) : child.offsetHeight)
        }, 0)
      Object.assign(card.style, previousStyle)
      if (references) references.style.maxHeight = previousReferenceMaxHeight
      // 可用区要再扣掉画布左缘那条常驻工具条（`CanvasToolbar`）——它是固定停靠的画布 chrome，
      // 不是浮框要避让的「障碍物」（那套已经删了，见文件头注释）。现量它的真实矩形，
      // 不是抄一份硬编码宽度：工具条宽度由它自己的图标数、内边距决定，会随设计改动漂移。
      // 找不到（未挂载 / 只读画布没有它）或它这一屏根本不在竖直范围内时不收窄，退回原有边距。
      const leftDockRect = stage.querySelector<HTMLElement>(CANVAS_LEFT_DOCK_SELECTOR)?.getBoundingClientRect()
      const leftDockUsable = leftDockRect && leftDockRect.width > 0 && leftDockRect.bottom > stageRect.top && leftDockRect.top < stageRect.bottom
      const stageLeft = stageRect.left + (leftDockUsable ? Math.max(VIEWPORT_MARGIN, leftDockRect.right - stageRect.left + LEFT_DOCK_GAP) : VIEWPORT_MARGIN)
      dockElements = collectBottomDockElements(stage)
      const result = resolveAnchoredPlacement({
        stage: { left: stageLeft, right: stageRect.right - VIEWPORT_MARGIN, top: stageRect.top + VIEWPORT_MARGIN, bottom: stageRect.bottom - VIEWPORT_MARGIN },
        bottomDocks: dockElements.map((element) => element.getBoundingClientRect()),
        dockClearance: VIEWPORT_MARGIN,
        // 提示词最小高 + 底栏 + 内边距是「非收不可」的：放不下时宁可盖住节点一截，也不把底栏挤出卡外。
        minHeight: Math.max(fixedHeight, Math.min(minUsableHeight, naturalSize.height)),
        anchor: nodeRect,
        width: Math.min(COMPOSER_MAX_WIDTH, naturalSize.width),
        height: Math.min(preferredMaxHeight, naturalSize.height),
        gap: gap * canvasZoom,
        aboveClearance: aboveClearanceFromNodeChrome(nodeRect.top, aboveChromeElements().map((element) => element.getBoundingClientRect())),
      })
      const next = { left: (result.left - nodeRect.left) / canvasZoom, top: (result.top - nodeRect.top) / canvasZoom, maxWidth: result.width, maxHeight: result.height, referenceMaxHeight: Math.max(0, result.height - fixedHeight), flipUp: result.side === 'above' }
      setPlacement(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next)
    }

    recompute()
    // 卡片内容变高变宽 → 自然尺寸变了，要重算。这条只有 ResizeObserver 办得到。
    const resizeObserver = new ResizeObserver(recompute)
    resizeObserver.observe(anchor)

    // 另外两个入参（节点矩形、舞台矩形）**不能**只靠 ResizeObserver：
    //  · RO 报的是 border-box 的布局尺寸，看不见 transform——节点入场是一段 scale 动画，
    //    动画期间量到的节点矩形比最终小 11%，照它算出来的位置会永久偏掉（实测偏 22.7px，
    //    见 tests/ux/node-composer-placement.walk.mjs 的探针记录）；
    //  · RO 也看不见「尺寸没变、位置变了」——外壳面板开合会把整个 stage 平移走。
    // 生态里的标准答案就是每帧比对矩形（Floating UI `autoUpdate` 的 animationFrame 策略）。
    // 代价被两件事夹住：每帧只读两个 rect，值没变一个字都不写；画布拖动期间直接跳过——
    // 那时浮框本来就 invisible（见 NodeGenerationComposer 的 data-dragging 注释），
    // 而拖动是全仓最吃帧的动作，不该为一个看不见的浮框付 layout 读。
    // 底部停靠区也是入参：胶囊会因为 Nomi 坞收起而横移、缩放条会因为小地图开合而变高——
    // 位置变化 RO 看不见，所以把它们的矩形并进同一个每帧签名（只读缓存里那几块，不每帧查询 DOM）。
    const signatureOf = (rect: DOMRect) => `${rect.left},${rect.top},${rect.right},${rect.bottom}`
    const currentSignature = () => [nodeEl, stage, ...dockElements, ...aboveChromeElements()].map((element) => signatureOf(element.getBoundingClientRect())).join('|')
    let lastSignature = currentSignature()
    let frame = window.requestAnimationFrame(function watch() {
      frame = window.requestAnimationFrame(watch)
      if (stage.getAttribute(CANVAS_DRAGGING_ATTRIBUTE) === 'true') return
      const signature = currentSignature()
      if (signature === lastSignature) return
      lastSignature = signature
      recompute()
      lastSignature = currentSignature()
    })
    // 停靠区挂上/摘下（批量条出现、胶囊换位置）：同 useCanvasBottomDockRects 的订阅面，只看直接子节点。
    const scope = resolveBottomDockScope(stage)
    const mutationObserver = new MutationObserver(recompute)
    mutationObserver.observe(scope, { childList: true })
    if (scope !== stage) mutationObserver.observe(stage, { childList: true })
    return () => { window.cancelAnimationFrame(frame); resizeObserver.disconnect(); mutationObserver.disconnect() }
  }, [canvasOffset, canvasZoom, gap, minUsableHeight, node.id, node.position?.x, node.position?.y, node.result?.url, preferredMaxHeight, visualSize.height, visualSize.width])

  return { anchorRef, canvasZoom, ...placement }
}
