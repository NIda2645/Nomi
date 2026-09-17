import { describe, expect, it } from 'vitest'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import type { ProductionRun } from '../../../../../electron/productionRun/productionRunTypes'
import { createProductionShotTable } from '../../../../../electron/shared/canvas/shotTable'
import { selectShotTableRows } from './selectShotTableRows'

// 分镜表 = Run 落地节点的表格表示版：行从节点 derive，Run 的占位三态只在节点自己没结果时补位。

function node(id: string, meta: Record<string, unknown>, extra: Partial<GenerationCanvasNode> = {}): GenerationCanvasNode {
  return { id, kind: 'image', title: id, position: { x: 0, y: 0 }, prompt: `prompt ${id}`, categoryId: 'shots', meta, ...extra }
}
const landed = (id: string, extra: Partial<GenerationCanvasNode> = {}, role: 'shot' | 'anchor' = 'shot') =>
  node(id, { productionRunId: 'run-1', productionShotId: id, productionShotRole: role, materializationOperationId: 'canvas-landing:run-1' }, extra)

const table = createProductionShotTable('run-1', 'canvas-landing:run-1')
const rows = (nodes: GenerationCanvasNode[], run: ProductionRun | null = null) =>
  selectShotTableRows({ table, designs: {}, nodes, imageModelOptions: [], videoModelOptions: [], run })

describe('selectShotTableRows · production source', () => {
  it('rows are the run\'s shot nodes in canvas order; anchors, other runs and derived copies are not rows', () => {
    const view = rows([
      landed('a1', {}, 'anchor'),
      landed('s1'),
      node('foreign', { productionRunId: 'run-2', productionShotId: 'x' }),
      landed('s2'),
      landed('s2-copy', { derivedFrom: 's2' }),
      node('user-card', {}),
    ])
    expect(view.map((row) => [row.id, row.index, row.prompt])).toEqual([['s1', 1, 'prompt s1'], ['s2', 2, 'prompt s2']])
  })

  it('status and thumbnail come from the node: result → done, node running → generating, error → failed, nothing → ready', () => {
    const view = rows([
      landed('done', { result: { id: 'r', type: 'image', url: 'nomi-local://done.png', createdAt: 1 } }),
      landed('busy', { status: 'running', progress: { percent: 40 } }),
      landed('broken', { status: 'error', error: '上游拒了' }),
      landed('fresh'),
    ])
    expect(view.map((row) => [row.id, row.exec?.status, row.thumbnail ?? null, row.exec?.progressPercent ?? null])).toEqual([
      ['done', 'done', 'nomi-local://done.png', null],
      ['busy', 'generating', null, 40],
      ['broken', 'failed', null, null],
      ['fresh', 'ready', null, null],
    ])
    expect(view[2].exec?.errorMessage).toBe('上游拒了')
  })

  it('the Run\'s job phase fills in only while the node has no result of its own', () => {
    const run = {
      runId: 'run-1', status: 'running', jobs: [
        { jobId: 'j1', nodeId: 'queued-shot', status: 'polling', createdAt: '2026-09-18T00:00:00.000Z' },
        { jobId: 'j2', nodeId: 'finished', status: 'polling', createdAt: '2026-09-18T00:00:00.000Z' },
      ],
      generationPlan: { shots: [{ shotId: 'queued-shot', nodeId: 'queued-shot' }, { shotId: 'finished', nodeId: 'finished' }] },
    } as unknown as ProductionRun
    const view = rows([
      landed('queued-shot'),
      landed('finished', { result: { id: 'r', type: 'image', url: 'nomi-local://f.png', createdAt: 1 } }),
    ], run)
    expect(view.map((row) => row.exec?.status)).toEqual(['generating', 'done'])
    // 不是这个 Run 的缓存 → 只看节点。
    expect(rows([landed('queued-shot')], { ...run, runId: 'run-9' } as ProductionRun)[0].exec?.status).toBe('ready')
  })

  it('duration reads the node\'s declared duration and never invents one', () => {
    const view = rows([
      landed('v', { kind: 'video', meta: { productionRunId: 'run-1', productionShotRole: 'shot', duration: 5 } }),
      landed('i'),
    ])
    expect(view.map((row) => row.duration)).toEqual([5, 0])
  })
})
