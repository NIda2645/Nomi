import React from 'react'

type PlaybackAdvanceInput = {
  currentFrame: number
  durationFrame: number
  elapsedMs: number
  fps: number
  fractionalFrames: number
}

export type PlaybackAdvanceResult = {
  frame: number
  fractionalFrames: number
  ended: boolean
}

export function advanceTimelinePlayback(input: PlaybackAdvanceInput): PlaybackAdvanceResult {
  const durationFrame = Math.max(0, Math.floor(input.durationFrame))
  const accumulated = Math.max(0, input.fractionalFrames) + (Math.max(0, input.elapsedMs) / 1000) * Math.max(1, input.fps)
  const wholeFrames = Math.floor(accumulated)
  const nextFrame = Math.max(0, Math.floor(input.currentFrame)) + wholeFrames
  if (nextFrame >= durationFrame) return { frame: durationFrame, fractionalFrames: 0, ended: true }
  return { frame: nextFrame, fractionalFrames: accumulated - wholeFrames, ended: false }
}

export function useTimelinePlaybackClock({
  playing,
  playheadFrame,
  durationFrame,
  fps,
  onPlayheadChange,
  onPlayingChange,
}: {
  playing: boolean
  playheadFrame: number
  durationFrame: number
  fps: number
  onPlayheadChange: (frame: number) => void
  onPlayingChange: (playing: boolean) => void
}): void {
  const playheadRef = React.useRef(playheadFrame)
  const onPlayheadChangeRef = React.useRef(onPlayheadChange)
  const onPlayingChangeRef = React.useRef(onPlayingChange)

  React.useEffect(() => { playheadRef.current = playheadFrame }, [playheadFrame])
  React.useEffect(() => { onPlayheadChangeRef.current = onPlayheadChange }, [onPlayheadChange])
  React.useEffect(() => { onPlayingChangeRef.current = onPlayingChange }, [onPlayingChange])

  React.useEffect(() => {
    if (!playing) return undefined
    if (durationFrame <= 0) {
      onPlayingChangeRef.current(false)
      return undefined
    }
    let lastNow = performance.now()
    let fractionalFrames = 0
    let frameId = 0
    const tick = (now: number) => {
      const next = advanceTimelinePlayback({
        currentFrame: playheadRef.current,
        durationFrame,
        elapsedMs: now - lastNow,
        fps,
        fractionalFrames,
      })
      lastNow = now
      fractionalFrames = next.fractionalFrames
      if (next.frame !== playheadRef.current) {
        playheadRef.current = next.frame
        onPlayheadChangeRef.current(next.frame)
      }
      if (next.ended) {
        onPlayingChangeRef.current(false)
        return
      }
      frameId = window.requestAnimationFrame(tick)
    }
    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [durationFrame, fps, playing])
}
