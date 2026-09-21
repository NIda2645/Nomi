import { describe, expect, it } from 'vitest'
import { anchorsConsumedBy } from './anchorPolicy'

describe('anchor policy derives from slots', () => {
  it('does not confuse video/audio inputs with images', () => {
    expect(anchorsConsumedBy({ slots: [{ kind: 'video_ref' }, { kind: 'audio_ref' }] })).toEqual(['none'])
  })
  it('distinguishes indexed characters, generic images and first frames', () => {
    expect(anchorsConsumedBy({ slots: [{ kind: 'image_ref', characterIndexed: true }] })).toEqual(['character'])
    expect(anchorsConsumedBy({ slots: [{ kind: 'image_ref' }] })).toEqual(['scene'])
    expect(anchorsConsumedBy({ slots: [{ kind: 'first_frame' }] })).toEqual(['firstFrame'])
  })
})
