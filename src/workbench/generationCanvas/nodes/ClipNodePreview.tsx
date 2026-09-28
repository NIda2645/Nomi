import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlayerPause, IconPlayerPlay, IconVolume, IconVolumeOff, IconX } from '@tabler/icons-react'
import { WorkbenchIconButton } from '../../../design/actions'
import { useVideoPlaybackHeal } from '../../../media/useVideoPlaybackHeal'
import { cn } from '../../../utils/cn'
import { resolveActiveClipsAtFrame } from '../../timeline/timelineMath'
import type { TimelineState } from '../../timeline/timelineTypes'
import { usePreviewVideoPlayheadSync } from '../../preview/usePreviewVideoPlayheadSync'
import { formatClipNodeDuration } from './clipNodeVisual'

type ClipNodePreviewProps = {
  timeline: TimelineState
  playheadFrame: number
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  onPlayheadChange: (frame: number) => void
  onClose: () => void
  className?: string
}

export default function ClipNodePreview({
  timeline,
  playheadFrame,
  playing,
  onPlayingChange,
  onPlayheadChange,
  onClose,
  className,
}: ClipNodePreviewProps): JSX.Element {
  const { t } = useTranslation()
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = React.useState(true)
  const fps = Math.max(1, timeline.fps || 30)
  const durationFrame = timeline.tracks.flatMap((track) => track.clips).reduce((max, clip) => Math.max(max, clip.endFrame), 0)
  const activeClip = resolveActiveClipsAtFrame(timeline, playheadFrame)[0] ?? null
  const videoClip = activeClip?.type === 'video' ? activeClip : null
  const rawVideoUrl = videoClip?.url ?? ''
  const heal = useVideoPlaybackHeal({ rawUrl: rawVideoUrl })

  usePreviewVideoPlayheadSync(videoRef, {
    videoClip,
    videoUrl: rawVideoUrl,
    playheadFrame,
    fps,
    playing,
  })

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !videoClip) return
    if (playing) {
      void video.play().catch(() => onPlayingChange(false))
      return
    }
    video.pause()
  }, [heal.playbackUrl, onPlayingChange, playing, videoClip])

  const togglePlaying = (): void => {
    if (durationFrame <= 0) return
    if (!playing && playheadFrame >= durationFrame) onPlayheadChange(0)
    onPlayingChange(!playing)
  }

  return (
    <section
      className={cn('relative w-[430px] overflow-hidden rounded-nomi border border-nomi-line bg-nomi-paper text-nomi-ink shadow-nomi-lg', className)}
      data-testid="clip-node-preview"
      data-active-clip-id={activeClip?.id ?? ''}
      data-muted={muted ? 'true' : 'false'}
      aria-label={t('generationCommon.clipNode.programMonitor')}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="relative aspect-video bg-nomi-ink">
        {videoClip && rawVideoUrl ? (
          <video
            key={videoClip.id}
            ref={videoRef}
            src={heal.playbackUrl}
            poster={videoClip.thumbnailUrl}
            muted={muted}
            playsInline
            preload="auto"
            className="block size-full object-contain"
            onClick={togglePlaying}
            onError={heal.onError}
            onLoadedMetadata={heal.onLoadedMetadata}
          />
        ) : activeClip?.type === 'image' && activeClip.url ? (
          <img src={activeClip.thumbnailUrl || activeClip.url} alt="" className="block size-full object-contain" onClick={togglePlaying} />
        ) : (
          <div className="size-full bg-nomi-ink" />
        )}
        {heal.healingText || heal.failureText ? (
          <div className="absolute inset-x-3 bottom-3 rounded-nomi-sm bg-nomi-paper/90 px-2 py-1.5 text-caption text-nomi-ink">
            {heal.healingText || heal.failureText}
          </div>
        ) : null}
        <WorkbenchIconButton
          label={t('generationCommon.clipNode.closePreview')}
          icon={<IconX size={16} />}
          className="absolute right-2 top-2 bg-nomi-paper/85 text-nomi-ink hover:bg-nomi-paper hover:text-nomi-ink"
          onClick={onClose}
        />
      </div>
      <div className="flex h-11 items-center gap-2 border-t border-nomi-line px-2.5">
        <WorkbenchIconButton
          label={playing ? t('generationCommon.clipNode.pausePreview') : t('generationCommon.clipNode.playPreview')}
          icon={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
          className="shrink-0 bg-nomi-bg text-nomi-ink hover:bg-nomi-accent-soft hover:text-nomi-accent"
          onClick={togglePlaying}
        />
        <WorkbenchIconButton
          label={muted ? t('timelinePreview.unmute') : t('timelinePreview.mute')}
          icon={muted ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
          className="shrink-0 bg-nomi-bg text-nomi-ink hover:bg-nomi-accent-soft hover:text-nomi-accent"
          onClick={() => setMuted((value) => !value)}
        />
        <span className="w-[88px] shrink-0 text-center font-mono text-micro text-nomi-ink-60">
          {formatClipNodeDuration(playheadFrame, fps)} / {formatClipNodeDuration(durationFrame, fps)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, durationFrame)}
          step={1}
          value={Math.min(playheadFrame, Math.max(1, durationFrame))}
          className="h-5 min-w-0 flex-1 cursor-pointer accent-nomi-accent"
          aria-label={t('generationCommon.clipNode.scrub')}
          onChange={(event) => {
            onPlayingChange(false)
            onPlayheadChange(Number(event.currentTarget.value))
          }}
        />
      </div>
    </section>
  )
}
