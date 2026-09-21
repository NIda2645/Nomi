import React from 'react'
import { CENTER_PLACEMENT_ANCHOR, type CanvasPlacement } from '../model/canvasPlacement'

type ClientPoint = { x: number; y: number }
type StageRect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>

/**
 * Cmd/Ctrl+V 的落点：鼠标最后一次停在画布舞台里的那一点；鼠标不在舞台上（在侧栏、时间轴、窗口外）
 * 才回退到舞台中央。两种都以粘贴物的**中心**压在这一点（tldraw `putContentOntoCurrentPage` /
 * Excalidraw `addElementsFromPasteOrLibrary` 同一约定，见 docs/plan/2026-09-21-alt-drag-duplicate.md）。
 *
 * 屏幕→画布只经画布内核换算（`toCanvasPoint` = React Flow screenToFlowPosition），这里不手算 offset/zoom。
 */
export function resolvePastePlacement(input: {
  lastPointer: ClientPoint | null
  stageRect: StageRect | null
  toCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number }
}): CanvasPlacement | null {
  const client = resolveStageClientPoint(input.lastPointer, input.stageRect)
  return client ? { point: input.toCanvasPoint(client.x, client.y), anchor: CENTER_PLACEMENT_ANCHOR } : null
}

/**
 * 「键盘动作落在哪」的视口坐标：鼠标在舞台里 → 那一点；否则舞台中央；舞台没量到 → null。
 * 粘贴（Cmd+V）与新建（Tab 打开添加菜单）共用这一个判据，不各记一份指针。
 */
export function resolveStageClientPoint(lastPointer: ClientPoint | null, stageRect: StageRect | null): ClientPoint | null {
  if (!stageRect || stageRect.width <= 0 || stageRect.height <= 0) return null
  const pointerInStage = lastPointer
    && lastPointer.x >= stageRect.left && lastPointer.x <= stageRect.right
    && lastPointer.y >= stageRect.top && lastPointer.y <= stageRect.bottom
  return pointerInStage
    ? lastPointer
    : { x: stageRect.left + stageRect.width / 2, y: stageRect.top + stageRect.height / 2 }
}

export function useCanvasPastePlacement(
  hostRef: React.RefObject<HTMLElement | null>,
  toCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number },
): { getPastePlacement: () => CanvasPlacement | null; getStageClientPoint: () => ClientPoint | null } {
  // 最后一次在舞台里的指针位置；离开舞台即清空（离开后按 V 应回到舞台中央，而不是离开前那一点）。
  const lastPointerRef = React.useRef<ClientPoint | null>(null)
  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const remember = (event: PointerEvent) => { lastPointerRef.current = { x: event.clientX, y: event.clientY } }
    const forget = () => { lastPointerRef.current = null }
    host.addEventListener('pointermove', remember, { capture: true, passive: true })
    host.addEventListener('pointerdown', remember, { capture: true, passive: true })
    host.addEventListener('pointerleave', forget)
    return () => {
      host.removeEventListener('pointermove', remember, { capture: true })
      host.removeEventListener('pointerdown', remember, { capture: true })
      host.removeEventListener('pointerleave', forget)
    }
  }, [hostRef])
  const getPastePlacement = React.useCallback(() => resolvePastePlacement({
    lastPointer: lastPointerRef.current,
    stageRect: hostRef.current?.getBoundingClientRect() ?? null,
    toCanvasPoint,
  }), [hostRef, toCanvasPoint])
  const getStageClientPoint = React.useCallback(
    () => resolveStageClientPoint(lastPointerRef.current, hostRef.current?.getBoundingClientRect() ?? null),
    [hostRef],
  )
  return React.useMemo(() => ({ getPastePlacement, getStageClientPoint }), [getPastePlacement, getStageClientPoint])
}
