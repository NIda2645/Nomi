import type { ComfyGraph, OutputNodeCandidate, WorkflowBinding } from './comfyuiWorkflowImport'

type OutputKind = NonNullable<WorkflowBinding['outputKind']>
type ResolvedOutput = { outputNodeId: string; outputKind: OutputKind }

// File/preview outputs, not data types: SaveWEBM returns IMAGE internally but saves video.
// CreateVideo only builds an in-memory VIDEO; official nodes_video.py requires a saver after it.
export function comfyOutputKind(classType: string): OutputNodeCandidate['kind'] | undefined {
  if (/videocombine|savevideo|saveanimated|savewebp|savewebm/i.test(classType)) return 'video'
  if (/saveglb|preview3d|save3d|savemesh/i.test(classType)) return 'model3d'
  if (/saveimage|previewimage|maskpreview/i.test(classType)) return 'image'
  if (/saveaudio|savesvg|savewav|saveflac/i.test(classType)) return 'unsupported'
  return undefined
}

export function comfyOutputCandidates(graph: ComfyGraph): OutputNodeCandidate[] {
  return Object.entries(graph).flatMap(([nodeId, node]) => {
    const classType = node.class_type ?? ''
    const kind = comfyOutputKind(classType)
    return kind ? [{ nodeId, classType, kind }] : []
  })
}

export function suggestedComfyOutput(candidates: OutputNodeCandidate[]): ResolvedOutput | undefined {
  for (const kind of ['video', 'model3d', 'image'] as const) {
    const matching = candidates.filter((candidate) => candidate.kind === kind)
    const selected = matching.find((candidate) => /^(save|export)|videocombine/i.test(candidate.classType)) ?? matching[0]
    if (selected) return { outputNodeId: selected.nodeId, outputKind: kind }
  }
  return undefined
}

function downstreamVideoOutputs(graph: ComfyGraph, source: string): OutputNodeCandidate[] {
  const children = new Map<string, Set<string>>()
  for (const [nodeId, node] of Object.entries(graph)) {
    for (const input of Object.values(node.inputs ?? {})) {
      if (!Array.isArray(input) || input.length !== 2 || typeof input[0] !== 'string' || typeof input[1] !== 'number') continue
      const targets = children.get(input[0]) ?? new Set<string>()
      targets.add(nodeId)
      children.set(input[0], targets)
    }
  }
  const reachable = new Set([source])
  // Set iteration also visits newly added elements, with cycle protection.
  for (const nodeId of reachable) for (const child of children.get(nodeId) ?? []) reachable.add(child)
  return comfyOutputCandidates(graph).filter((candidate) => reachable.has(candidate.nodeId) && candidate.kind === 'video')
}

/** Selected output is authoritative. A stale label must never change the actual media contract. */
export function resolveComfyWorkflowOutput(graph: ComfyGraph, binding: WorkflowBinding): ResolvedOutput {
  const nodeId = binding.outputNodeId
  if (!nodeId) {
    const suggested = suggestedComfyOutput(comfyOutputCandidates(graph))
    if (suggested) return suggested
    throw new Error('工作流没有可用的成品输出，请添加保存图片或视频的输出节点。')
  }
  const node = graph[nodeId]
  if (!node) throw new Error(`成品输出节点 #${nodeId} 不存在，请重新选择输出节点。`)
  const classType = node.class_type ?? ''
  if (/^CreateVideo$/i.test(classType)) {
    const outputs = downstreamVideoOutputs(graph, nodeId)
    if (outputs.length === 1) return { outputNodeId: outputs[0].nodeId, outputKind: 'video' }
    throw new Error('CreateVideo 不是成品输出，请选择下游保存视频的节点。')
  }
  const kind = comfyOutputKind(classType)
  if (kind === 'unsupported') throw new Error(`暂不支持 ${classType} 的成品输出类型。`)
  // Explicit declarations remain available for custom nodes; absence is never guessed as image.
  const outputKind = kind ?? binding.outputKind
  if (!outputKind) throw new Error(`无法识别 ${classType} 的成品类型，请明确指定输出类型。`)
  return { outputNodeId: nodeId, outputKind }
}
