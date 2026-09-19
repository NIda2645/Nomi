import { afterEach, expect, it, vi } from 'vitest'
import * as dragging from './canvasDraggingFlag'
import { resolveAnchoredPlacement } from '../nodes/anchoredPlacement'

afterEach(() => vi.unstubAllGlobals())

it('does not release another canvas when the original gesture element is detached', () => {
  const attributes = new Map<string, string>()
  const stage = {
    closest: () => stage,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  } as unknown as Element
  const detached = { closest: () => null } as unknown as Element
  vi.stubGlobal('document', { querySelector: () => stage })
  const api = dragging as unknown as {
    setCanvasDragging?: (origin: Element, active: boolean, owner: string) => void
    beginCanvasDragging: (origin: Element, owner: string) => { release(): void }
  }
  if (api.setCanvasDragging) {
    api.setCanvasDragging(stage, true, dragging.CANVAS_DRAGGING_OWNER.node)
    api.setCanvasDragging(detached, false, dragging.CANVAS_DRAGGING_OWNER.node)
  } else {
    const original = api.beginCanvasDragging(stage, dragging.CANVAS_DRAGGING_OWNER.node)
    api.beginCanvasDragging(detached, dragging.CANVAS_DRAGGING_OWNER.node).release()
    expect(attributes.get(dragging.CANVAS_DRAGGING_ATTRIBUTE)).toBe('true')
    original.release()
    return
  }
  expect(attributes.get(dragging.CANVAS_DRAGGING_ATTRIBUTE)).toBe('true')
})

it('keeps the editor measurable when the selected node fills the stage', () => {
  const stage = { left: 0, top: 0, right: 1000, bottom: 800 }
  const placement = resolveAnchoredPlacement({ stage, anchor: stage, width: 400, height: 200, gap: 12, aboveClearance: 0 })
  expect(placement.height).toBeGreaterThan(0)
  expect(placement.top).toBeGreaterThanOrEqual(stage.top)
  expect(placement.top + placement.height).toBeLessThanOrEqual(stage.bottom)
})
