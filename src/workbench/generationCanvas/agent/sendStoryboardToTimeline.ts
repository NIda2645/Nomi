import { useWorkbenchStore } from '../../workbenchStore'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { sendGenerationNodeToTimeline } from './sendGenerationNodeToTimeline'
import { planStoryboardTimeline, type StoryboardTimelineUnitRole } from './storyboardTimelinePlan'
import type { TimelineState, TimelineTextClip, TimelineTransition } from '../../timeline/timelineTypes'

export type SendStoryboardToTimelineResult = {
  ok: boolean
  total: number
  sent: Array<{ nodeId: string; clipId: string; trackType: string; startFrame: number; role?: StoryboardTimelineUnitRole }>
  skipped: Array<{ nodeId: string; reason: string }>
}

/** 时间轴当前最右端帧（append 落点）：两轨所有 clip 的 endFrame 取最大，空轴则 0。 */
function timelineEndFrame(timeline: TimelineState): number {
  let end = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.endFrame > end) end = clip.endFrame
    }
  }
  return end
}

/** 时间轴上已落 clip 的 sourceNodeId 集合（跨两轨）。clip.sourceNodeId === 排片单位 nodeId。 */
function timelineSourceNodeIds(timeline: TimelineState): Set<string> {
  const ids = new Set<string>()
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.sourceNodeId) ids.add(clip.sourceNodeId)
    }
  }
  return ids
}

