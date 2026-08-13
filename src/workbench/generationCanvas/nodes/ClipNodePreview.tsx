import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import { WorkbenchIconButton } from '../../../design/workbenchActions'
import { cn } from '../../../utils/cn'
import type { TimelineClip } from '../../timeline/timelineTypes'

type ClipNodePreviewProps = {
  clip?: TimelineClip
  playing: boolean
  onTogglePlaying: () => void
  className?: string
}

export default function ClipNodePreview({ clip, playing, onTogglePlaying, className }: ClipNodePreviewProps): JSX.Element {
  const { t } = useTranslation()
  const videoRef = React.useRef<HTMLVideoElement | null>(null)

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !clip || clip.type !== 'video') return
    if (playing) void video.play().catch(() => undefined)
    else video.pause()
  }, [clip, playing])

  if (!clip) {
    return <div className={cn('grid h-44 place-items-center rounded-nomi-sm border border-dashed border-nomi-line bg-nomi-bg text-micro text-nomi-ink-40', className)}>{t('generationCommon.clipNode.previewSelect')}</div>
  }

  return (
    <div className={cn('relative h-44 overflow-hidden rounded-nomi-sm border border-nomi-line bg-nomi-bg', className)} data-testid="clip-node-preview">
      {clip.type === 'video' && clip.url ? (
        <video ref={videoRef} src={clip.url} poster={clip.thumbnailUrl} muted playsInline preload="metadata" className="block size-full object-contain" onClick={onTogglePlaying} />
      ) : clip.url ? (
        <img src={clip.thumbnailUrl || clip.url} alt={clip.label} className="block size-full object-contain" />
      ) : <div className="size-full" />}
      <WorkbenchIconButton
        label={playing ? t('generationCommon.clipNode.pausePreview') : t('generationCommon.clipNode.playPreview')}
        icon={playing ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
        className={cn('absolute bottom-1.5 left-1.5 bg-nomi-paper/85 text-nomi-ink hover:bg-nomi-paper hover:text-nomi-ink')}
        onClick={onTogglePlaying}
      />
      <span className="absolute right-2 top-1.5 rounded-full bg-nomi-paper/85 px-1.5 py-0.5 text-micro text-nomi-ink">{clip.label}</span>
    </div>
  )
}
