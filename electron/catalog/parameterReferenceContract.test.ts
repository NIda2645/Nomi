import { describe, expect, it } from 'vitest'
import { readParameterReferenceContract } from './parameterReferenceContract'

const validSlot = { key: 'comfy_image_1', label: 'Reference', group: 'reference' }

function metaWithSlots(slots: unknown[]) {
  return {
    modelKey: 'workflow',
    modelVendor: 'comfyui-local',
    parameterReferenceSlots: {
      modelKey: 'workflow',
      vendorKey: 'comfyui-local',
      slots,
    },
  }
}

describe('readParameterReferenceContract', () => {
  it.each([
    ['non-object slot', [validSlot, null]],
    ['invalid group', [validSlot, { ...validSlot, key: 'bad-group', group: 'other' }]],
    ['array group', [validSlot, { ...validSlot, key: 'bad-group', group: ['reference'] }]],
    ['empty key', [validSlot, { ...validSlot, key: '   ' }]],
    ['numeric key', [validSlot, { ...validSlot, key: 1 }]],
    ['numeric label', [validSlot, { ...validSlot, key: 'bad-label', label: 1 }]],
    ['duplicate key', [validSlot, { ...validSlot, label: 'Duplicate' }]],
    ['audio mediaKind', [validSlot, { ...validSlot, key: 'bad-media', mediaKind: 'audio' }]],
    ['null mediaKind', [validSlot, { ...validSlot, key: 'bad-media', mediaKind: null }]],
    ['numeric mediaKind', [validSlot, { ...validSlot, key: 'bad-media', mediaKind: 1 }]],
  ])('rejects the whole contract for a mixed declaration containing %s', (_name, slots) => {
    expect(readParameterReferenceContract(metaWithSlots(slots))).toBeNull()
  })

  it('accepts a fully valid contract and treats omitted mediaKind as image-compatible', () => {
    expect(readParameterReferenceContract(metaWithSlots([
      validSlot,
      { ...validSlot, key: 'comfy_video_1', mediaKind: 'video' },
      { ...validSlot, key: 'comfy_image_2', mediaKind: 'image' },
    ]))?.slots).toEqual([
      validSlot,
      { ...validSlot, key: 'comfy_video_1', mediaKind: 'video' },
      { ...validSlot, key: 'comfy_image_2', mediaKind: 'image' },
    ])
  })

  it('rejects a declaration whose persisted identity does not match the node', () => {
    const meta = metaWithSlots([validSlot])
    meta.parameterReferenceSlots.modelKey = 'other-workflow'
    expect(readParameterReferenceContract(meta)).toBeNull()
  })
})
