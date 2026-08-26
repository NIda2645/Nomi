import { describe, expect, it } from 'vitest'
import {
  analyzeComfyWorkflow,
  buildComfyImportModelMapping,
  buildImportedWorkflow,
  type ComfyGraph,
} from './comfyuiWorkflowImport'
import { taskTemplateParams } from './taskParams'
import { buildTemplateContext, renderTemplateValue } from '../ai/requestPipeline'
import {
  parameterReferenceMetaPatch,
  projectParameterReferenceSlots,
  readParameterReferenceSlots,
} from '../../src/workbench/generationCanvas/model/parameterReferenceSlots'
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
const imageGraph: ComfyGraph = {
  '1': { class_type: 'LoadImage', inputs: { image: 'first.png' } },
  '2': { class_type: 'LoadImage', inputs: { image: 'second.png' } },
  '3': { class_type: 'ImageBatch', inputs: { image1: ['1', 0], image2: ['2', 0] } },
  '4': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'dual' } },
}
const builtImages = buildImportedWorkflow(imageGraph, analyzeComfyWorkflow(imageGraph).suggested)
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

  it('keeps two uploaded image slots independent and uses the imported image_edit contract', () => {
    const imported = buildComfyImportModelMapping(builtImages, { modelKey: 'dual-image', labelZh: 'Dual image' })
    let meta = projectParameterReferenceSlots(
      { modelKey: 'dual-image', modelVendor: 'comfyui-local' },
      { parameters: builtImages.parameters },
    )
    const slots = readParameterReferenceSlots(meta)
    meta = {
      ...meta,
      ...parameterReferenceMetaPatch(slots[0], slots, 'https://upload.test/first.png'),
      ...parameterReferenceMetaPatch(slots[1], slots, 'https://upload.test/second.png'),
    }
    const node: GenerationCanvasNode = {
      id: 'target', kind: 'image', title: '', prompt: 'combine', position: { x: 0, y: 0 }, meta,
    }

    const references = resolveGenerationReferences(node)
    const { request } = buildCatalogTaskRequest(node, { references })
    const params = taskTemplateParams(request)
    const context = buildTemplateContext({ request, params, model: {}, modelKey: 'dual-image', apiKey: '' })
    const wire = renderTemplateValue(builtImages.templatedGraph, context) as ComfyGraph

    expect(builtImages.taskKind).toBe('image_edit')
    expect(imported.mapping.taskKind).toBe('image_edit')
    expect(request.kind).toBe('image_edit')
    expect(references.referenceImages).toEqual([])
    expect(references.parameterReferenceUrls).toEqual({
      [slots[0].key]: 'https://upload.test/first.png',
      [slots[1].key]: 'https://upload.test/second.png',
    })
    expect(wire['1']?.inputs?.image).toBe('https://upload.test/first.png')
    expect(wire['2']?.inputs?.image).toBe('https://upload.test/second.png')
  })

  it('uses the structural image_edit contract even before declared image slots are filled', () => {
    const node: GenerationCanvasNode = {
      id: 'empty', kind: 'image', title: '', prompt: 'combine', position: { x: 0, y: 0 },
      meta: projectParameterReferenceSlots(
        { modelKey: 'dual-image', modelVendor: 'comfyui-local' },
        { parameters: builtImages.parameters },
      ),
    }
    const references = resolveGenerationReferences(node)

    expect(references.referenceImages).toEqual([])
    expect(buildCatalogTaskRequest(node, { references }).request.kind).toBe('image_edit')
  })

  it('keeps a LoadVideo-only SaveVideo workflow in text_to_video', () => {
    const node: GenerationCanvasNode = {
      id: 'video-only', kind: 'video', title: '', prompt: '', position: { x: 0, y: 0 },
      meta: projectParameterReferenceSlots(
        { modelKey: 'dual-video', modelVendor: 'comfyui-local' },
        { parameters: built.parameters },
      ),
    }

    expect(built.taskKind).toBe('text_to_video')
    expect(buildCatalogTaskRequest(node, { references: resolveGenerationReferences(node) }).request.kind)
      .toBe('text_to_video')
  })

  it('does not apply the Comfy structural contract to non-Comfy vendors', () => {
    const node: GenerationCanvasNode = {
      id: 'custom', kind: 'image', title: '', prompt: 'combine', position: { x: 0, y: 0 },
      meta: projectParameterReferenceSlots(
        { modelKey: 'custom-image', modelVendor: 'custom' },
        { parameters: builtImages.parameters },
      ),
    }
    const references = resolveGenerationReferences(node)

    expect(buildCatalogTaskRequest(node, { references }).request.kind).toBe('text_to_image')
    expect(buildCatalogTaskRequest(node, { references: { ...references, referenceImages: ['https://ref.test/a.png'] } }).request.kind)
      .toBe('image_edit')
  })
})
