import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { beginCanvasDragging, CANVAS_DRAGGING_ATTRIBUTE, CANVAS_DRAGGING_OWNER } from './canvasDraggingFlag'

function stage() {
  const attrs = new Map<string, string>()
  const element = { isConnected: true, parentElement: null, closest: () => element,
    hasAttribute: (key: string) => attrs.has(key), getAttribute: (key: string) => attrs.get(key),
    setAttribute: (key: string, value: string) => attrs.set(key, value), removeAttribute: (key: string) => attrs.delete(key),
  } as unknown as Element
  return element
}
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('canvas gesture ownership', () => {
  it('captures original stage across detach and does not clear a new same-source gesture', () => {
    const a = stage(); const b = stage()
    const origin = { closest: () => a } as unknown as Element
    const first = beginCanvasDragging(origin, CANVAS_DRAGGING_OWNER.node)
    const second = beginCanvasDragging(a, CANVAS_DRAGGING_OWNER.node)
    const other = beginCanvasDragging(b, CANVAS_DRAGGING_OWNER.node)
    Object.assign(origin, { closest: () => null }); first.release(); first.release()
    expect(a.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(true)
    expect(b.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(true)
    second.release()
    expect(a.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
    expect(b.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(true)
    other.release()
  })
  it('null origin cannot acquire the first stage in the document', () => {
    const a = stage()
    beginCanvasDragging(null, CANVAS_DRAGGING_OWNER.node).release()
    expect(a.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
  })
  it.each(['blur', 'pointercancel', 'lostpointercapture'])('cancels once on %s and removes listeners', (name) => {
    const a = stage(); const cancel = vi.fn()
    beginCanvasDragging(a, CANVAS_DRAGGING_OWNER.node, { onCancel: cancel, pointerId: 4 })
    window.dispatchEvent(Object.assign(new Event(name), { pointerId: 4 })); window.dispatchEvent(Object.assign(new Event(name), { pointerId: 4 }))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(a.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
  })
  it('pointer cancellation only releases the matching gesture', () => {
    const a = stage(); const b = stage()
    beginCanvasDragging(a, CANVAS_DRAGGING_OWNER.node, { pointerId: 4 })
    const other = beginCanvasDragging(b, CANVAS_DRAGGING_OWNER.node, { pointerId: 5 })
    window.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId: 4 }))
    expect(a.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
    expect(b.hasAttribute(CANVAS_DRAGGING_ATTRIBUTE)).toBe(true)
    other.release()
  })
})
