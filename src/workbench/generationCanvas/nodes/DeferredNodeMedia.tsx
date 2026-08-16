import React from 'react'
import { useTranslation } from 'react-i18next'
import { IconRefresh } from '@tabler/icons-react'
import { WorkbenchButton } from '../../../design'
import { NomiImage, type NomiImageProps } from '../../../design/media'
import { cn } from '../../../utils/cn'
import {
  isDeferredVideoFrameReady,
  type DeferredNodeMediaState,
  useDeferredNodeMediaSrc,
} from './deferredNodeMediaQueue'

export const DeferredNodeMediaPlaceholder = React.forwardRef<HTMLDivElement, { className?: string }>(
  function DeferredNodeMediaPlaceholder({ className }, ref): JSX.Element {
    return <div ref={ref} className={cn('generation-canvas-v2-node__media-loading', className)} aria-hidden="true" />
  },
)

function DeferredNodeMediaViewportAnchor({
  state,
  anchorRef,
}: {
  state: DeferredNodeMediaState
  anchorRef: React.RefCallback<HTMLDivElement>
}): JSX.Element {
  return (
    <div
      ref={anchorRef}
      className="absolute inset-0 pointer-events-none"
      data-node-media-state={state}
      aria-hidden="true"
    />
  )
}

function DeferredNodeMediaFailure({
  state,
  onRetry,
}: {
  state: 'error' | 'timeout'
  onRetry: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const message = state === 'timeout' ? t('media.loadTimedOut') : t('media.loadFailed')
  return (
    <div
      role="alert"
      className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-nomi-ink-05 p-3 text-center"
      data-node-media-failure={state}
    >
      <span className="text-caption leading-snug text-nomi-ink-60">{message}</span>
      <WorkbenchButton
        size="sm"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onRetry()
        }}
      >
        <IconRefresh />
        {t('common.retry')}
      </WorkbenchButton>
    </div>
  )
}

export type DeferredNodeImageProps = Omit<NomiImageProps, 'src'> & {
  src: string
  priority?: boolean
  placeholderClassName?: string
}

export function DeferredNodeImage({
  src,
  priority = false,
  placeholderClassName,
  className,
  onLoad,
  onError,
  ...props
}: DeferredNodeImageProps): JSX.Element {
  const media = useDeferredNodeMediaSrc({ src, kind: 'image', priority })
  const retainedSrc = media.readySrc && media.readySrc !== media.activeSrc ? media.readySrc : null
  return (
    <>
      <DeferredNodeMediaViewportAnchor state={media.state} anchorRef={media.placeholderRef} />
      {media.loading && !media.readySrc ? <DeferredNodeMediaPlaceholder className={placeholderClassName} /> : null}
      {retainedSrc ? (
        <NomiImage
          {...props}
          key={retainedSrc}
          src={retainedSrc}
          eager
          className={cn(className, media.activeSrc && 'absolute inset-0')}
        />
      ) : null}
      {media.activeSrc ? (
        <NomiImage
          {...props}
          key={media.loadKey}
          src={media.activeSrc}
          eager
          className={cn(
            className,
            retainedSrc && 'absolute inset-0',
            media.state === 'loading' && 'opacity-0 pointer-events-none',
          )}
          onLoad={(event) => {
            media.markLoaded()
            onLoad?.(event)
          }}
          onError={(event) => {
            media.markFailed()
            onError?.(event)
          }}
        />
      ) : null}
      {media.state === 'error' || media.state === 'timeout' ? (
        <DeferredNodeMediaFailure state={media.state} onRetry={media.retry} />
      ) : null}
    </>
  )
}

export type DeferredNodeVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  src: string
  priority?: boolean
  placeholderClassName?: string
}

function releaseVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return
  video.pause()
  video.removeAttribute('src')
  try {
    video.load()
  } catch {
    /* Some test DOMs do not implement media loading. */
  }
}

function ManagedDeferredNodeVideo({
  mediaKey,
  ...props
}: React.VideoHTMLAttributes<HTMLVideoElement> & { mediaKey: string }): JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  React.useEffect(() => () => releaseVideoElement(videoRef.current), [])
  return <video {...props} key={mediaKey} ref={videoRef} />
}

export function DeferredNodeVideo({
  src,
  priority = false,
  placeholderClassName,
  className,
  onLoadedMetadata,
  onLoadedData,
  onError,
  ...props
}: DeferredNodeVideoProps): JSX.Element {
  const media = useDeferredNodeMediaSrc({ src, kind: 'video', priority })
  const retainedSrc = media.readySrc && media.readySrc !== media.activeSrc ? media.readySrc : null

  return (
    <>
      <DeferredNodeMediaViewportAnchor state={media.state} anchorRef={media.placeholderRef} />
      {media.loading && !media.readySrc ? <DeferredNodeMediaPlaceholder className={placeholderClassName} /> : null}
      {retainedSrc ? (
        <ManagedDeferredNodeVideo
          {...props}
          key={retainedSrc}
          mediaKey={retainedSrc}
          src={retainedSrc}
          className={cn(className, media.activeSrc && 'absolute inset-0')}
        />
      ) : null}
      {media.activeSrc ? (
        <ManagedDeferredNodeVideo
          {...props}
          key={media.loadKey}
          mediaKey={media.loadKey}
          src={media.activeSrc}
          className={cn(
            className,
            retainedSrc && 'absolute inset-0',
            media.state === 'loading' && 'opacity-0 pointer-events-none',
          )}
          onLoadedMetadata={(event) => {
            onLoadedMetadata?.(event)
          }}
          onLoadedData={(event) => {
            if (isDeferredVideoFrameReady(event.currentTarget.readyState)) media.markLoaded()
            onLoadedData?.(event)
          }}
          onError={(event) => {
            media.markFailed()
            onError?.(event)
          }}
        />
      ) : null}
      {media.state === 'error' || media.state === 'timeout' ? (
        <DeferredNodeMediaFailure state={media.state} onRetry={media.retry} />
      ) : null}
    </>
  )
}
