import { describe, expect, it } from 'vitest'
import { analyzeComfyWorkflow, buildImportedWorkflow, type ComfyGraph } from './comfyuiWorkflowImport'
import { taskTemplateParams } from './taskParams'
import { buildTemplateContext, renderTemplateValue } from '../ai/requestPipeline'
import { projectParameterReferenceSlots } from '../../src/workbench/generationCanvas/model/parameterReferenceSlots'
import { resolveGenerationReferences } from '../../src/workbench/generationCanvas/runner/generationReferenceResolver'
import { buildCatalogTaskRequest } from '../../src/workbench/generationCanvas/runner/catalogTaskActions'
import type { GenerationCanvasNode } from '../../src/workbench/generationCanvas/model/generationCanvasTypes'

const graph: ComfyGraph = {
  '1': { class_type: 'LoadVideo', inputs: { file: 'first.mp4' } },
  '2': { class_type: 'LoadVideo', inputs: { file: 'second.mp4' } },
  '3': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
  '4': { class_type: 'GetVideoComponents', inputs: { video: ['2', 0] } },
  '5': { class_type: 'ImageBatch', inputs: { image1: ['3', 0], image2: ['4', 0] } },
  '6': { class_type: 'CreateVideo', inputs: { images: ['5', 0], fps: 24 } },
  '7': { class_type: 'SaveVideo', inputs: { video: ['6', 0], filename_prefix: 'dual' } },
}
const built = buildImportedWorkflow(graph, analyzeComfyWorkflow(graph).suggested)
function source(id: string, pending: boolean): GenerationCanvasNode {
  return { id, kind: 'video', title: id, position: { x: 0, y: 0 },
    ...(!pending ? { result: { id, type: 'video' as const, url: `https://fixture.test/${id}.mp4`, createdAt: 1 } } : {}) }
}

describe('multiple declared media inputs retain identity through the final wire template', () => {
  it.each([false, true])('keeps reverse-selected video slots independent, including pending=%s', (pending) => {
    const node: GenerationCanvasNode = { id: 'target', kind: 'video', title: '', prompt: '', position: { x: 0, y: 0 },
      meta: projectParameterReferenceSlots({ modelKey: 'dual', modelVendor: 'comfyui-local' }, { parameters: built.parameters }) }
    const references = resolveGenerationReferences(node, {
      nodes: [node, source('first', pending), source('second', false)],
      edges: [
        { id: 'second', source: 'second', target: node.id, mode: 'reference', targetParamKey: 'comfy_video_2', order: 0 },
        { id: 'first', source: 'first', target: node.id, mode: 'reference', targetParamKey: 'source_video_url', order: 1 },
      ],
    })
    const { request } = buildCatalogTaskRequest(node, { references })
    const params = taskTemplateParams(request)
    const context = buildTemplateContext({ request, params, model: {}, modelKey: 'dual', apiKey: '' })
    const wire = renderTemplateValue(built.templatedGraph, context) as ComfyGraph
    expect(wire['1']?.inputs?.file).toBe(pending ? null : 'https://fixture.test/first.mp4')
    expect(wire['2']?.inputs?.file).toBe('https://fixture.test/second.mp4')
  })
})
