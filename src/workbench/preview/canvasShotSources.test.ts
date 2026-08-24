import { describe, it, expect } from 'vitest'
import type { GenerationCanvasNode } from '../generationCanvas/model/generationCanvasTypes'
import { selectCanvasShotSources } from './canvasShotSources'

// 剪辑页左栏「镜头」的数据口径锁：
// ① 只收已出片（result.url）的图/视频；② 镜号读 shotIndex 存储身份，不按位置自造；
// ③ 参考卡/首帧图不占号但仍可入轨；④ 有号在前按号排，无号按画布位置稳定排。

function node(partial: Partial<GenerationCanvasNode> & { id: string }): GenerationCanvasNode {
  return {
    kind: 'video',
    title: partial.id,
    position: { x: 0, y: 0 },
    categoryId: 'shots',
    ...partial,
  } as GenerationCanvasNode
}

const withResult = (id: string, extra: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode =>
  node({ id, result: { id: `r-${id}`, type: 'video', url: `nomi-local://asset/p/${id}.mp4`, createdAt: 0 }, ...extra })

describe('selectCanvasShotSources', () => {
  it('只收有产物 url 的图/视频节点', () => {
    const nodes = [
      withResult('a', { shotIndex: 1 }),
      node({ id: 'no-result', shotIndex: 2 }),
      node({ id: 'empty-url', shotIndex: 3, result: { id: 'r', type: 'video', url: '   ', createdAt: 0 } }),
      node({ id: 'text', kind: 'text', shotIndex: 4, result: { id: 'r', type: 'text', text: 'hi', createdAt: 0 } }),
      node({ id: 'audio', kind: 'audio', result: { id: 'r', type: 'audio', url: 'a.mp3', createdAt: 0 } }),
    ]
    expect(selectCanvasShotSources(nodes).map((s) => s.nodeId)).toEqual(['a'])
  })

  it('镜号读 shotIndex 存储身份，按号升序（不按画布位置重排）', () => {
    const nodes = [
      withResult('third', { shotIndex: 3, position: { x: 0, y: 0 } }),
      withResult('first', { shotIndex: 1, position: { x: 0, y: 900 } }),
      withResult('second', { shotIndex: 2, position: { x: 0, y: 400 } }),
    ]
    const sources = selectCanvasShotSources(nodes)
    expect(sources.map((s) => s.shotIndex)).toEqual([1, 2, 3])
    expect(sources.map((s) => s.nodeId)).toEqual(['first', 'second', 'third'])
  })

  it('参考卡与首帧图不占镜号，但仍列出可入轨', () => {
    const nodes = [
      withResult('ref', { kind: 'image', meta: { referenceSheet: true } }),
      withResult('keyframe', { kind: 'image', meta: { storyboardKeyframe: true } }),
      withResult('shot', { shotIndex: 1 }),
    ]
    const sources = selectCanvasShotSources(nodes)
    expect(sources).toHaveLength(3)
    expect(sources[0]).toMatchObject({ nodeId: 'shot', shotIndex: 1 })
    expect(sources.filter((s) => s.shotIndex === null).map((s) => s.nodeId).sort()).toEqual(['keyframe', 'ref'])
  })

  it('无号的按画布位置（y 后 x）稳定排在有号之后', () => {
    const nodes = [
      withResult('low', { categoryId: 'assets', position: { x: 10, y: 500 } }),
      withResult('high', { categoryId: 'assets', position: { x: 10, y: 100 } }),
      withResult('numbered', { shotIndex: 7 }),
    ]
    expect(selectCanvasShotSources(nodes).map((s) => s.nodeId)).toEqual(['numbered', 'high', 'low'])
  })

  it('空画布返回空数组（左栏据此出空态）', () => {
    expect(selectCanvasShotSources([])).toEqual([])
  })

  it('带出封面与媒体类型供格子渲染', () => {
    const nodes = [
      withResult('v', { shotIndex: 1, result: { id: 'r', type: 'video', url: 'v.mp4', thumbnailUrl: 'cover.jpg', createdAt: 0 } }),
      withResult('i', { kind: 'image', shotIndex: 2, result: { id: 'r2', type: 'image', url: 'i.png', createdAt: 0 } }),
    ]
    const sources = selectCanvasShotSources(nodes)
    expect(sources[0]).toMatchObject({ mediaType: 'video', thumbnailUrl: 'cover.jpg', url: 'v.mp4' })
    expect(sources[1]).toMatchObject({ mediaType: 'image', thumbnailUrl: '', url: 'i.png' })
  })
})
