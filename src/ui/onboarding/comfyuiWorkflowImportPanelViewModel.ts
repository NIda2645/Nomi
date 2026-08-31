import {
  mediaBindingsFromAnalysis,
  normalizeBinding,
  uniqueParamKey,
  workflowMediaBindings,
  type WorkflowAnalysis,
  type WorkflowBinding,
  type WorkflowCandidate,
  type WorkflowImageBinding,
  type WorkflowOutputCandidate,
} from './comfyuiWorkflowBinding'

export type MediaBindingRow = WorkflowCandidate & {
  checked: boolean
  binding?: WorkflowImageBinding
}

export function bindingFromAnalysis(analysis: WorkflowAnalysis): WorkflowBinding {
  const {
    firstFrameNodeId: _firstFrameNodeId,
    firstFrameInputKey: _firstFrameInputKey,
    lastFrameNodeId: _lastFrameNodeId,
    lastFrameInputKey: _lastFrameInputKey,
    sourceVideoNodeId: _sourceVideoNodeId,
    sourceVideoInputKey: _sourceVideoInputKey,
    ...withoutLegacyRoles
  } = analysis.suggested
  return normalizeBinding({
    ...withoutLegacyRoles,
    images: mediaBindingsFromAnalysis(analysis),
  })
}

export function mediaBindingRows(analysis: WorkflowAnalysis, binding: WorkflowBinding): MediaBindingRow[] {
  const defaults = mediaBindingsFromAnalysis(analysis)
  const current = binding.images !== undefined ? binding.images : defaults
  return analysis.imageInputs.map((candidate) => {
    const found = current.find((item) => item.nodeId === candidate.nodeId && item.inputKey === candidate.inputKey)
    return { ...candidate, checked: Boolean(found), ...(found ? { binding: found } : {}) }
  })
}

export function setMediaBinding(
  binding: WorkflowBinding,
  candidate: WorkflowCandidate,
  checked: boolean,
): WorkflowBinding {
  const existing = workflowMediaBindings(binding)
  if (!checked) {
    const clearLegacy = (nodeId: string | undefined, inputKey: string | undefined) =>
      nodeId === candidate.nodeId && inputKey === candidate.inputKey ? undefined : nodeId
    return {
      ...binding,
      images: existing.filter((item) => !(item.nodeId === candidate.nodeId && item.inputKey === candidate.inputKey)),
      firstFrameNodeId: clearLegacy(binding.firstFrameNodeId, binding.firstFrameInputKey),
      firstFrameInputKey: clearLegacy(binding.firstFrameNodeId, binding.firstFrameInputKey) ? binding.firstFrameInputKey : undefined,
      lastFrameNodeId: clearLegacy(binding.lastFrameNodeId, binding.lastFrameInputKey),
      lastFrameInputKey: clearLegacy(binding.lastFrameNodeId, binding.lastFrameInputKey) ? binding.lastFrameInputKey : undefined,
      sourceVideoNodeId: clearLegacy(binding.sourceVideoNodeId, binding.sourceVideoInputKey),
      sourceVideoInputKey: clearLegacy(binding.sourceVideoNodeId, binding.sourceVideoInputKey) ? binding.sourceVideoInputKey : undefined,
    }
  }
  if (existing.some((item) => item.nodeId === candidate.nodeId && item.inputKey === candidate.inputKey)) return binding
  const mediaKind = candidate.mediaKind === 'video' ? 'video' : 'image'
  const baseKey = `comfy_${mediaKind}_${existing.length + 1}`
  const paramKey = uniqueParamKey(baseKey, [...existing, ...(binding.params ?? binding.numeric ?? [])])
  return {
    ...binding,
    images: [...existing, {
      nodeId: candidate.nodeId,
      inputKey: candidate.inputKey,
      paramKey,
      label: candidate.title?.trim() || `${candidate.inputKey} #${candidate.nodeId}`,
      mediaKind,
    }],
  }
}

export function supportedOutputOptions(analysis: WorkflowAnalysis): WorkflowOutputCandidate[] {
  return analysis.outputNodes.filter((output) => output.kind !== 'unsupported')
}
