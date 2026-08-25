import { describe, expect, it } from 'vitest'
import type { AssetRef } from '../../assets/assetTypes'
import { appendClipNodeSource, clipNodeSourceFromAsset, emptyClipNodeMeta } from './clipNodeModel'
import {
  moveClipNode,
  removeClipNode,
  resizeClipNode,
  splitClipNode,
  clipNodeTimelineFromMeta,
  duplicateClipNode,
} from './clipNodeSequence'

const asset = (kind: 'image' | 'video', id: string): AssetRef => ({
  id,
  kind,
  name: id,
  renderUrl: `nomi-local://asset/${id}`,
  source: 'project',
  origin: { source: 'project', projectId: 'p', relativePath: id },
})

function seedMeta() {
  const image = clipNodeSourceFromAsset(asset('image', 'image-a'))!
  const video = clipNodeSourceFromAsset(asset('video', 'video-b'))!
  return appendClipNodeSource(appendClipNodeSource(emptyClipNodeMeta(), image), video)
}

describe('clip node sequence editing', () => {
  it('keeps image and video in one ordered visual sequence', () => {
    const timeline = clipNodeTimelineFromMeta(seedMeta())

    expect(timeline.tracks).toHaveLength(1)
    expect(timeline.tracks[0]?.clips.map((clip) => clip.type)).toEqual(['image', 'video'])
    expect(timeline.tracks[0]?.clips[1]?.startFrame).toBe(timeline.tracks[0]?.clips[0]?.endFrame)
  })

  it('splits a video and preserves source offsets for both resulting pieces', () => {
    const result = splitClipNode(seedMeta(), 'clip-video-b', 180)
    const clips = clipNodeTimelineFromMeta(result).tracks[0]?.clips ?? []

    expect(clips).toHaveLength(3)
    expect(clips[1]).toMatchObject({ id: 'clip-video-b', endFrame: 180, offsetEndFrame: 120 })
    expect(clips[2]).toMatchObject({ startFrame: 180, offsetStartFrame: 60, offsetEndFrame: 0 })
    expect(result.clips.map((clip) => clip.id)).toEqual(['image-a', 'video-b', 'video-b-split'])
  })

  it('moves a clip through the same legal-placement rule as the main timeline', () => {
    const result = moveClipNode(seedMeta(), 'clip-video-b', 360)
    const clips = clipNodeTimelineFromMeta(result).tracks[0]?.clips ?? []

    expect(clips.find((clip) => clip.id === 'clip-video-b')?.startFrame).toBe(360)
    expect(clips[0]?.endFrame).toBeLessThanOrEqual(clips[1]?.startFrame ?? 0)
  })

  it('resizes the selected edge without changing the source frame count', () => {
    const result = resizeClipNode(seedMeta(), 'clip-video-b', 'left', 30)
    const clip = clipNodeTimelineFromMeta(result).tracks[0]?.clips.find((candidate) => candidate.id === 'clip-video-b')

    expect(clip).toMatchObject({ startFrame: 150, offsetStartFrame: 30, frameCount: 180 })
    expect(clip?.endFrame).toBe(300)
  })

  it('removes a clip and compacts the following clip to the previous end', () => {
    const result = removeClipNode(seedMeta(), 'clip-image-a')
    const clips = clipNodeTimelineFromMeta(result).tracks[0]?.clips ?? []

    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({ id: 'clip-video-b', startFrame: 0 })
    expect(result.excludedSourceNodeIds).toEqual(['image-a'])
  })

  it('duplicates a clip as a new editable instance', () => {
    const result = duplicateClipNode(seedMeta(), 'clip-image-a')
    expect(result.clips.map((clip) => clip.id)).toEqual(['image-a', 'video-b', 'image-a-copy'])
    expect(clipNodeTimelineFromMeta(result).tracks[0]?.clips[2]).toMatchObject({ sourceNodeId: 'image-a' })
  })
})
