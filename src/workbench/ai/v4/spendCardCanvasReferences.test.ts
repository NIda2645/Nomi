// 付费卡第 4 条：画布上连到这一镜占位节点的参考图算数——卡上看得见，确认时发出去；卡上拿掉就不发，画布连线不动。
import { describe, expect, it } from 'vitest'
import type { PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import type { GenerationCanvasEdge, GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import { applyPatchToNode, candidatePatchFromNode, projectSpendNode } from './spendCardDraft'
import { canvasReferenceInputs, referenceInputsFromNode } from './spendCardReferences'

const REF_URL = 'nomi-local://asset/project-1/ref-cat.png'

const shot: PendingSpendShot = {
  shotId: 'shot-2', nodeId: 'node-2', index: 2, prompt: '清晨的渔港', providerId: 'apimart', modelId: 'doubao-seedance-2.0',
  modeId: 'omni', variantId: 'fast', parameters: { resolution: '480p', duration: 4 }, price: { known: false },
}

/** 画布上那一镜的占位节点（同一个模型档案），一张图片节点连到它。 */
function canvas(): { placed: GenerationCanvasNode; nodes: GenerationCanvasNode[]; edges: GenerationCanvasEdge[] } {
  const card = projectSpendNode(shot)!
  const placed = { ...card, id: 'node-2', position: { x: 400, y: 0 } } as GenerationCanvasNode
  const image = { id: 'img-1', kind: 'image', position: { x: 0, y: 0 }, prompt: '', status: 'success',
    result: { id: 'r1', type: 'image', url: REF_URL, createdAt: 1 }, meta: {} } as unknown as GenerationCanvasNode
  const edge = { id: 'e-1', source: 'img-1', target: 'node-2' } as unknown as GenerationCanvasEdge
  return { placed, nodes: [image, placed], edges: [edge] }
}

describe('付费卡 · 画布连线带来的参考图', () => {
  it('卡上摆出画布连到这一镜的参考图，确认时它在发出去的那一份里（第 7 行）', () => {
    const { placed, nodes, edges } = canvas()
    const fromCanvas = canvasReferenceInputs(placed, nodes, edges)
    expect(fromCanvas.map((input) => input.url)).toEqual([REF_URL])
    const card = projectSpendNode(shot, placed, undefined, fromCanvas)!
    expect(referenceInputsFromNode(card, shot).map((input) => input.url), '卡上看得见这张参考图').toContain(REF_URL)
    const sent = candidatePatchFromNode(card, shot)
    expect(sent?.referenceInputs?.map((input) => input.url), '确认时发出去的就是卡上那一份').toEqual([REF_URL])
  })

  it('卡上拿掉这张参考图：发出去的那一份里没有它；画布连线一根不动（第 8 行）', () => {
    const { placed, nodes, edges } = canvas()
    const before = JSON.stringify(edges)
    const card = projectSpendNode(shot, placed, undefined, canvasReferenceInputs(placed, nodes, edges))!
    const removed = applyPatchToNode(card, { referenceInputs: [] })
    const sent = candidatePatchFromNode(removed, shot)
    expect(sent?.referenceInputs ?? [], '供应商收到 0 张参考图').toEqual([])
    expect(JSON.stringify(edges), '画布上的连线没动').toBe(before)
  })

  it('连了线但源还没出图：此刻发不出去，卡上也不说会发', () => {
    const { placed, nodes, edges } = canvas()
    const pendingSource = nodes.map((node) => node.id === 'img-1' ? { ...node, result: undefined, status: 'idle' } as unknown as GenerationCanvasNode : node)
    expect(canvasReferenceInputs(placed, pendingSource, edges)).toEqual([])
  })
})
