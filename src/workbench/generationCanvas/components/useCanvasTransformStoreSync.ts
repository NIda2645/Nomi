// 画布变换 → store 的同步闸：缩放即时落地，**纯平移节流**。
//
// 为什么要节流（2026-08-08「拖画布时所有节点都在渲染」的根因之一）：
// store 的 canvasZoom/canvasOffset 被节点侧广泛订阅——每写一次，画布上每个节点的 zustand
// 选择器都要重跑（其中 canRunGenerationNode 还要走一遍边表 = O(节点×边)），选中节点的
// composer 更会整块重渲并在 useLayoutEffect 里重新测量（getBoundingClientRect + 贴边翻转判定）。
// 平移若每帧写一次，就是每帧把这些全做一遍。而平移本身**根本不需要它**：画布位移走 CSS
// transform（合成层，见 GenerationCanvas 的 will-change-transform），与本 store 无关。
// 订阅方要 offset 只为「算屏幕坐标」（批量计划徽标、composer 贴边翻转），慢 100ms 无感。
//
// 缩放为什么不能节流：节点拖拽/八向缩放的换算直接读 getState().canvasZoom，
// 慢一帧鼠标与节点就错位（手感 bug）。缩放是离散事件，即时写代价也小。
import React from 'react'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'

type Offset = { x: number; y: number }

const PAN_STORE_SYNC_MS = 100

export function useCanvasTransformStoreSync(zoom: number, offset: Offset): void {
  const latestRef = React.useRef({ zoom, offset })
  latestRef.current = { zoom, offset }
  // 上一次真正写进 store 的 zoom 与时刻（NaN = 还没同步过，首帧必写）。
  const syncedRef = React.useRef({ zoom: Number.NaN, at: 0 })
  const timerRef = React.useRef<number | null>(null)

  const flush = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const { zoom: nextZoom, offset: nextOffset } = latestRef.current
    syncedRef.current = { zoom: nextZoom, at: Date.now() }
    useGenerationCanvasStore.getState().setCanvasTransform(nextZoom, nextOffset)
  }, [])

  React.useEffect(() => {
    if (zoom !== syncedRef.current.zoom) {
      flush()
      return
    }
    const waited = Date.now() - syncedRef.current.at
    if (waited >= PAN_STORE_SYNC_MS) {
      flush()
      return
    }
    if (timerRef.current !== null) return // 已排队，等那一次带上最新值（节流不是防抖：连续平移期间也会按拍补）
    timerRef.current = window.setTimeout(flush, PAN_STORE_SYNC_MS - waited)
  }, [flush, offset, zoom])

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )
}
