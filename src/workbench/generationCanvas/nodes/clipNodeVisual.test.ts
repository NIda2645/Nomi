import { describe, expect, it } from 'vitest'
import { formatClipNodeDuration, resolveClipNodeAxisTicks, resolveClipNodeVisualMode } from './clipNodeVisual'

describe('clip node visual contract', () => {
  it('keeps the axis compact until a clip is explicitly opened', () => {
    expect(resolveClipNodeVisualMode({ hasClips: false, editingOpen: false, selectedClip: false })).toBe('compact')
    expect(resolveClipNodeVisualMode({ hasClips: true, editingOpen: false, selectedClip: false })).toBe('compact')
    expect(resolveClipNodeVisualMode({ hasClips: true, editingOpen: true, selectedClip: true })).toBe('editing')
    expect(resolveClipNodeVisualMode({ hasClips: true, editingOpen: true, selectedClip: false })).toBe('compact')
  })

  it('returns a readable ruler with no more than five evenly spaced ticks', () => {
    expect(resolveClipNodeAxisTicks(0, 30)).toEqual([{ frame: 0, ratio: 0, label: '00:00' }])
    expect(resolveClipNodeAxisTicks(198, 30)).toEqual([
      { frame: 0, ratio: 0, label: '00:00' },
      { frame: 50, ratio: 0.25, label: '00:02' },
      { frame: 99, ratio: 0.5, label: '00:03' },
      { frame: 149, ratio: 0.75, label: '00:05' },
      { frame: 198, ratio: 1, label: '00:07' },
    ])
  })

  it('formats the total axis duration as mm:ss', () => {
    expect(formatClipNodeDuration(0, 30)).toBe('00:00')
    expect(formatClipNodeDuration(198, 30)).toBe('00:07')
    expect(formatClipNodeDuration(3_600, 30)).toBe('02:00')
  })
})
