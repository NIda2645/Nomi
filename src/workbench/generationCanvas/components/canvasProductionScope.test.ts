import { describe, expect, it } from 'vitest'
import { createGenerationNode } from '../model/graphOps'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  eligibleGenerationNodeIds,
  groupGenerationNodesByExecutionKind,
  normalizeCanvasBatchConcurrency,
  readCanvasBatchConcurrency,
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

describe('shouldShowCanvasBatchGenerateDock', () => {
  it('shows only for an editable unselected canvas with pending work', () => {
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: false, selectedCount: 0, eligibleCount: 2 })).toBe(true)
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: false, selectedCount: 0, eligibleCount: 0 })).toBe(false)
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: false, selectedCount: 1, eligibleCount: 2 })).toBe(false)
    expect(shouldShowCanvasBatchGenerateDock({ readOnly: true, selectedCount: 0, eligibleCount: 2 })).toBe(false)
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
