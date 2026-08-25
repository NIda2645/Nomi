import { describe, expect, it } from 'vitest'
import {
  customCallScriptPatch,
  readCustomCallScriptDrafts,
  resolveCustomCallScriptModes,
  updateCustomCallScriptDraft,
  type CustomCallCatalogModel,
} from './customCallScriptModes'

const model: CustomCallCatalogModel = {
  vendorKey: 'future-cloud',
  modelKey: 'future-video-v1',
  meta: {
    customCapabilityContract: {
      version: 1,
      kind: 'video',
      defaultModeId: 'references',
      transportTaskKind: 'image_to_video',
      modes: [
        {
          id: 'references',
          intent: 'character',
          vendorTerm: '多参考图',
          hint: '最多八张参考图',
          promptRequired: true,
          slots: [{ kind: 'image_ref', label: '参考图', min: 1, max: 8 }],
          params: [],
        },
        {
          id: 'frames',
          intent: 'firstlast',
          vendorTerm: '首尾帧',
          hint: '首帧必填，尾帧可选',
          promptRequired: true,
          slots: [
            { kind: 'first_frame', label: '首帧', min: 1, max: 1 },
            { kind: 'last_frame', label: '尾帧', min: 0, max: 1 },
          ],
          params: [],
        },
      ],
    },
  },
  customCall: {
    script: "return 'fallback'",
    modes: {
      references: { script: "return 'references'" },
      frames: { script: "return 'frames'" },
    },
  },
}

describe('custom-call script mode editor model', () => {
  it('lists only modes declared by the resolved capability archetype', () => {
    expect(resolveCustomCallScriptModes(model, true)).toEqual([
      expect.objectContaining({ id: 'references', label: '多参考图', taskKind: 'image_to_video' }),
      expect.objectContaining({ id: 'frames', label: '首尾帧', taskKind: 'image_to_video' }),
    ])
    expect(resolveCustomCallScriptModes({ ...model, meta: undefined }, true)).toEqual([])
  })

  it('keeps direct-script drafts on the general fallback even when the model id has known modes', () => {
    expect(resolveCustomCallScriptModes(model, false)).toEqual([])
  })

  it('loads fallback and mode scripts into independent drafts', () => {
    expect(readCustomCallScriptDrafts(model, 'stale fallback')).toEqual({
      fallback: "return 'fallback'",
      modes: {
        references: "return 'references'",
        frames: "return 'frames'",
      },
    })
  })

  it('preserves every unsaved draft while the selected scope changes', () => {
    const initial = readCustomCallScriptDrafts(model, '')
    const fallbackEdited = updateCustomCallScriptDraft(initial, null, "return 'new fallback'")
    const modeEdited = updateCustomCallScriptDraft(fallbackEdited, 'frames', "return 'new frames'")

    expect(modeEdited).toEqual({
      fallback: "return 'new fallback'",
      modes: {
        references: "return 'references'",
        frames: "return 'new frames'",
      },
    })
  })

  it('builds partial patches that cannot overwrite sibling scripts', () => {
    expect(customCallScriptPatch(null, "return 'fallback'")).toEqual({ script: "return 'fallback'" })
    expect(customCallScriptPatch('frames', "return 'frames'")).toEqual({
      modes: { frames: { script: "return 'frames'" } },
    })
    expect(customCallScriptPatch('frames', '   ')).toEqual({ modes: { frames: null } })
  })
})
