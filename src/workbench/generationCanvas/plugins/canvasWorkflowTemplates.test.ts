import { describe, expect, it } from 'vitest'
import { captureCanvasWorkflowTemplate, instantiateCanvasWorkflowTemplate } from './canvasWorkflowTemplates'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../model/generationCanvasTypes'

const node = (id: string, x: number, y: number): GenerationCanvasNode => ({
  id, kind: 'text', title: id, position: { x, y }, size: { width: 200, height: 120 }, pluginState: {
    pluginId: 'nomi.workflow', pluginVersion: '1.0.0', typeId: 'nomi.workflow/checkpoint', schemaVersion: 1, state: { checked: true },
  }, typeId: 'nomi.workflow/checkpoint',
})
const edge = (source: string, target: string): GenerationCanvasEdge => ({ id: `${source}-${target}`, source, target, mode: 'reference' })

describe('canvas workflow templates', () => {
  it('captures only selected nodes/internal edges with relative positions', () => {
    const template = captureCanvasWorkflowTemplate([node('a', 100, 200), node('b', 340, 260), node('c', 700, 200)], [edge('a', 'b'), edge('b', 'c')], ['a', 'b'], '镜头检查', 'template-1', 10)
    expect(template?.name).toBe('镜头检查')
    expect(template?.nodes.map((item) => item.relativePosition)).toEqual([{ x: 0, y: 0 }, { x: 240, y: 60 }])
    expect(template?.edges).toHaveLength(1)
  })

  it('creates fresh identities while preserving plugin state and layout', () => {
    const template = captureCanvasWorkflowTemplate([node('a', 100, 200), node('b', 340, 260)], [edge('a', 'b')], ['a', 'b'], '', 'template-1', 10)!
    let nextId = 0
    const created = instantiateCanvasWorkflowTemplate(template, { x: 50, y: 70 }, () => `new-${++nextId}` as GenerationCanvasNode['kind'], (source, target, index) => `${source}-${target}-${index}`)
    expect(created.nodes.map((item) => item.position)).toEqual([{ x: 50, y: 70 }, { x: 290, y: 130 }])
    expect(created.nodes.map((item) => item.id)).toEqual(['new-1', 'new-2'])
    expect(created.nodes[0].pluginState?.state).toEqual({ checked: true })
    expect(created.edges).toEqual([{ id: 'new-1-new-2-0', source: 'new-1', target: 'new-2', mode: 'reference' }])
  })
})
