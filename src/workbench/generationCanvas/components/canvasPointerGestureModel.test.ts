import { describe, expect, it } from 'vitest'
import {
  canvasDragExceededThreshold,
  isCanvasCapturePanPointer,
  isCanvasPanButtonHeld,
  isCanvasContextMenuPointer,
  resolveCanvasPanButtonFromMove,
  resolveCanvasPointerDownAction,
  shouldFinishCanvasConnection,
  shouldPreventDefaultForCanvasPanStart,
} from './canvasPointerGestureModel'

describe('generation canvas pointer arbitration', () => {
  it('gives blank primary drag to panning without a modifier', () => {
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: false,
        shiftKey: false,
        interactiveTarget: false,
        readOnly: false,
      }),
    ).toBe('pan')
  })

  it('keeps blank primary drag panning in read-only canvases too', () => {
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: false,
        shiftKey: false,
        interactiveTarget: false,
        readOnly: true,
      }),
    ).toBe('pan')
  })

  it('moves box selection behind Shift, and only where a selection can change', () => {
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: false,
        shiftKey: true,
        interactiveTarget: false,
        readOnly: false,
      }),
    ).toBe('marquee')
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: false,
        shiftKey: true,
        interactiveTarget: false,
        readOnly: true,
      }),
    ).toBe('ignore')
  })

  it.each([1, 2])('gives button %s to explicit pan even over an interactive target', (button) => {
    expect(
      resolveCanvasPointerDownAction({
        button,
        spaceHeld: false,
        shiftKey: false,
        interactiveTarget: true,
        readOnly: false,
      }),
    ).toBe('pan')
  })

  it('gives Space + primary drag to explicit pan even over an interactive target', () => {
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: true,
        shiftKey: false,
        interactiveTarget: true,
        readOnly: false,
      }),
    ).toBe('pan')
  })

  it('leaves controls and nodes to themselves', () => {
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: false,
        shiftKey: false,
        interactiveTarget: true,
        readOnly: false,
      }),
    ).toBe('ignore')
    expect(
      resolveCanvasPointerDownAction({
        button: 0,
        spaceHeld: false,
        shiftKey: true,
        interactiveTarget: true,
        readOnly: false,
      }),
    ).toBe('ignore')
  })

  it('only lets the node-piercing chords take the capture phase', () => {
    expect(isCanvasCapturePanPointer({ button: 0, spaceHeld: true })).toBe(true)
    expect(isCanvasCapturePanPointer({ button: 1, spaceHeld: false })).toBe(true)
    expect(isCanvasCapturePanPointer({ button: 2, spaceHeld: false })).toBe(true)
    expect(isCanvasCapturePanPointer({ button: 0, spaceHeld: false })).toBe(false)
  })

  it('detects a pan chord that begins after the primary pointer is already down', () => {
    expect(resolveCanvasPanButtonFromMove({ buttons: 1, spaceHeld: true })).toBe(0)
    expect(resolveCanvasPanButtonFromMove({ buttons: 3, spaceHeld: false })).toBe(2)
    expect(resolveCanvasPanButtonFromMove({ buttons: 5, spaceHeld: false })).toBe(1)
    // 裸左键不在此认领：它此刻可能正在框选或拖节点。
    expect(resolveCanvasPanButtonFromMove({ buttons: 1, spaceHeld: false })).toBeNull()
  })

  it('models the complete chord lifecycle while the primary pointer stays down', () => {
    expect(isCanvasPanButtonHeld(2, { buttons: 3 })).toBe(true)
    expect(isCanvasPanButtonHeld(2, { buttons: 1 })).toBe(false)
    expect(isCanvasPanButtonHeld(1, { buttons: 5 })).toBe(true)
    expect(isCanvasPanButtonHeld(1, { buttons: 1 })).toBe(false)
    expect(isCanvasPanButtonHeld(0, { buttons: 1 })).toBe(true)
    expect(isCanvasPanButtonHeld(0, { buttons: 0 })).toBe(false)
  })

  it('uses the shared four-pixel drag threshold on either axis', () => {
    expect(canvasDragExceededThreshold(0, 0, 3, 3)).toBe(false)
    expect(canvasDragExceededThreshold(0, 0, 4, 0)).toBe(true)
    expect(canvasDragExceededThreshold(0, 0, 0, -4)).toBe(true)
  })

  it('only lets primary pointer-up finish a connection', () => {
    expect(shouldFinishCanvasConnection(0)).toBe(true)
    expect(shouldFinishCanvasConnection(0, true)).toBe(false)
    expect(shouldFinishCanvasConnection(1)).toBe(false)
    expect(shouldFinishCanvasConnection(2)).toBe(false)
  })

  it('keeps right-button default behavior until drag distance decides whether to show its menu', () => {
    expect(shouldPreventDefaultForCanvasPanStart(0)).toBe(true)
    expect(shouldPreventDefaultForCanvasPanStart(1)).toBe(true)
    expect(shouldPreventDefaultForCanvasPanStart(2)).toBe(false)
  })

  it('treats macOS Ctrl + primary as the native secondary-click equivalent', () => {
    expect(isCanvasContextMenuPointer(2, false, 'Win32')).toBe(true)
    expect(isCanvasContextMenuPointer(0, true, 'MacIntel')).toBe(true)
    expect(isCanvasContextMenuPointer(0, true, 'iPad')).toBe(true)
    expect(isCanvasContextMenuPointer(0, true, 'Win32')).toBe(false)
    expect(isCanvasContextMenuPointer(0, false, 'MacIntel')).toBe(false)
  })
})
