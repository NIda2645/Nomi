import { describe, expect, it } from 'vitest'
import type { Mapping } from '../../../electron/catalog/types'
import type { ModelArchetype } from '../../config/modelArchetypes'
import type { ChipModel } from './ModelChipGroups'
import { projectModelCapability } from './modelCapabilityProjection'

const model = (overrides: Partial<ChipModel> = {}): ChipModel => ({
  modelKey: 'future-video-v1',
  vendorKey: 'future-cloud',
  labelZh: 'Future Video V1',
  kind: 'video',
  enabled: true,
  ...overrides,
})

const mapping = (taskKind: Mapping['taskKind'], overrides: Partial<Mapping> = {}): Mapping => ({
  id: `mapping-${taskKind}`,
  vendorKey: 'future-cloud',
  modelKey: 'future-video-v1',
  taskKind,
  name: taskKind,
  enabled: true,
  create: { method: 'POST', path: '/tasks' },
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
  ...overrides,
})

const MULTI_MODE_ARCHETYPE: ModelArchetype = {
  id: 'future-video',
  family: 'future',
  label: 'Future Video',
  kind: 'video',
  defaultModeId: 'reference',
  transportTaskKind: 'image_to_video',
  identifierPatterns: ['future-video-v1'],
  modes: [
    {
      id: 'reference',
      intent: 'single',
      vendorTerm: '多参考图',
      hint: '最多三张参考图',
      promptRequired: true,
      transportTaskKind: 'image_to_video',
      slots: [{ kind: 'image_ref', label: '参考图', min: 1, max: 3, inputKey: 'image_urls' }],
      params: [],
    },
    {
      id: 'frame',
      intent: 'firstlast',
      vendorTerm: '首尾帧',
      hint: '首帧必需，尾帧可选',
      promptRequired: true,
      transportTaskKind: 'image_to_video',
      slots: [
        { kind: 'first_frame', label: '首帧', min: 1, max: 1 },
        { kind: 'last_frame', label: '尾帧', min: 0, max: 1 },
      ],
      params: [],
    },
  ],
}

describe('projectModelCapability', () => {
  it('keeps distinct capability modes even when they share one transport taskKind', () => {
    const result = projectModelCapability({
      model: model(),
      archetype: MULTI_MODE_ARCHETYPE,
      mappings: [mapping('image_to_video')],
    })

    expect(result.source).toBe('archetype')
    expect(result.inputContract).toBe('known')
    expect(result.modes.map((mode) => [mode.id, mode.taskKind])).toEqual([
      ['reference', 'image_to_video'],
      ['frame', 'image_to_video'],
    ])
    expect(result.modes[0].requiredInputs).toEqual([
      expect.objectContaining({ kind: 'image_ref', mediaKind: 'image', min: 1, max: 3 }),
    ])
    expect(result.modes[0].optionalInputs).toEqual([])
    expect(result.modes[1].requiredInputs).toEqual([
      expect.objectContaining({ kind: 'first_frame', min: 1, max: 1 }),
    ])
    expect(result.modes[1].optionalInputs).toEqual([
      expect.objectContaining({ kind: 'last_frame', min: 0, max: 1 }),
    ])
  })

  it('does not invent frame or reference slots for an unknown newly released model', () => {
    const result = projectModelCapability({
      model: model({
        meta: {
          parameters: [{ key: 'duration', label: 'Duration', type: 'number', min: 1, max: 12 }],
          adapter: {
            modes: [
              { taskKind: 'image_to_video', state: 'verified', attempts: 1 },
              { taskKind: 'text_to_video', state: 'failed', attempts: 2 },
            ],
          },
        },
      }),
      archetype: null,
      mappings: [mapping('image_to_video')],
    })

    expect(result.source).toBe('transport-only')
    expect(result.inputContract).toBe('unknown')
    expect(result.modes).toEqual([])
    expect(result.parameters).toEqual([
      expect.objectContaining({ key: 'duration', type: 'number', min: 1, max: 12 }),
    ])
    expect(result.transport.verifiedTaskKinds).toEqual(['image_to_video'])
    expect(result.transport.mappings).toEqual([
      expect.objectContaining({ taskKind: 'image_to_video', scope: 'model' }),
    ])
    expect(JSON.stringify(result)).not.toMatch(/first_frame|last_frame|image_ref/)
  })

  it('states the current task-kind, mode-aware, and audio-capable custom-call boundary', () => {
    const result = projectModelCapability({
      model: model({ hasCustomCall: true }),
      archetype: null,
      mappings: [mapping('text_to_video'), mapping('image_to_video')],
    })

    expect(result.customCall).toEqual({
      enabled: true,
      scope: 'model',
      sharedAcrossTaskKinds: true,
      taskKindAware: true,
      modeAware: true,
      declaresInputContract: false,
      supportsAudioDispatch: true,
    })
    expect(result.inputContract).toBe('unknown')
    expect(result.modes).toEqual([])
  })
})
