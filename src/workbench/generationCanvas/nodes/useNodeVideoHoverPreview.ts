import React from 'react'

const mutedBeforeHover = new WeakMap<HTMLVideoElement, boolean>()

/**
 * Hover playback must be muted to satisfy autoplay policies, but that mute is
 * temporary. Keep the element's user-facing state intact after the preview.
 */
export function startNodeVideoHoverPreview(video: HTMLVideoElement): void {
  if (!mutedBeforeHover.has(video)) mutedBeforeHover.set(video, video.muted)
  video.muted = true
  const playPromise = video.play()
  if (playPromise && typeof playPromise.catch === 'function') {
    void playPromise.catch(() => {})
  }
}

export function stopNodeVideoHoverPreview(video: HTMLVideoElement): void {
  video.pause()
  try {
    video.currentTime = 0
  } catch {
    // Some browsers can reject seeking before metadata is ready.
  }
  const previousMuted = mutedBeforeHover.get(video)
  if (previousMuted !== undefined) {
    video.muted = previousMuted
    mutedBeforeHover.delete(video)
  }
}

function playPreviewVideo(host: HTMLElement): void {
  const video = host.querySelector<HTMLVideoElement>('[data-node-preview-video="true"]')
  if (!video) return
  startNodeVideoHoverPreview(video)
}

function stopPreviewVideo(host: HTMLElement): void {
  const video = host.querySelector<HTMLVideoElement>('[data-node-preview-video="true"]')
  if (!video) return
  stopNodeVideoHoverPreview(video)
}

export function useNodeVideoHoverPreview(resultType: string | undefined): {
  handleVideoNodePointerEnter: (event: React.PointerEvent<HTMLElement>) => void
  handleVideoNodePointerLeave: (event: React.PointerEvent<HTMLElement>) => void
} {
  const handleVideoNodePointerEnter = React.useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (resultType !== 'video') return
    playPreviewVideo(event.currentTarget)
  }, [resultType])

  const handleVideoNodePointerLeave = React.useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (resultType !== 'video') return
    stopPreviewVideo(event.currentTarget)
  }, [resultType])

  return { handleVideoNodePointerEnter, handleVideoNodePointerLeave }
}
