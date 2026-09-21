import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CANVAS_DRAGGING_ATTRIBUTE,
  CANVAS_DRAGGING_OWNER,
  setCanvasDragging,
} from './canvasDraggingFlag'

describe('canvas dragging flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays active until every drag owner releases its own lease', () => {
    const attributes = new Map<string, string>()
    const stage = {
      closest: () => stage,
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    } as unknown as Element
    vi.stubGlobal('document', { querySelector: () => stage })

    setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.reactFlowNode)
    setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.reactFlowViewport)
    setCanvasDragging(stage, false, CANVAS_DRAGGING_OWNER.reactFlowViewport)

    expect(attributes.get(CANVAS_DRAGGING_ATTRIBUTE)).toBe('true')

    setCanvasDragging(stage, false, CANVAS_DRAGGING_OWNER.reactFlowNode)
    expect(attributes.has(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
  })

  describe('the flag never outlives the pointer gesture (2026-09-22 stuck data-dragging)', () => {
    function setup() {
      const attributes = new Map<string, string>()
      const stage = {
        closest: () => stage,
        hasAttribute: (name: string) => attributes.has(name),
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        removeAttribute: (name: string) => attributes.delete(name),
      } as unknown as Element
      const listeners = new Map<string, Set<(event: Event) => void>>()
      const fakeWindow = {
        addEventListener: (name: string, fn: (event: Event) => void) => {
          if (!listeners.has(name)) listeners.set(name, new Set())
          listeners.get(name)!.add(fn)
        },
        removeEventListener: (name: string, fn: (event: Event) => void) => listeners.get(name)?.delete(fn),
        // 兜底收尾等一帧；测试里把「下一帧」攒起来，由 nextFrame() 显式推进。
        requestAnimationFrame: (fn: () => void) => { frames.push(fn); return frames.length },
      }
      const frames: Array<() => void> = []
      const nextFrame = () => { for (const fn of frames.splice(0)) fn() }
      vi.stubGlobal('document', { querySelector: () => stage })
      vi.stubGlobal('window', fakeWindow)
      const fire = (type: string, target: unknown = fakeWindow) => {
        for (const fn of [...(listeners.get(type) ?? [])]) fn({ type, target } as unknown as Event)
      }
      const listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
      return { attributes, stage, fire, listenerCount, nextFrame }
    }

    it('reported case: a viewport owner whose own release was skipped is cleared when the pointer lifts', () => {
      const { attributes, stage, fire, nextFrame } = setup()
      // 平移升起标志，但 React Flow 推迟 150ms 的 onMoveEnd 因为共享布尔被重置而没有释放它。
      setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.reactFlowViewport)
      expect(attributes.get(CANVAS_DRAGGING_ATTRIBUTE)).toBe('true')
      fire('pointerup')
      nextFrame()
      expect(attributes.has(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
    })

    it('a gesture that starts before the settle frame keeps its own flag', () => {
      const { attributes, stage, fire, nextFrame } = setup()
      setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.reactFlowViewport)
      fire('pointerup')
      setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.reactFlowNode)
      nextFrame()
      expect(attributes.get(CANVAS_DRAGGING_ATTRIBUTE)).toBe('true')
      fire('pointerup')
      nextFrame()
      expect(attributes.has(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
    })

    it('class: every owner is bounded by the gesture — pointercancel and window blur end it, a descendant blur does not', () => {
      const { attributes, stage, fire, nextFrame } = setup()
      for (const owner of Object.values(CANVAS_DRAGGING_OWNER)) {
        setCanvasDragging(stage, true, owner)
        fire('blur', { nodeName: 'BUTTON' })
        nextFrame()
        expect(attributes.get(CANVAS_DRAGGING_ATTRIBUTE)).toBe('true')
        fire(owner === CANVAS_DRAGGING_OWNER.group ? 'blur' : 'pointercancel')
        nextFrame()
        expect(attributes.has(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
        // 手势结束后 owner 迟到的释放是空操作，不会把下一次手势的标志摘掉。
        setCanvasDragging(stage, false, owner)
      }
    })

    it('a normal release disarms the guard, and a later gesture re-arms it', () => {
      const { attributes, stage, fire, listenerCount, nextFrame } = setup()
      setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.reactFlowNode)
      expect(listenerCount()).toBe(3)
      setCanvasDragging(stage, false, CANVAS_DRAGGING_OWNER.reactFlowNode)
      expect(listenerCount()).toBe(0)
      setCanvasDragging(stage, true, CANVAS_DRAGGING_OWNER.selection)
      expect(listenerCount()).toBe(3)
      fire('pointerup')
      nextFrame()
      expect(attributes.has(CANVAS_DRAGGING_ATTRIBUTE)).toBe(false)
      expect(listenerCount()).toBe(0)
    })
  })
})
