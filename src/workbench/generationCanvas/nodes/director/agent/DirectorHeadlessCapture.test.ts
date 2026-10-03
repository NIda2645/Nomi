import { describe, expect, it } from 'vitest'
import type { DirectorScene } from '../model/directorTypes'
import { actionClipsLoading, resolveHeadlessCameraId } from './DirectorHeadlessCapture'

const scene = { cameras: [{ id: 'camera-a' }, { id: 'camera-b' }] } as DirectorScene

describe('resolveHeadlessCameraId', () => {
  it('uses the first camera when no selector is provided', () => {
    expect(resolveHeadlessCameraId(scene, 0, undefined)).toBe('camera-a')
  })

  it('allows a renderer to select a camera per sample time, including black frames', () => {
    expect(resolveHeadlessCameraId(scene, 1.25, (time) => time > 1 ? 'camera-b' : null)).toBe('camera-b')
    expect(resolveHeadlessCameraId(scene, 0.5, () => null)).toBeNull()
  })

  it('does not wait for characters without action clips', () => {
    expect(actionClipsLoading({ objects: [{ type: 'character', visible: true, actionClips: [] }] } as DirectorScene)).toBe(false)
  })
})
