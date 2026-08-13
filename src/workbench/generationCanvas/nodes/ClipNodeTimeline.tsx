import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconCopy, IconScissors, IconTrash } from '@tabler/icons-react'
import { WorkbenchIconButton } from '../../../design/workbenchActions'
import { cn } from '../../../utils/cn'
import { pixelToFrame } from '../../timeline/timelineEdit'
import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'
import { resolveClipNodeTimelineLayout } from './clipNodeTimelineLayout'

type ClipNodeTimelineProps = {
  timeline: TimelineState
  selectedClipId?: string
  splitMode: boolean
  onSelectClip: (clipId: string) => void
  onMoveClip: (clipId: string, startFrame: number) => void
  onResizeClip: (clipId: string, edge: 'left' | 'right', deltaFrame: number) => void
  onSplitClip: (clipId: string, frame: number) => void
  onRemoveClip: (clipId: string) => void
  onDuplicateClip: (clipId: string) => void
  onToggleSplitMode: () => void
}

function ClipThumb({ clip }: { clip: TimelineClip }): JSX.Element {
  if (clip.type === 'image' && (clip.thumbnailUrl || clip.url)) {
    return <img src={clip.thumbnailUrl || clip.url} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
  }
  if (clip.type === 'video' && (clip.thumbnailUrl || clip.url)) {
    return <video src={clip.url} poster={clip.thumbnailUrl} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
  }
  return <span className="absolute inset-0 bg-nomi-ink-10" aria-hidden="true" />
}

function ClipHandle({ edge, clip, pxPerFrame, onResize }: { edge: 'left' | 'right'; clip: TimelineClip; pxPerFrame: number; onResize: ClipNodeTimelineProps['onResizeClip'] }): JSX.Element {
  const { t } = useTranslation()
  const beginResize = (event: React.PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const target = event.currentTarget
    const originX = event.clientX
    let appliedDelta = 0
    target.setPointerCapture(pointerId)
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = Math.round((moveEvent.clientX - originX) / Math.max(0.1, pxPerFrame))
      const nextDelta = delta - appliedDelta
      if (nextDelta === 0) return
      appliedDelta = delta
      onResize(clip.id, edge, nextDelta)
    }
    const handleUp = () => {
      target.releasePointerCapture(pointerId)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <button
      type="button"
      className={cn('absolute inset-y-0 z-30 w-3 cursor-ew-resize border-0 bg-transparent p-0', edge === 'left' ? 'left-0' : 'right-0')}
      aria-label={edge === 'left' ? t('generationCommon.clipNode.resizeStart') : t('generationCommon.clipNode.resizeEnd')}
      onPointerDown={beginResize}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="mx-auto block h-5 w-0.5 rounded-full bg-nomi-paper/90 shadow-nomi-sm" aria-hidden="true" />
    </button>
  )
}

function ClipItem({
  clip,
  selected,
  splitMode,
  pxPerFrame,
  left,
  width,
  onSelectClip,
  onMoveClip,
  onResizeClip,
  onSplitClip,
}: Pick<ClipNodeTimelineProps, 'onSelectClip' | 'onMoveClip' | 'onResizeClip' | 'onSplitClip'> & {
  clip: TimelineClip
  selected: boolean
  splitMode: boolean
  pxPerFrame: number
  left: number
  width: number
}): JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const { t } = useTranslation()

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (splitMode || event.shiftKey || (event.target as HTMLElement).closest('[data-clip-handle]')) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    const pointerId = event.pointerId
    const originX = event.clientX
    const originStart = clip.startFrame
    let lastStart = originStart
    target.setPointerCapture(pointerId)
    setDragging(true)
    const handleMove = (moveEvent: PointerEvent) => {
      const nextStart = Math.max(0, originStart + Math.round((moveEvent.clientX - originX) / Math.max(0.1, pxPerFrame)))
      if (nextStart === lastStart) return
      lastStart = nextStart
      onMoveClip(clip.id, nextStart)
    }
    const handleUp = () => {
      target.releasePointerCapture(pointerId)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      setDragging(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    const rect = ref.current?.getBoundingClientRect()
    if (splitMode && rect) {
      const frame = clip.startFrame + pixelToFrame(event.clientX - rect.left, Math.max(0.1, pxPerFrame))
      onSplitClip(clip.id, Math.min(clip.endFrame - 1, Math.max(clip.startFrame + 1, frame)))
      return
    }
    onSelectClip(clip.id)
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      data-testid="clip-node-clip"
      data-clip-id={clip.id}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'absolute inset-y-1 overflow-hidden rounded-nomi-sm border text-left shadow-nomi-sm',
        'cursor-grab select-none touch-none active:cursor-grabbing',
        clip.type === 'video' ? 'border-nomi-video/60 bg-nomi-video-soft' : 'border-nomi-accent/60 bg-nomi-accent-soft',
        selected ? 'ring-2 ring-inset ring-nomi-accent' : 'ring-1 ring-inset ring-transparent',
        dragging ? 'z-40 opacity-90' : 'z-10',
      )}
      style={{ left, width }}
      onPointerDown={beginDrag}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelectClip(clip.id)
        }
      }}
    >
      <ClipThumb clip={clip} />
      <span className="absolute inset-x-0 bottom-0 truncate bg-nomi-ink/70 px-1.5 py-1 text-micro font-medium text-nomi-paper">{clip.label || t('generationCommon.clipNode.timeline')}</span>
      {selected ? <>
        <span data-clip-handle="true"><ClipHandle edge="left" clip={clip} pxPerFrame={pxPerFrame} onResize={onResizeClip} /></span>
        <span data-clip-handle="true"><ClipHandle edge="right" clip={clip} pxPerFrame={pxPerFrame} onResize={onResizeClip} /></span>
      </> : null}
    </div>
  )
}

