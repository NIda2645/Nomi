import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canvasZoomShortcutDirection, isCanvasTextEditingContext } from './useCanvasShortcuts'

function targetWithEditableAncestor(editable: boolean): EventTarget {
  return {
    closest: () => editable ? {} : null,
  } as unknown as EventTarget
}

function shortcut(overrides: Partial<Parameters<typeof canvasZoomShortcutDirection>[0]> = {}) {
  return canvasZoomShortcutDirection({
    key: '',
    code: '',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    ...overrides,
  })
}

describe('canvasZoomShortcutDirection', () => {
  it('兼容主键盘与小键盘加减号', () => {
    expect(shortcut({ key: '+', code: 'Equal' })).toBe(1)
    expect(shortcut({ key: '=', code: 'Equal' })).toBe(1)
    expect(shortcut({ key: '+', code: 'NumpadAdd' })).toBe(1)
    expect(shortcut({ key: '-', code: 'Minus' })).toBe(-1)
    expect(shortcut({ key: '-', code: 'NumpadSubtract' })).toBe(-1)
  })

  it('兼容 Cmd，并忽略无修饰键与 Alt 组合', () => {
    expect(shortcut({ key: '+', code: 'Equal', ctrlKey: false, metaKey: true })).toBe(1)
    expect(shortcut({ key: '+', code: 'Equal', ctrlKey: false })).toBe(0)
    expect(shortcut({ key: '+', code: 'Equal', altKey: true })).toBe(0)
  })
})

describe('画布快捷键的文本编辑边界', () => {
  it('事件目标或当前焦点处于编辑器时都放行给文本编辑器', () => {
    const editable = targetWithEditableAncestor(true)
    const outside = targetWithEditableAncestor(false)

    expect(isCanvasTextEditingContext(editable, outside)).toBe(true)
    expect(isCanvasTextEditingContext(outside, editable)).toBe(true)
    expect(isCanvasTextEditingContext(outside, outside)).toBe(false)
  })

  it('事件目标是富文本内部的文本节点时沿父元素识别编辑态', () => {
    const textNodeTarget = {
      parentElement: targetWithEditableAncestor(true),
    } as unknown as EventTarget

    expect(isCanvasTextEditingContext(textNodeTarget, null)).toBe(true)
  })

  it('真实 paste 必须在编辑态早退前取消节点粘贴兜底', () => {
    const source = readFileSync(fileURLToPath(new URL('./useCanvasShortcuts.ts', import.meta.url)), 'utf8')
    const handler = source.match(/const handlePaste = \(event: ClipboardEvent\) => \{([\s\S]*?)\n {4}\}/)?.[1]

    expect(handler).toBeDefined()
    expect(handler?.indexOf('clearPasteFallback()')).toBeLessThan(handler?.indexOf('shouldIgnoreCanvasShortcut') ?? -1)
  })
})
