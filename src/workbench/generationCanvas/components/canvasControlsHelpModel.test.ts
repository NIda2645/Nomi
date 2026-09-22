import { describe, expect, it } from 'vitest'
import { canvasControlsHelpSections } from './canvasControlsHelpModel'

describe('canvas controls help model', () => {
  it('keeps the same five user-facing sections (LibTV grouping) for both gesture schemes', () => {
    expect(canvasControlsHelpSections('wheel-zoom', 'MacIntel').map((section) => section.id)).toEqual([
      'selection',
      'pan',
      'zoom',
      'create',
      'node',
    ])
    expect(canvasControlsHelpSections('modifier-zoom', 'Win32').map((section) => section.id)).toEqual([
      'selection',
      'pan',
      'zoom',
      'create',
      'node',
    ])
  })

  it('describes direct wheel zoom only in the mouse-first scheme', () => {
    const mouseFirst = canvasControlsHelpSections('wheel-zoom', 'MacIntel')
    const trackpadFirst = canvasControlsHelpSections('modifier-zoom', 'MacIntel')

    expect(mouseFirst.find((section) => section.id === 'zoom')?.rows.map((row) => row.shortcutKey)).toEqual([
      'wheel',
      'pinch',
      'modPlusMinus',
    ])
    expect(trackpadFirst.find((section) => section.id === 'zoom')?.rows.map((row) => row.shortcutKey)).toEqual([
      'modWheel',
      'pinch',
      'modPlusMinus',
    ])
  })

  it('adds wheel or two-finger pan only in the trackpad-first scheme', () => {
    const mousePanRows = canvasControlsHelpSections('wheel-zoom', 'MacIntel')
      .find((section) => section.id === 'pan')?.rows
    const trackpadPanRows = canvasControlsHelpSections('modifier-zoom', 'MacIntel')
      .find((section) => section.id === 'pan')?.rows

    expect(mousePanRows?.map((row) => row.shortcutKey)).toEqual(['blankDrag', 'spaceDrag', 'middleOrRightDrag'])
    expect(trackpadPanRows?.map((row) => row.shortcutKey)).toEqual([
      'blankDrag',
      'spaceDrag',
      'middleOrRightDrag',
      'wheelOrTwoFinger',
    ])
  })

  it('teaches the drag-pans-first contract: blank drag pans, Shift drag box-selects', () => {
    const sections = canvasControlsHelpSections('wheel-zoom', 'Win32')
    const selection = sections.find((section) => section.id === 'selection')?.rows ?? []
    const pan = sections.find((section) => section.id === 'pan')?.rows ?? []

    expect(pan[0]).toEqual({ shortcutKey: 'blankDrag', actionKey: 'pan' })
    expect(selection.map((row) => row.shortcutKey)).toEqual(['shiftDrag', 'shiftClick', 'blankClick', 'modA'])
    expect(selection.find((row) => row.shortcutKey === 'shiftDrag')?.actionKey).toBe('boxSelect')
    expect(selection.some((row) => row.actionKey === 'addBoxSelect')).toBe(false)
  })

  it('derives the displayed modifier from the platform without changing actions', () => {
    const macRows = canvasControlsHelpSections('modifier-zoom', 'MacIntel').flatMap((section) => section.rows)
    const windowsRows = canvasControlsHelpSections('modifier-zoom', 'Win32').flatMap((section) => section.rows)

    expect(macRows.find((row) => row.shortcutKey === 'modWheel')?.shortcutValues).toEqual({ mod: '⌘', alt: '⌥ Option', opt: '⌥', shift: '⇧' })
    expect(windowsRows.find((row) => row.shortcutKey === 'modWheel')?.shortcutValues).toEqual({ mod: 'Ctrl', alt: 'Alt', opt: 'Alt', shift: 'Shift' })
    expect(macRows.map((row) => row.actionKey)).toEqual(windowsRows.map((row) => row.actionKey))
  })

  it('lists Alt/⌥ drag-to-duplicate next to ⌘D duplicate in the create group, with the platform key name', () => {
    const macNode = canvasControlsHelpSections('wheel-zoom', 'MacIntel').find((section) => section.id === 'create')?.rows
    const winNode = canvasControlsHelpSections('wheel-zoom', 'Win32').find((section) => section.id === 'create')?.rows
    const keys = macNode?.map((row) => row.shortcutKey) ?? []
    expect(keys.indexOf('altDrag')).toBe(keys.indexOf('modD') + 1)
    expect(macNode?.find((row) => row.shortcutKey === 'altDrag')?.shortcutValues?.alt).toBe('⌥ Option')
    expect(winNode?.find((row) => row.shortcutKey === 'altDrag')?.shortcutValues?.alt).toBe('Alt')
  })
})
