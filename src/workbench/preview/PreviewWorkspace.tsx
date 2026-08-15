import React from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkbenchStore } from '../workbenchStore'
import { cn } from '../../utils/cn'
import TimelinePanel from '../timeline/TimelinePanel'
import { computeTimelineDuration, resolveActiveClipsAtFrame } from '../timeline/timelineMath'
import TimelinePreview from './TimelinePreview'
import PreviewSourcePanel from './PreviewSourcePanel'
import { useTimelinePlaybackClock } from '../timeline/useTimelinePlaybackClock'

export default function PreviewWorkspace(): JSX.Element {
  const { t } = useTranslation()
  const timeline = useWorkbenchStore((state) => state.timeline)
  const playheadFrame = useWorkbenchStore((state) => state.timeline.playheadFrame)
  const playing = useWorkbenchStore((state) => state.timelinePlaying)
  const previewAspectRatio = useWorkbenchStore((state) => state.previewAspectRatio)
  const setTimelinePlaying = useWorkbenchStore((state) => state.setTimelinePlaying)
  const setTimelinePlayhead = useWorkbenchStore((state) => state.setTimelinePlayhead)
  const durationFrame = React.useMemo(() => computeTimelineDuration(timeline), [timeline])
  const activeClips = React.useMemo(() => resolveActiveClipsAtFrame(timeline, playheadFrame), [timeline, playheadFrame])

  useTimelinePlaybackClock({
    playing,
    playheadFrame,
    durationFrame,
    fps: timeline.fps,
    onPlayheadChange: setTimelinePlayhead,
    onPlayingChange: setTimelinePlaying,
  })

  return (
    <section
      className={cn(
        'workbench-preview',
        'w-full h-full min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_var(--workbench-preview-timeline-height)]',
        'overflow-hidden bg-[var(--workbench-bg)]',
      )}
      aria-label={t('workspace.preview')}
    >
      {/* 上半=素材来源 + 播放器；时间轴在下半**通栏固定**（剪辑软件通行布局：
          素材区只占播放器那一行，收展素材栏不会把时间轴推来推去）。 */}
      <div className={cn('workbench-preview__stage', 'min-w-0 min-h-0 flex overflow-hidden')}>
        <PreviewSourcePanel />
        {/* 单行 grid：TimelinePreview 内部靠 flex-1 撑高，需要父级给确定高度
            （直接塞进普通 div 会让画面区塌成 0、控件条弹到顶部）。 */}
        <div className={cn('workbench-preview__player', 'min-w-0 min-h-0 flex-1 grid grid-rows-[minmax(0,1fr)]')}>
          <TimelinePreview
            activeClips={activeClips}
            aspectRatio={previewAspectRatio}
            fps={timeline.fps}
            playheadFrame={timeline.playheadFrame}
            timeline={timeline}
          />
        </div>
      </div>
      <TimelinePanel
        density="full"
        regionLabel={t('timelinePreview.timelineRegion')}
        actionLabelPrefix={t('timelinePreview.timelineActionPrefix')}
        showTextTrack
      />
    </section>
  )
}