/** Prefer an authored subtitle; dialogue is the honest fallback when no subtitle was supplied. */
export function storyboardCaptionText(node: { meta?: Record<string, unknown> }): string | undefined {
  const meta = node.meta || {}
  for (const key of ['subtitle', 'dialogue']) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function materializeStoryboardCaption(nodeId: string, clip: { startFrame: number; endFrame: number }, text: string): void {
  const store = useWorkbenchStore.getState()
  const timeline = store.timeline
  // arrange is append-idempotent, but manual “send selected” can be repeated after moving a clip.
  // Source provenance—not a generated random text id—keeps one storyboard subtitle per shot.
  if (timeline.textClips.some((candidate) => candidate.sourceNodeId === nodeId)) return
  const textClip: TimelineTextClip = {
    id: `storyboard-caption-${nodeId.replace(/[^A-Za-z0-9._-]+/g, '-')}`,
    sourceNodeId: nodeId,
    text,
    style: 'caption',
    startFrame: clip.startFrame,
    endFrame: clip.endFrame,
  }
  store.setTimeline({ ...timeline, textClips: [...timeline.textClips, textClip] })
}

function transitionFromNode(node: { meta?: Record<string, unknown> }): Omit<TimelineTransition, 'fromClipId' | 'toClipId'> | undefined {
  const raw = node.meta?.transition
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const type = record.type
  if (!['cut', 'dissolve', 'fade', 'match_cut', 'whip_pan'].includes(String(type))) return undefined
  const durationFrames = Number.isInteger(record.durationFrames) && Number(record.durationFrames) > 0
    ? Number(record.durationFrames)
    : undefined
  return { type: type as TimelineTransition['type'], ...(durationFrames ? { durationFrames } : {}) }
}

/**
 * append 幂等：把已在时间轴上的单位（按 sourceNodeId）滤掉。
 * 选「跳过」而非「替换」——arrange 是「追加整条故事板到末尾」的语义（用户拍板），
 * 重复触发不应把已排好（可能用户已手动调过位/裁过）的 clip 再复制一份到末尾。
 * 跳过的单位回报 reason=already_on_timeline，让 LLM/调用方知道为何没动它。
 * 纯函数：不读 store，便于单测。
 */
export function partitionUnitsByTimelinePresence<T extends { nodeId: string }>(
  units: ReadonlyArray<T>,
  presentSourceNodeIds: ReadonlySet<string>,
): { kept: T[]; skipped: Array<{ nodeId: string; reason: string }> } {
  const kept: T[] = []
  const skipped: Array<{ nodeId: string; reason: string }> = []
  for (const unit of units) {
    if (presentSourceNodeIds.has(unit.nodeId)) {
      skipped.push({ nodeId: unit.nodeId, reason: 'already_on_timeline' })
    } else {
      kept.push(unit)
    }
  }
  return { kept, skipped }
}

/**
 * 把一组「排片单位」（已按剧本镜序排好）逐个落到时间轴：每个 clip 落自然轨
 * （视频→媒体轨、占位图→图片轨），cursor 在两轨间顺序累加——时间上首尾相接、
 * 不重叠，导出时跨两轨取当前帧活动 clip，成片连续。两个入口共用此核心。
 */
function placeUnitsSequentially(
  units: ReadonlyArray<{ nodeId: string; role?: StoryboardTimelineUnitRole }>,
  startFrame: number,
): SendStoryboardToTimelineResult['sent'] {
  let cursor = Math.max(0, Math.floor(startFrame))
  const sent: SendStoryboardToTimelineResult['sent'] = []
  const sentNodes: Array<{ nodeId: string; clipId: string }> = []
  for (const unit of units) {
    const result = sendGenerationNodeToTimeline(
      {
        readGenerationNodes: () => useGenerationCanvasStore.getState().nodes,
        readTimeline: () => useWorkbenchStore.getState().timeline,
        addTimelineClipAtFrame: (clip, trackType, frame) => {
          useWorkbenchStore.getState().addTimelineClipAtFrame(clip, trackType, frame)
        },
        readTimelineAfterInsert: () => useWorkbenchStore.getState().timeline,
      },
      unit.nodeId,
      { startFrame: cursor },
    )
    if (result.ok) {
      cursor = result.startFrame + result.clip.frameCount
      const node = useGenerationCanvasStore.getState().nodes.find((candidate) => candidate.id === unit.nodeId)
      const caption = node ? storyboardCaptionText(node) : undefined
      if (caption) materializeStoryboardCaption(unit.nodeId, result.clip, caption)
      sentNodes.push({ nodeId: unit.nodeId, clipId: result.clip.id })
      sent.push({
        nodeId: unit.nodeId,
        clipId: result.clip.id,
        trackType: result.trackType,
        startFrame: result.startFrame,
        ...(unit.role ? { role: unit.role } : {}),
      })
    }
  }
  // Transitions are authored metadata, not a count of adjacent cuts. Only an explicit
  // transition on the preceding shot becomes a timeline entry; missing metadata remains a cut.
  if (sentNodes.length > 1) {
    const canvasNodes = useGenerationCanvasStore.getState().nodes
    const existing = useWorkbenchStore.getState().timeline.transitions || []
    const additions: TimelineTransition[] = []
    for (let index = 0; index < sentNodes.length - 1; index += 1) {
      const transition = transitionFromNode(canvasNodes.find((node) => node.id === sentNodes[index].nodeId) || {})
      if (!transition) continue
      const pair = { fromClipId: sentNodes[index].clipId, toClipId: sentNodes[index + 1].clipId, ...transition }
      if (existing.some((candidate) => candidate.fromClipId === pair.fromClipId && candidate.toClipId === pair.toClipId)
        || additions.some((candidate) => candidate.fromClipId === pair.fromClipId && candidate.toClipId === pair.toClipId)) continue
      additions.push(pair)
    }
    if (additions.length) {
      const timeline = useWorkbenchStore.getState().timeline
      useWorkbenchStore.getState().setTimeline({ ...timeline, transitions: [...(timeline.transitions || []), ...additions] })
    }
  }
  return sent
}

/**
 * 手动「发送到时间轴」（工具栏按钮，作用于选中子集）：按 `shotIndex` 镜序把选中节点
 * 铺到时间轴（从播放头开始）。排序与 Agent 路径共享同一份真相（shotIndex），
 * 不再用不可靠的连线拓扑。
 */
export function sendStoryboardToTimeline(nodeIds: readonly string[]): SendStoryboardToTimelineResult {
  const canvasState = useGenerationCanvasStore.getState()
  const { units, skipped } = planStoryboardTimeline(canvasState.nodes, canvasState.edges, nodeIds)
  const startFrame = Math.max(0, Math.floor(useWorkbenchStore.getState().timeline.playheadFrame ?? 0))
  const sent = placeUnitsSequentially(units, startFrame)
  const skippedById = new Map(skipped.map((item) => [item.nodeId, item]))
  for (const item of sent) skippedById.delete(item.nodeId)
  return { ok: sent.length > 0, total: units.length, sent, skipped: [...skippedById.values()] }
}

export type ArrangeStoryboardToTimelineOptions = {
  /** 排片范围：省略 = 整条故事板（所有镜头节点）；给定 = 仅这些节点。 */
  nodeIds?: readonly string[]
}

/**
 * Agent 入口 arrange_storyboard_to_timeline：把整条（或指定子集）故事板按剧本镜序
 * **追加**到时间轴末尾（用户拍板：追加语义，非破坏现有 clip）。视频优先、缺视频走
 * 关键帧占位、未生成跳过并回报——排序/选片全在纯函数里，LLM 只负责触发。
 */
export function arrangeStoryboardToTimeline(
  options: ArrangeStoryboardToTimelineOptions = {},
): SendStoryboardToTimelineResult {
  const canvasState = useGenerationCanvasStore.getState()
  const { units, skipped } = planStoryboardTimeline(canvasState.nodes, canvasState.edges, options.nodeIds)
  const timeline = useWorkbenchStore.getState().timeline
  // append 幂等：滤掉已在时间轴上的单位（按 sourceNodeId），避免重复触发把同一节点
  // 再复制一份到末尾（clip id 含 startFrame，末尾 startFrame 不同 → 旧逻辑会生成重复 clip）。
  const { kept, skipped: alreadyPlaced } = partitionUnitsByTimelinePresence(units, timelineSourceNodeIds(timeline))
  const startFrame = timelineEndFrame(timeline)
  const sent = placeUnitsSequentially(kept, startFrame)
  return { ok: sent.length > 0, total: units.length, sent, skipped: [...skipped, ...alreadyPlaced] }
}
