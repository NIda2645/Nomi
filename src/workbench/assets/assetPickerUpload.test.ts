import { describe, expect, it, vi } from 'vitest'
import { droppedAssetFile, isAssetPickerInteractionLocked } from './assetPickerUpload'

describe('asset picker drop upload', () => {
  it('ignores another dropped file while an upload is active', () => {
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    const file = { name: 'second.mp4' } as File

    expect(droppedAssetFile({ preventDefault, stopPropagation, dataTransfer: { files: [file] } }, true)).toBeNull()
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()
  })

  it('locks existing material selection while an upload is active', () => {
    expect(isAssetPickerInteractionLocked(true)).toBe(true)
    expect(isAssetPickerInteractionLocked(false)).toBe(false)
  })
})
