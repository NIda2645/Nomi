import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlus } from '@tabler/icons-react'
import { WorkbenchIconButton } from '../../../design/workbenchActions'
import { useFilmstrip } from '../../../media/useFilmstrip'
import { cn } from '../../../utils/cn'
import type { TimelineClip, TimelineState } from '../../timeline/timelineTypes'
import { resolveClipNodeTimelineLayout, resolveClipNodeTimelineViewport } from './clipNodeTimelineLayout'
import { formatClipNodeDuration } from './clipNodeVisual'

type ClipNodeTimelineProps = {
  timeline: TimelineState
  selectedClipId?: string
  onSelectClip: (clipId: string, frame: number) => void
  onMoveClip: (clipId: string, startFrame: number) => void
  onResizeClip: (clipId: string, edge: 'left' | 'right', deltaFrame: number) => void
  onScrubPlayhead?: (frame: number) => void
  onAddMaterial?: () => void
}

function ClipThumb({ clip }: { clip: TimelineClip }): JSX.Element {
  const filmstrip = useFilmstrip(clip.type === 'video' && !clip.thumbnailUrl ? clip.url : '')
  if (clip.type === 'image' && (clip.thumbnailUrl || clip.url)) {
    return <img src={clip.thumbnailUrl || clip.url} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
  }
  if (clip.type === 'video' && clip.thumbnailUrl) {
    return <img src={clip.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
  }
  if (clip.type === 'video' && filmstrip?.status === 'ready') {
    return (
      <span
        className="absolute inset-0 bg-nomi-ink-05"
        style={{
          backgroundImage: `url(${JSON.stringify(filmstrip.url)})`,
          backgroundSize: `${filmstrip.tiles * 100}% 100%`,
          backgroundPosition: 'left center',
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />
    )
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
  pxPerFrame,
  left,
  width,
  onSelectClip,
  onMoveClip,
  onResizeClip,
}: Pick<ClipNodeTimelineProps, 'onSelectClip' | 'onMoveClip' | 'onResizeClip'> & {
  clip: TimelineClip
  selected: boolean
  pxPerFrame: number
  left: number
  width: number
}): JSX.Element {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const { t } = useTranslation()

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.shiftKey || (event.target as HTMLElement).closest('[data-clip-handle]')) return
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
    const ratio = rect?.width ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0
    const visibleFrames = Math.max(1, clip.endFrame - clip.startFrame)
    onSelectClip(clip.id, Math.min(clip.endFrame - 1, clip.startFrame + Math.floor(ratio * visibleFrames)))
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
          onSelectClip(clip.id, clip.startFrame)
        }
      }}
    >
      <ClipThumb clip={clip} />
      <span className="absolute inset-x-0 bottom-0 truncate bg-nomi-paper/80 px-1.5 py-1 text-micro font-medium text-nomi-ink">{clip.label || t('generationCommon.clipNode.timeline')}</span>
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
  onSelectClip,
  onMoveClip,
  onResizeClip,
  onScrubPlayhead,
  onAddMaterial,
}: ClipNodeTimelineProps): JSX.Element {
  const { t } = useTranslation()
  const track = timeline.tracks[0]
  const clips = track?.clips ?? []
  const [axisWidth, setAxisWidth] = React.useState(420)
  const axisRef = React.useRef<HTMLDivElement | null>(null)
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

  const viewport = React.useMemo(
    () => resolveClipNodeTimelineViewport({ viewportWidth: axisWidth, timeline }),
    [axisWidth, timeline],
  )
  const layouts = React.useMemo(() => resolveClipNodeTimelineLayout(timeline, viewport), [timeline, viewport])
  const ticks = React.useMemo(() => {
    const fps = Math.max(1, timeline.fps || 30)
    const tickCount = Math.floor(viewport.axisEndSeconds / 10)
    return Array.from({ length: tickCount + 1 }, (_, index) => {
      const seconds = index * 10
      const frame = Math.round(seconds * fps)
      return { frame, pixel: viewport.frameToPixel(frame), label: formatClipNodeDuration(frame, fps) }
    })
  }, [timeline.fps, viewport])

  const scrubAtClientX = (clientX: number): void => {
    const content = axisRef.current?.firstElementChild
    if (!(content instanceof HTMLElement)) return
    const rect = content.getBoundingClientRect()
    const frame = Math.min(viewport.timelineEndFrame, viewport.pixelToFrame(clientX - rect.left))
    onScrubPlayhead?.(frame)
  }

  const beginScrub = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('[data-testid="clip-node-clip"]') || target.closest('button')) return
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const currentTarget = event.currentTarget
    currentTarget.setPointerCapture(pointerId)
    scrubAtClientX(event.clientX)
    const move = (moveEvent: PointerEvent) => scrubAtClientX(moveEvent.clientX)
    const end = () => {
      if (currentTarget.hasPointerCapture(pointerId)) currentTarget.releasePointerCapture(pointerId)
      currentTarget.removeEventListener('pointermove', move)
      currentTarget.removeEventListener('pointerup', end)
      currentTarget.removeEventListener('pointercancel', end)
    }
    currentTarget.addEventListener('pointermove', move)
    currentTarget.addEventListener('pointerup', end)
    currentTarget.addEventListener('pointercancel', end)
  }

  return (
    <section className="grid gap-1.5" aria-label={t('generationCommon.clipNode.timeline')} onWheel={(event) => event.stopPropagation()}>
      <div
        ref={axisRef}
        className="relative h-20 min-w-0 overflow-x-auto overflow-y-hidden overscroll-contain rounded-nomi-sm border border-nomi-line bg-nomi-bg"
      >
        <div
          className="relative h-full"
          style={{ width: viewport.contentWidth, minWidth: '100%' }}
          onPointerDown={beginScrub}
          data-testid="clip-node-axis-content"
        >
          <div className="absolute top-1.5 h-5" style={{ left: viewport.leadingSlotWidth + viewport.axisInset, width: viewport.timelineWidth }} data-testid="clip-node-ruler" aria-label={t('generationCommon.clipNode.scrub')}>
            {ticks.map((tick, index) => (
              <span
                key={`${tick.frame}-${index}`}
                className={cn(
                  'absolute top-0 text-micro text-nomi-ink/55',
                  index === 0 ? 'translate-x-0' : '-translate-x-1/2',
                )}
                style={{ left: tick.pixel - viewport.leadingSlotWidth - viewport.axisInset }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute top-7 h-1 border-t border-nomi-paper/15" style={{ left: viewport.leadingSlotWidth + viewport.axisInset, width: viewport.timelineWidth }} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={`mark-${tick.frame}`} className="absolute top-0 h-2 border-l border-nomi-paper/20" style={{ left: tick.pixel - viewport.leadingSlotWidth - viewport.axisInset }} />
            ))}
          </div>
          <div className="absolute bottom-2 h-10" style={{ left: viewport.leadingSlotWidth + viewport.axisInset, width: viewport.timelineWidth }} data-testid="clip-node-media-lane">
            <span
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-nomi-accent"
              style={{ left: Math.max(0, viewport.frameToPixel(timeline.playheadFrame) - viewport.leadingSlotWidth - viewport.axisInset) }}
              data-testid="clip-node-playhead"
              aria-hidden="true"
            />
            {clips.map((clip) => {
              const layout = layouts.find((item) => item.id === clip.id)
              if (!layout) return null
              return (
                <ClipItem
                  key={clip.id}
                  clip={clip}
                  selected={clip.id === selectedClipId}
                  pxPerFrame={viewport.pxPerFrame}
                  left={layout.left}
                  width={layout.width}
                  onSelectClip={onSelectClip}
                  onMoveClip={onMoveClip}
                  onResizeClip={onResizeClip}
                />
              )
            })}
            {!clips.length ? <div className="absolute inset-0 grid place-items-center text-micro text-nomi-ink/55">{t('generationCommon.clipNode.empty')}</div> : null}
          </div>
          {onAddMaterial ? (
            <WorkbenchIconButton
              label={t('generationCommon.clipNode.addMaterial')}
              icon={<IconPlus size={20} />}
              className="absolute bottom-2 left-2 size-12 rounded-nomi-sm border border-nomi-line bg-nomi-paper text-nomi-ink hover:bg-nomi-accent hover:text-nomi-paper"
              onClick={onAddMaterial}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}
