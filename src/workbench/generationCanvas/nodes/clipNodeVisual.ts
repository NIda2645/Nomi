export type ClipNodeVisualMode = 'compact' | 'editing'

export function resolveClipNodeVisualMode(input: {
  hasClips: boolean
  editingOpen: boolean
  selectedClip: boolean
}): ClipNodeVisualMode {
  return input.hasClips && input.editingOpen && input.selectedClip ? 'editing' : 'compact'
}

function formatAxisTime(frame: number, fps: number): string {
  const seconds = Math.max(0, Math.round(frame / Math.max(1, fps)))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function formatClipNodeDuration(frame: number, fps: number): string {
  return formatAxisTime(frame, fps)
}

export type ClipNodeAxisTick = {
  frame: number
  ratio: number
  label: string
}

export function resolveClipNodeAxisTicks(durationFrames: number, fps: number, maxTicks = 5): ClipNodeAxisTick[] {
  const duration = Math.max(0, Math.round(durationFrames))
  const count = duration === 0 ? 1 : Math.max(2, Math.min(5, Math.round(maxTicks)))
  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1)
    const frame = Math.round(duration * ratio)
    return { frame, ratio, label: formatAxisTime(frame, fps) }
  })
}
