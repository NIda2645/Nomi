import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionMode, type InternalNode, type XYPosition } from '@xyflow/react'
import {
  FLOW_SOURCE_RIGHT, FLOW_TARGET_LEFT, toGenerationFlowEdges, toGenerationFlowNodes,
  type GenerationFlowNode,
} from './generationCanvasReactFlowAdapter'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'

type Internal = InternalNode<GenerationFlowNode>
type Lookup = Map<string, Internal>
type Parents = Map<string, Map<string, Internal>>
type EdgePosition = { sourceX: number; sourceY: number; targetX: number; targetY: number }
// Resolve React Flow's actual installed dependency, not a separately pinned copy.
// Signatures below are the exercised subset of system's utils/store + edges/positions.
const require = createRequire(import.meta.url)
const system = createRequire(require.resolve('@xyflow/react'))('@xyflow/system') as {
  adoptUserNodes(nodes: GenerationFlowNode[], lookup: Lookup, parents: Parents): unknown
  nodeHasDimensions(node: Internal): boolean
  updateNodeInternals(updates: Map<string, { id: string; nodeElement: HTMLElement; force: boolean }>,
    lookup: Lookup, parents: Parents, root: HTMLElement): { updatedInternals: boolean }
  getEdgePosition(input: { id: string; sourceNode: Internal; targetNode: Internal;
    sourceHandle: string; targetHandle: string; connectionMode: ConnectionMode }): EdgePosition | null
}

afterEach(() => vi.unstubAllGlobals())

// Only browser layout inputs are fixtures. Real upstream code must create every
// measured dimension and handle bound; this does not test ResizeObserver delivery.
function layoutElement(position: XYPosition, width: number, height: number): HTMLElement {
  const handle = (source: boolean) => ({
    offsetWidth: 10, offsetHeight: 10,
    getAttribute: (name: string) => name === 'data-handleid'
      ? source ? FLOW_SOURCE_RIGHT : FLOW_TARGET_LEFT
      : source ? 'right' : 'left',
    getBoundingClientRect: () => ({
      left: position.x + (source ? width - 10 : 0), top: position.y + height / 2 - 5,
    }),
  })
  return {
    offsetWidth: width, offsetHeight: height,
    getBoundingClientRect: () => ({ left: position.x, top: position.y, width, height }),
    querySelectorAll: (selector: string) => [handle(selector === '.source')],
  } as unknown as HTMLElement
}

function framework() {
  vi.stubGlobal('window', {
    getComputedStyle: () => ({ transform: 'matrix(1, 0, 0, 1, 0, 0)' }),
    DOMMatrixReadOnly: class { m22 = 1 },
  })
  const lookup: Lookup = new Map()
  const parents: Parents = new Map()
  const viewport = { querySelector: () => ({}) } as unknown as HTMLElement
  return {
    lookup,
    adopt: (nodes: GenerationFlowNode[]) => system.adoptUserNodes(nodes, lookup, parents),
    measure: (node: GenerationCanvasNode, width: number, height: number) => {
      const update = { id: node.id, nodeElement: layoutElement(node.position, width, height), force: true }
      return system.updateNodeInternals(new Map([[node.id, update]]), lookup, parents, viewport)
    },
  }
}

const source: GenerationCanvasNode = {
  id: 'artifact', kind: 'agent-artifact', title: 'Artifact', position: { x: 10, y: 20 },
  size: { width: 360, height: 260 },
}
const target: GenerationCanvasNode = {
  id: 'target', kind: 'image', title: 'Target', position: { x: 600, y: 20 },
  size: { width: 240, height: 120 },
}

function withoutFrameworkDimensions(node: GenerationFlowNode): GenerationFlowNode {
  const copy = { ...node }
  delete copy.width
  delete copy.height
  return copy
}

describe('actual React Flow adoption and DOM measurement', () => {
  it('keeps reprojected nodes visible and rebuilds resized handle geometry for real edges', () => {
    const flow = framework()
    const first = toGenerationFlowNodes([source, target], new Set(), false)
    flow.adopt(first)
    flow.measure(source, 360, 260)
    flow.measure(target, 240, 120)
    const edge = toGenerationFlowEdges([{ id: 'edge', source: source.id, target: target.id }],
      new Map([source, target].map(node => [node.id, node])))[0]
    const position = () => system.getEdgePosition({ id: edge.id,
      sourceNode: flow.lookup.get(source.id)!, targetNode: flow.lookup.get(target.id)!,
      sourceHandle: edge.sourceHandle!, targetHandle: edge.targetHandle!, connectionMode: ConnectionMode.Strict })
    const original = position()
    expect(original).toMatchObject({ sourceX: 370, sourceY: 150, targetX: 600, targetY: 80 })
    expect(flow.lookup.get(source.id)?.internals.handleBounds?.source).toHaveLength(1)

    const selected = toGenerationFlowNodes([source, target], new Set([source.id]), false, first,
      { focusFlashNodeId: source.id })
    expect(selected[0]).not.toBe(first[0])
    flow.adopt(selected)
    const reprojected = flow.lookup.get(source.id)!
    expect(reprojected.measured.width).toBeUndefined()
    expect(reprojected.internals.handleBounds).toBeUndefined()
    expect(system.nodeHasDimensions(reprojected)).toBe(true)
    // Width/height prevent disappearance; handles still require real measurement.
    expect(position()).toBeNull()

    const resized = { ...source, size: { width: 400, height: 300 } }
    flow.adopt(toGenerationFlowNodes([resized, target], new Set([source.id]), false, selected))
    expect(flow.measure(resized, 400, 300).updatedInternals).toBe(true)
    expect(flow.lookup.get(source.id)?.measured).toEqual({ width: 400, height: 300 })
    const afterResize = position()
    expect(afterResize).not.toBeNull()
    expect(afterResize).toMatchObject({ sourceX: 410, sourceY: 170, targetX: 600, targetY: 80 })
    expect(afterResize).not.toEqual(original)
  })

  it('reproduces the CSS-only regression even after the node was successfully measured', () => {
    const flow = framework()
    const first = toGenerationFlowNodes([source], new Set(), false).map(withoutFrameworkDimensions)
    flow.adopt(first)
    flow.measure(source, 360, 260)
    expect(system.nodeHasDimensions(flow.lookup.get(source.id)!)).toBe(true)
    const replacement = toGenerationFlowNodes([source], new Set([source.id]), false, first,
      { focusFlashNodeId: source.id }).map(withoutFrameworkDimensions)
    flow.adopt(replacement)
    expect(replacement[0].style).toMatchObject({ width: 360, height: 260 })
    expect(system.nodeHasDimensions(flow.lookup.get(source.id)!)).toBe(false)
    expect(flow.lookup.get(source.id)?.internals.handleBounds).toBeUndefined()
  })
})
