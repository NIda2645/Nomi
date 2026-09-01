// Class-level test for the off-canvas node subscription boundary (R21 · suspect
// #1/#4 remediation). Proves the invariant the boundary owns:
//
//   "A high-frequency transient value (live drag position) must not broadcast
//    into React re-renders of consumers that do not depend on it."
//
// Concretely: a position-only store mutation (exactly what `moveNode` does on
// every drag mousemove) MUST leave the derived projection reference-identical so
// Zustand's Object.is bails the subscription; any real field change (title /
// status / category / result / …) MUST produce a fresh reference so the change
// still propagates. We drive the REAL store's `moveNode`/`updateNode` so the
// test tracks the production write path, not a hand-rolled immer stand-in.

import { beforeEach, describe, expect, it } from 'vitest'
import { useGenerationCanvasStore } from './generationCanvasStore'
import {
  __resetStableCanvasNodesCacheForTests,
  filterNodesStable,
  selectStableCanvasNodes,
} from './canvasNodeProjection'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

function node(id: string, overrides: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode {
  return {
    id,
    kind: 'image',
    title: id,
    position: { x: 10, y: 20 },
    prompt: `${id} prompt`,
    categoryId: 'shots',
    ...overrides,
  }
}

function seed(nodes: GenerationCanvasNode[]): void {
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes, edges: [], groups: [] })
}

function project(): readonly GenerationCanvasNode[] {
  return selectStableCanvasNodes(useGenerationCanvasStore.getState())
}

describe('selectStableCanvasNodes — off-canvas subscription boundary', () => {
  beforeEach(() => {
    __resetStableCanvasNodesCacheForTests()
    seed([node('a'), node('b', { position: { x: 300, y: 0 } }), node('c', { position: { x: 0, y: 300 } })])
  })

  it('returns an identical reference across a position-only mutation (drag tick)', () => {
    const before = project()
    // Exactly the per-mousemove write the drag path performs.
    useGenerationCanvasStore.getState().moveNode('b', { x: 301, y: 1 }, { persist: false, emit: false })
    const after = project()

    // The store's real nodes array DID change reference (immer swap)…
    expect(useGenerationCanvasStore.getState().nodes).not.toBe(before)
    // …but the off-canvas projection is reference-stable → subscribers don't re-render.
    expect(after).toBe(before)
  })

  it('stays reference-stable across many consecutive drag ticks', () => {
    const before = project()
    for (let index = 0; index < 60; index += 1) {
      useGenerationCanvasStore.getState().moveNode('b', { x: 300 + index, y: index }, { persist: false, emit: false })
      expect(project()).toBe(before)
    }
  })

  it('publishes a new array but reuses every UNMOVED node object across a real move', () => {
    const before = project()
    const beforeById = new Map(before.map((entry) => [entry.id, entry]))
    // A committed move (persist) still only changes position → projection stays stable,
    // because the projection ignores position by construction.
    useGenerationCanvasStore.getState().moveNode('a', { x: 999, y: 999 }, { persist: false, emit: false })
    const after = project()
    expect(after).toBe(before)
    // And every element (including the moved node) keeps its projected reference,
    // since none of their non-position fields changed.
    for (const entry of after) expect(entry).toBe(beforeById.get(entry.id))
  })

  it('produces a NEW reference and a NEW entry when a non-position field changes', () => {
    const before = project()
    const beforeA = before.find((entry) => entry.id === 'a')
    useGenerationCanvasStore.getState().updateNode('a', { title: 'renamed' }, { persist: false, emit: false })
    const after = project()

    // Array reference changed → subscribers re-render (they must see the new title).
    expect(after).not.toBe(before)
    // The changed node got a fresh projected object…
    const afterA = after.find((entry) => entry.id === 'a')
    expect(afterA).not.toBe(beforeA)
    expect(afterA?.title).toBe('renamed')
    // …while untouched nodes kept their references (maximal reuse).
    const beforeB = before.find((entry) => entry.id === 'b')
    const afterB = after.find((entry) => entry.id === 'b')
    expect(afterB).toBe(beforeB)
  })

  it('reacts to status changes (task center / onboarding depend on this)', () => {
    const before = project()
    useGenerationCanvasStore.getState().updateNode('a', { status: 'success' }, { persist: false, emit: false })
    const after = project()
    expect(after).not.toBe(before)
    expect(after.find((entry) => entry.id === 'a')?.status).toBe('success')
  })

  it('reacts to result changes (asset pool / preview depend on this)', () => {
    const before = project()
    useGenerationCanvasStore
      .getState()
      .updateNode('a', { result: { id: 'r-a', createdAt: 0, type: 'image', url: 'nomi-local://x.png' } }, { persist: false, emit: false })
    const after = project()
    expect(after).not.toBe(before)
    expect(after.find((entry) => entry.id === 'a')?.result?.url).toBe('nomi-local://x.png')
  })

  it('reacts to add / remove (membership changes must propagate)', () => {
    const before = project()
    useGenerationCanvasStore.getState().addNode({ kind: 'image', categoryId: 'shots', position: { x: 5, y: 5 } })
    const afterAdd = project()
    expect(afterAdd).not.toBe(before)
    expect(afterAdd.length).toBe(before.length + 1)
  })
})

describe('filterNodesStable — suspect #4 amplification gate', () => {
  const a = node('a')
  const b = node('b', { categoryId: 'characters' })
  const c = node('c')

  it('returns the previous reference when the filtered result is element-wise identical', () => {
    const previous = filterNodesStable([], [a, b, c], (n) => n.categoryId === 'shots')
    expect(previous).toEqual([a, c])
    // New source array, same membership/order for this category → previous reference kept.
    const next = filterNodesStable(previous, [a, b, c], (n) => n.categoryId === 'shots')
    expect(next).toBe(previous)
  })

  it('publishes a new array when a member reference changes (e.g. that node was edited/dragged)', () => {
    const previous = filterNodesStable([], [a, b, c], (n) => n.categoryId === 'shots')
    const aMoved = { ...a, position: { x: 500, y: 500 } }
    const next = filterNodesStable(previous, [aMoved, b, c], (n) => n.categoryId === 'shots')
    expect(next).not.toBe(previous)
    expect(next[0]).toBe(aMoved)
  })

  it('publishes a new array when membership changes (a member is removed)', () => {
    const previous = filterNodesStable([], [a, b, c], (n) => n.categoryId === 'shots')
    expect(previous).toEqual([a, c])
    // Remove `a`, which IS in the filtered ('shots') set → the set shrinks.
    const next = filterNodesStable(previous, [b, c], (n) => n.categoryId === 'shots')
    expect(next).not.toBe(previous)
    expect(next).toEqual([c])
  })

  it('keeps the previous reference when a NON-member is removed (set unchanged)', () => {
    const previous = filterNodesStable([], [a, b, c], (n) => n.categoryId === 'shots')
    // Remove `b`, which is NOT in the 'shots' set → filtered result is identical.
    const next = filterNodesStable(previous, [a, c], (n) => n.categoryId === 'shots')
    expect(next).toBe(previous)
  })
})