export default function ClipNodeTimeline({
  timeline,
  selectedClipId,
  splitMode,
  onSelectClip,
  onMoveClip,
  onResizeClip,
  onSplitClip,
  onRemoveClip,
  onDuplicateClip,
  onToggleSplitMode,
}: ClipNodeTimelineProps): JSX.Element {
  const { t } = useTranslation()
  const track = timeline.tracks[0]
  const clips = track?.clips ?? []
  const duration = Math.max(1, clips.reduce((max, clip) => Math.max(max, clip.endFrame), 1))
  const [axisWidth, setAxisWidth] = React.useState(420)
  const axisRef = React.useRef<HTMLDivElement | null>(null)
  const selectedClip = clips.find((clip) => clip.id === selectedClipId)

  React.useLayoutEffect(() => {
    const axis = axisRef.current
    if (!axis) return
    const update = () => setAxisWidth(Math.max(160, axis.clientWidth))
    update()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update)
      observer.observe(axis)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const pxPerFrame = axisWidth / duration

  return (
    <section className="grid gap-2" aria-label={t('generationCommon.clipNode.timeline')} onWheel={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
        <span className="text-micro font-medium text-nomi-ink-60">{t('generationCommon.clipNode.trim')}</span>
        <span className="flex-1" />
        <WorkbenchIconButton
          label={t('generationCommon.clipNode.split')}
          icon={<IconScissors size={14} />}
          className={splitMode ? 'bg-nomi-accent-soft text-nomi-accent' : ''}
          aria-pressed={splitMode}
          onClick={onToggleSplitMode}
        />
        <WorkbenchIconButton
          label={t('generationCommon.clipNode.duplicate')}
          icon={<IconCopy size={14} />}
          disabled={!selectedClip}
          onClick={() => selectedClip && onDuplicateClip(selectedClip.id)}
        />
        <WorkbenchIconButton
          label={t('generationCommon.clipNode.remove')}
          icon={<IconTrash size={14} />}
          disabled={!selectedClip}
          onClick={() => selectedClip && onRemoveClip(selectedClip.id)}
        />
      </div>
      <div ref={axisRef} className="relative h-16 overflow-hidden overscroll-contain rounded-nomi-sm border border-nomi-line bg-nomi-ink-05" onPointerDown={(event) => event.stopPropagation()}>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-1 text-micro text-nomi-ink-40" aria-hidden="true">
          <span>00:00</span><span>{Math.round(duration / Math.max(1, timeline.fps))}{t('generationCommon.clipNode.seconds')}</span>
        </div>
        {clips.map((clip) => {
          const layout = resolveClipNodeTimelineLayout(timeline, axisWidth).find((item) => item.id === clip.id)
          if (!layout) return null
          return (
            <ClipItem
              key={clip.id}
              clip={clip}
              selected={clip.id === selectedClipId}
              splitMode={splitMode}
              pxPerFrame={pxPerFrame}
              left={layout.left}
              width={layout.width}
              onSelectClip={onSelectClip}
              onMoveClip={onMoveClip}
              onResizeClip={onResizeClip}
              onSplitClip={onSplitClip}
            />
          )
        })}
        {!clips.length ? <div className="absolute inset-0 grid place-items-center text-micro text-nomi-ink-40">{t('generationCommon.clipNode.empty')}</div> : null}
      </div>
    </section>
  )
}
