import { describe, expect, it } from 'vitest'
import { COMFYUI_WORKFLOW_CORPUS } from './comfyuiWorkflowFixtures'
import {
  analyzeComfyWorkflow,
  buildImportedWorkflow,
  normalizeWorkflowBinding,
  parseComfyApiWorkflow,
} from './comfyuiWorkflowImport'

describe('ComfyUI generic workflow corpus', () => {
  it.each(COMFYUI_WORKFLOW_CORPUS.filter((fixture) => fixture.api))('$id obeys the shared input contract', (fixture) => {
    const graph = parseComfyApiWorkflow(JSON.stringify(fixture.api))
    const analysis = analyzeComfyWorkflow(graph)
    const normalized = normalizeWorkflowBinding(analysis.suggested, graph)
    expect(analysis.imageInputs.map((input) => input.mediaKind)).toEqual(fixture.mediaKinds)
    expect(Boolean(analysis.suggested.promptNodeId)).toBe(fixture.expectPrompt)
    if (fixture.outputKind) {
      const built = buildImportedWorkflow(graph, normalized)
      expect(built.parameters.filter((parameter) => parameter.type === 'image-url')).toHaveLength(fixture.mediaKinds.length)
      expect(built.parameters.filter((parameter) => parameter.type === 'image-url').map((parameter) => parameter.mediaKind)).toEqual(fixture.mediaKinds)
      expect(built.kind).toBe(fixture.outputKind)
      expect(analysis.suggested.outputKind).toBe(fixture.outputKind)
    }
    if (fixture.unsupportedOutputKinds) {
      expect(analysis.outputNodes.map((output) => output.kind)).toEqual(fixture.unsupportedOutputKinds)
      expect(analysis.suggested.outputNodeId).toBeUndefined()
      expect(() => buildImportedWorkflow(graph, normalized)).toThrow(/输出/)
    }
  })

  it('rejects a UI-saved graph instead of treating it as API format', () => {
    const fixture = COMFYUI_WORKFLOW_CORPUS.find((item) => item.id === 'ui-export')
    expect(() => parseComfyApiWorkflow(JSON.stringify(fixture?.ui))).toThrow(/界面保存|Export \(API\)/)
  })
})
