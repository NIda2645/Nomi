import { describe, expect, it } from 'vitest'
import { createGenerationNode } from '../model/graphOps'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  eligibleGenerationNodeIds,
  groupGenerationNodesByExecutionKind,
  nodesInCanvasProductionScope,
  normalizeCanvasBatchConcurrency,
  readCanvasBatchConcurrency,
  resolveCanvasGenerationScope,
  shouldShowCanvasBatchGenerateDock,
  writeCanvasBatchConcurrency,
} from './canvasProductionScope'

function node(
  id: string,
  kind: GenerationCanvasNode['kind'],
  status: GenerationCanvasNode['status'],
  categoryId = 'shots',
): GenerationCanvasNode {
  return { ...createGenerationNode({ id, kind }), status, categoryId }
}

describe('eligibleGenerationNodeIds', () => {
  it('keeps only idle and failed generation nodes in the requested category', () => {
    const nodes = [
      node('idle-image', 'image', 'idle'),
      node('error-video', 'video', 'error'),
      node('success', 'image', 'success'),
      node('queued', 'video', 'queued'),
      node('running', 'text', 'running'),
      node('recoverable', 'audio', 'recoverable'),
      node('non-generation', 'whiteboard', 'idle'),
      node('other-category', 'image', 'idle', 'scene'),
    ]

    expect(eligibleGenerationNodeIds(nodes, { categoryId: 'shots' })).toEqual(['idle-image', 'error-video'])
  })

  it('limits a selected scope without changing node order', () => {
    const nodes = [node('a', 'image', 'idle'), node('b', 'video', 'error'), node('c', 'image', 'idle')]

    expect(eligibleGenerationNodeIds(nodes, { nodeIds: ['c', 'missing', 'a'] })).toEqual(['a', 'c'])
  })
})

describe('nodesInCanvasProductionScope', () => {
  it('uses the active category when there is no explicit node selection', () => {
    const nodes = [
      node('shot-a', 'image', 'idle', 'shots'),
      node('shot-b', 'video', 'success', 'shots'),
      node('scene-a', 'image', 'idle', 'scene'),
    ]

    expect(nodesInCanvasProductionScope(nodes, { categoryId: 'shots' }).map((item) => item.id)).toEqual([
      'shot-a',
      'shot-b',
    ])
  })

  it('uses an explicit node selection instead of the category scope', () => {
    const nodes = [node('shot-a', 'image', 'idle', 'shots'), node('scene-a', 'image', 'idle', 'scene')]

    expect(nodesInCanvasProductionScope(nodes, { nodeIds: ['scene-a'] }).map((item) => item.id)).toEqual(['scene-a'])
  })
})

describe('resolveCanvasGenerationScope', () => {
  it('uses the active category when there is no explicit selection', () => {
    expect(resolveCanvasGenerationScope('shots', [])).toEqual({ categoryId: 'shots' })
  })

  it('uses selected node ids when the canvas has an explicit selection', () => {
    expect(resolveCanvasGenerationScope('shots', ['scene-a'])).toEqual({ nodeIds: ['scene-a'] })
  })
})

describe('shouldShowCanvasBatchGenerateDock', () => {
  it('shows only for an editable unselected canvas with pending work', () => {
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: false, selectedCount: 0, eligibleCount: 2 })).toBe(true)
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: false, selectedCount: 0, eligibleCount: 0 })).toBe(false)
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: false, selectedCount: 1, eligibleCount: 2 })).toBe(false)
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: true, selectedCount: 0, eligibleCount: 2 })).toBe(false)
  })

  it('hides the dock only for the dismissed pending scope', () => {
    const scopeKey = 'idle-image\u0000error-video'
    const dismissed = {
      readOnly: false,
      selectedCount: 0,
      eligibleCount: 2,
      eligibleScopeKey: scopeKey,
      dismissedScopeKey: scopeKey,
    } as Parameters<typeof shouldShowCanvasBatchGenerateDock>[0]

    expect(shouldShowCanvasBatchGenerateDock(dismissed)).toBe(false)
    expect(
      shouldShowCanvasBatchGenerateDock({
        ...dismissed,
        eligibleScopeKey: 'idle-image',
        eligibleCount: 1,
      }),
    ).toBe(true)
  })
})

describe('groupGenerationNodesByExecutionKind', () => {
  it('separates mixed generation selections and ignores non-generation nodes', () => {
    const nodes = [
      node('image', 'image', 'idle'),
      node('character', 'character', 'idle'),
      node('video', 'video', 'idle'),
      node('text', 'text', 'idle'),
      node('board', 'whiteboard', 'idle'),
    ]

    expect(groupGenerationNodesByExecutionKind(nodes)).toEqual([
      { executionKind: 'image', nodeIds: ['image', 'character'], representativeKind: 'image' },
      { executionKind: 'video', nodeIds: ['video'], representativeKind: 'video' },
      { executionKind: 'text', nodeIds: ['text'], representativeKind: 'text' },
    ])
  })

  it('keeps the active-category image group available for the no-selection scope', () => {
    const nodes = [node('shot-image', 'image', 'idle', 'shots'), node('scene-image', 'image', 'idle', 'scene')]

    expect(groupGenerationNodesByExecutionKind(nodesInCanvasProductionScope(nodes, { categoryId: 'shots' }))).toEqual([
      { executionKind: 'image', nodeIds: ['shot-image'], representativeKind: 'image' },
    ])
  })
})

describe('canvas batch concurrency', () => {
  it.each([
    [undefined, 6],
    [Number.NaN, 6],
    [0, 1],
    [9, 8],
    [4.9, 4],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCanvasBatchConcurrency(input)).toBe(expected)
  })

  it('persists and restores the normalized preference', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    writeCanvasBatchConcurrency(9, storage)

    expect(readCanvasBatchConcurrency(storage)).toBe(8)
  })
})
