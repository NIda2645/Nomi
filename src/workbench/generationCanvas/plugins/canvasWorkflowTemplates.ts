import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'

export type CanvasWorkflowTemplateNode = {
  sourceId: string
  node: GenerationCanvasNode
  relativePosition: { x: number; y: number }
}

export type CanvasWorkflowTemplate = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  nodes: CanvasWorkflowTemplateNode[]
  edges: GenerationCanvasEdge[]
}

export type InstantiatedCanvasWorkflow = {
  nodes: GenerationCanvasNode[]
  edges: GenerationCanvasEdge[]
}

export function isCanvasWorkflowTemplate(value: unknown): value is CanvasWorkflowTemplate {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CanvasWorkflowTemplate>
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' &&
    Array.isArray(candidate.nodes) && Array.isArray(candidate.edges) &&
    candidate.nodes.every((item) => Boolean(item && typeof item.sourceId === 'string' && item.node && typeof item.node === 'object' && item.relativePosition &&
      typeof item.relativePosition.x === 'number' && typeof item.relativePosition.y === 'number'))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function captureCanvasWorkflowTemplate(
  nodes: readonly GenerationCanvasNode[],
  edges: readonly GenerationCanvasEdge[],
  selectedNodeIds: readonly string[],
  name: string,
  id: string,
  now = Date.now(),
): CanvasWorkflowTemplate | null {
  const selected = nodes.filter((node) => selectedNodeIds.includes(node.id))
  if (!selected.length) return null
  const selectedIds = new Set(selected.map((node) => node.id))
  const origin = {
    x: Math.min(...selected.map((node) => node.position.x)),
    y: Math.min(...selected.map((node) => node.position.y)),
  }
  return {
    id,
    name: name.trim() || `流程 · ${selected.length} 个节点`,
    createdAt: now,
    updatedAt: now,
    nodes: selected.map((node) => ({
      sourceId: node.id,
      node: clone(node),
      relativePosition: { x: node.position.x - origin.x, y: node.position.y - origin.y },
    })),
    edges: clone(edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))),
  }
}

export function instantiateCanvasWorkflowTemplate(
  template: CanvasWorkflowTemplate,
  position: { x: number; y: number },
  createId: (kind: GenerationCanvasNode['kind']) => string,
  createEdgeId: (source: string, target: string, index: number) => string,
): InstantiatedCanvasWorkflow {
  const idMap = new Map<string, string>()
  const nodes = template.nodes.map(({ sourceId, node, relativePosition }) => {
    const id = createId(node.kind)
    idMap.set(sourceId, id)
    return {
      ...clone(node),
      id,
      position: { x: Math.round(position.x + relativePosition.x), y: Math.round(position.y + relativePosition.y) },
    }
  })
  const edges = template.edges.flatMap((edge, index) => {
    const source = idMap.get(edge.source)
    const target = idMap.get(edge.target)
    if (!source || !target) return []
    return [{ ...clone(edge), id: createEdgeId(source, target, index), source, target }]
  })
  return { nodes, edges }
}
