import { describe, expect, it } from 'vitest'
import {
  bindingFromAnalysis,
  mediaBindingRows,
  setMediaBinding,
  supportedOutputOptions,
} from './comfyuiWorkflowImportPanelViewModel'
import type { WorkflowAnalysis, WorkflowBinding } from './comfyuiWorkflowBinding'

const analysis = (imageInputs: WorkflowAnalysis['imageInputs']): WorkflowAnalysis => ({
  textInputs: [], imageInputs, outputNodes: [
    { nodeId: '9', classType: 'SaveImage', kind: 'image' },
    { nodeId: '10', classType: 'SaveGLB', kind: 'model3d' },
    { nodeId: '11', classType: 'SaveAudioMP3', kind: 'unsupported' },
  ], numericInputs: [], suggested: {},
})

describe('ComfyUI import panel view model', () => {
  it('renders every declared image/video input as its own row', () => {
    const rows = mediaBindingRows(analysis([
      { nodeId: '1', inputKey: 'image', classType: 'LoadImage', value: 'a.png', mediaKind: 'image' },
      { nodeId: '2', inputKey: 'image', classType: 'LoadImage', value: 'b.png', mediaKind: 'image' },
      { nodeId: '3', inputKey: 'file', classType: 'LoadVideo', value: 'c.mp4', mediaKind: 'video' },
    ]), {})
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.mediaKind)).toEqual(['image', 'image', 'video'])
  })

  it('changes only the selected media target and keeps other bindings', () => {
    const before: WorkflowBinding = {
      images: [{ nodeId: '1', inputKey: 'image', paramKey: 'comfy_image_1', label: 'A', mediaKind: 'image' }],
    }
    const after = setMediaBinding(before, { nodeId: '2', inputKey: 'image', classType: 'LoadImage', value: 'b.png', mediaKind: 'image' }, true)
    expect(after.images?.map((item) => item.nodeId)).toEqual(['1', '2'])
    const removed = setMediaBinding(after, { nodeId: '1', inputKey: 'image', classType: 'LoadImage', value: 'a.png', mediaKind: 'image' }, false)
    expect(removed.images?.map((item) => item.nodeId)).toEqual(['2'])
  })

  it('adding media after a scalar parameter keeps both keys unique without renaming the scalar', () => {
    const params: WorkflowBinding['params'] = [
      { nodeId: '4', inputKey: 'text', paramKey: 'comfy_image_1', label: 'Caption', type: 'text', default: 'a caption' },
    ]
    const after = setMediaBinding({ images: [], params },
      { nodeId: '1', inputKey: 'image', classType: 'LoadImage', value: 'a.png', mediaKind: 'image' }, true)
    expect(after.images?.[0]?.paramKey).toBe('comfy_image_1_2')
    expect(after.params).toEqual(params)
  })

  it('analysis initialization keeps all media slots and suffixes colliding suggested scalar parameters', () => {
    const input = analysis(['1', '2', '3'].map((nodeId) => (
      { nodeId, inputKey: 'image', classType: 'LoadImage', value: `${nodeId}.png`, mediaKind: 'image' as const }
    )))
    input.suggested.params = [
      { nodeId: '4', inputKey: 'text', paramKey: 'comfy_image_1', label: 'Caption', type: 'text', default: 'a caption' },
    ]
    const binding = bindingFromAnalysis(input)
    expect(binding.images?.map((item) => item.paramKey)).toEqual(['comfy_image_1', 'comfy_image_2', 'comfy_image_3'])
    expect(binding.params).toEqual([{ ...input.suggested.params[0], paramKey: 'comfy_image_1_2' }])
    expect(input.suggested.params[0].paramKey).toBe('comfy_image_1')
  })

  it('adding a media input preserves legacy media roles and avoids legacy numeric keys', () => {
    const after = setMediaBinding({
      firstFrameNodeId: '1', firstFrameInputKey: 'image',
      numeric: [{ nodeId: '4', inputKey: 'value', paramKey: 'comfy_image_2', label: 'Value', default: 2 }],
    }, { nodeId: '2', inputKey: 'image', classType: 'LoadImage', value: 'b.png', mediaKind: 'image' }, true)
    expect(after.images?.map((item) => item.paramKey)).toEqual(['first_frame_url', 'comfy_image_2_2'])
  })

  it('preserves an explicit empty media list instead of re-enabling every candidate', () => {
    const rows = mediaBindingRows(analysis([
      { nodeId: '1', inputKey: 'image', classType: 'LoadImage', value: 'a.png', mediaKind: 'image' },
    ]), { images: [] })
    expect(rows[0]?.checked).toBe(false)
  })

  it('does not offer unsupported audio output as an image output', () => {
    expect(supportedOutputOptions(analysis([]))).toEqual([
      { nodeId: '9', classType: 'SaveImage', kind: 'image' },
      { nodeId: '10', classType: 'SaveGLB', kind: 'model3d' },
    ])
  })
})
