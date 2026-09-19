import React from 'react'
import type { GenerationCanvasNode, GenerationNodeResult } from '../model/generationCanvasTypes'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { computeMediaMetaPatch, MEDIA_DIMENSION_UPDATE_OPTIONS } from './nodeSizing'

type Measurement =
  | { kind: 'image' | 'video'; width: number; height: number; durationSeconds?: number }
  | { kind: 'card-info'; height: number }

/** A delayed decode/footer observer must never write dimensions into a newer result. */
export function computeNodeMediaMeasurementPatch(
  node: GenerationCanvasNode,
  expected: GenerationNodeResult | undefined,
  measurement: Measurement,
): { meta: Record<string, unknown> } | null {
  if (!expected || node.result?.id !== expected.id || node.result.url !== expected.url) return null
  if (measurement.kind === 'card-info') {
    if (!Number.isFinite(measurement.height) || measurement.height < 0 || node.meta?.cardInfoHeight === measurement.height) return null
    return { meta: { ...node.meta, cardInfoHeight: measurement.height } }
  }
  if (measurement.kind !== node.result.type) return null // Video posters are not decoded video dimensions.
  return computeMediaMetaPatch({ resultType: node.result.type, meta: node.meta || {}, ...measurement })
}

/** All canvas rendering modes share runtime measurements, without saves, events or undo entries. */
export function useNodeMediaMeasurement(node: GenerationCanvasNode) {
  const [infoElement, infoRef] = React.useState<HTMLDivElement | null>(null)
  const measure = React.useCallback((measurement: Measurement) => {
    const state = useGenerationCanvasStore.getState()
    const current = state.nodes.find(candidate => candidate.id === node.id)
    if (!current) return
    const patch = computeNodeMediaMeasurementPatch(current, node.result, measurement)
    if (patch) state.updateNode(node.id, patch, MEDIA_DIMENSION_UPDATE_OPTIONS)
  }, [node.id, node.result])
  React.useLayoutEffect(() => {
    if (!infoElement) return // Unmount/LOD is not removal of footer content.
    const update = () => measure({ kind: 'card-info', height: infoElement.offsetHeight })
    update() // Layout pixels including padding; independent of canvas zoom.
    const observer = new ResizeObserver(update)
    observer.observe(infoElement)
    return () => observer.disconnect()
  }, [infoElement, measure])
  return {
    infoRef,
    onImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => measure({ kind: 'image', width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }),
    onVideoMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => measure({ kind: 'video', width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight, durationSeconds: event.currentTarget.duration }),
  }
}
