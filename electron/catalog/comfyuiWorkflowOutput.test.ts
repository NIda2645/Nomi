import { describe, expect, it } from 'vitest'
import { analyzeComfyWorkflow, buildComfyImportModelMapping, buildImportedWorkflow, importComfyWorkflow, type ComfyGraph, type WorkflowBinding } from './comfyuiWorkflowImport'

// Public core-node shapes, no private workflow/model weights. CreateVideo is not a file output.
const graph: ComfyGraph = {
  '1': { class_type: 'EmptyImage', inputs: { width: 64, height: 64, batch_size: 2 } },
  '2': { class_type: 'CreateVideo', inputs: { images: ['1', 0], fps: 24 } },
  '3': { class_type: 'SaveVideo', inputs: { video: ['2', 0], filename_prefix: 'test', format: 'auto', codec: 'auto' } },
  '4': { class_type: 'PreviewImage', inputs: { images: ['1', 0] } },
}

describe('ComfyUI output contract', () => {
  it.each([
    ['SaveVideo', 'video'], ['SaveWEBM', 'video'], ['VHS_VideoCombine', 'video'],
    ['SaveAnimatedWEBP', 'video'], ['SaveImage', 'image'], ['PreviewImage', 'image'], ['SaveGLB', 'model3d'],
  ] as const)('derives %s output without trusting a missing/stale outputKind', (classType, kind) => {
    const workflow: ComfyGraph = { '9': { class_type: classType, inputs: {} } }
    expect(buildImportedWorkflow(workflow, { outputNodeId: '9' }).kind).toBe(kind)
    expect(buildImportedWorkflow(workflow, { outputNodeId: '9', outputKind: kind === 'image' ? 'video' : 'image' }).kind).toBe(kind)
  })

  it('uses a real saved output when no binding was supplied', () => {
    expect(buildImportedWorkflow(graph, {})).toMatchObject({ kind: 'video', taskKind: 'text_to_video' })
  })

  it('honors a deliberately selected preview even when the graph also saves video', () => {
    expect(buildImportedWorkflow(graph, { outputNodeId: '4', outputKind: 'video' })).toMatchObject({ kind: 'image', taskKind: 'text_to_image' })
  })

  it('does not offer the intermediate CreateVideo as a file output', () => {
    expect(analyzeComfyWorkflow(graph).outputNodes.map((node) => node.nodeId)).toEqual(['3', '4'])
  })

  it('repairs an old CreateVideo selection to its downstream SaveVideo in the persisted contract', () => {
    let model: Record<string, unknown> = {}
    let mapping: Record<string, unknown> = {}
    const result = importComfyWorkflow({ text: JSON.stringify(graph), binding: { outputNodeId: '2', outputKind: 'image' }, modelKey: 'test', labelZh: 'test' },
      (value) => { model = value }, (value) => { mapping = value })
    expect(result.kind).toBe('video')
    expect(model).toMatchObject({ kind: 'video', meta: { comfyWorkflowImport: { binding: { outputNodeId: '3', outputKind: 'video' } } } })
    expect(mapping).toMatchObject({ taskKind: 'text_to_video', create: { body: { partial_execution_targets: ['3'] } }, query: { response_mapping: { video_url: 'video_url' } } })
  })

  it.each([{ outputNodeId: 0, kind: 'image' }, { outputNodeId: ' 3 ', kind: 'video' }] as const)(
    'uses normalized output ID $outputNodeId at both import boundaries', ({ outputNodeId, kind }) => {
      const workflow = { ...graph, '0': graph['4'] }
      const binding = { outputNodeId, outputKind: 'image' } as unknown as WorkflowBinding
      const imported = buildImportedWorkflow(workflow, binding)
      const result = importComfyWorkflow({ text: JSON.stringify(workflow), binding, modelKey: 'test', labelZh: 'test' }, () => {}, () => {})
      expect(result.kind).toBe(kind)
      expect(buildComfyImportModelMapping(imported, { modelKey: 'test', labelZh: 'test', draft: { text: JSON.stringify(workflow), binding } }).model)
        .toMatchObject({ kind, meta: { comfyWorkflowImport: { binding: { outputNodeId: String(outputNodeId).trim(), outputKind: kind } } } })
    },
  )

  it.each<{ name: string; workflow: ComfyGraph; binding: WorkflowBinding }>([
    { name: 'missing selected node', workflow: graph, binding: { outputNodeId: '404', outputKind: 'image' as const } },
    { name: 'no output', workflow: { '1': graph['1'] }, binding: {} },
    { name: 'unknown output without a declaration', workflow: { '9': { class_type: 'CustomWriter', inputs: {} } }, binding: { outputNodeId: '9' } },
    { name: 'unsupported audio', workflow: { '9': { class_type: 'SaveAudio', inputs: {} } }, binding: { outputNodeId: '9', outputKind: 'image' as const } },
    { name: 'intermediate without a saver', workflow: { '1': graph['1'], '2': graph['2'] }, binding: { outputNodeId: '2', outputKind: 'video' as const } },
    { name: 'ambiguous downstream savers', workflow: { ...graph, '5': graph['3'] }, binding: { outputNodeId: '2', outputKind: 'video' as const } },
  ])('rejects $name instead of silently importing an image model', ({ workflow, binding }) => {
    expect(() => buildImportedWorkflow(workflow, binding)).toThrow(/输出|成品/)
  })

  it('allows an explicitly declared custom output without model-name special cases', () => {
    expect(buildImportedWorkflow({ '9': { class_type: 'CustomWriter', inputs: {} } }, { outputNodeId: '9', outputKind: 'video' }).kind).toBe('video')
  })
})
