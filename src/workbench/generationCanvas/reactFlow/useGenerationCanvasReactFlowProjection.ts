import React from 'react'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'
import {
  toGenerationFlowEdges,
  toGenerationFlowNodes,
  type GenerationFlowEdge,
  type GenerationFlowNode,
} from './generationCanvasReactFlowAdapter'

type ProjectionOptions = {
  nodes: readonly GenerationCanvasNode[]
  edges: readonly GenerationCanvasEdge[]
  /** Optional endpoint map for synthetic/collapsed group edge projections. */
  edgeNodeById?: ReadonlyMap<string, GenerationCanvasNode>
  selectedNodeIds: readonly string[]
  selectedEdgeId: string | null
  readOnly: boolean
}

export function useGenerationCanvasReactFlowProjection({
  nodes,
  edges,
  edgeNodeById,
  selectedNodeIds,
  selectedEdgeId,
  readOnly,
}: ProjectionOptions): {
  selectedSet: Set<string>
  nodeById: Map<string, GenerationCanvasNode>
  flowNodes: GenerationFlowNode[]
  flowEdges: GenerationFlowEdge[]
} {
  const selectedSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])
  const nodeById = React.useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const edgeNodes = edgeNodeById ?? nodeById
  const previousFlowNodesRef = React.useRef<GenerationFlowNode[]>([])
  const flowNodes = React.useMemo(() => {
    const next = toGenerationFlowNodes(nodes, selectedSet, readOnly, previousFlowNodesRef.current)
    previousFlowNodesRef.current = next
    return next
  }, [nodes, readOnly, selectedSet])
  const previousFlowEdgesRef = React.useRef<GenerationFlowEdge[]>([])
  const flowEdges = React.useMemo(() => {
    const next = toGenerationFlowEdges(edges, edgeNodes, {
      readOnly,
      selectedEdgeId,
      selectedNodeIds: selectedSet,
      previousEdges: previousFlowEdgesRef.current,
    })
    previousFlowEdgesRef.current = next
    return next
  }, [edgeNodes, edges, readOnly, selectedEdgeId, selectedSet])

  return { selectedSet, nodeById, flowNodes, flowEdges }
}
