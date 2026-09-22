// T-ED-06 终态保证：**每个分镜表节点必须落到成功 / 失败 / 可找回三者之一，没有「永远在跑」这一格**。
//
// 依据 docs/audit/2026-09-17-post-804-walkthrough.md §6.5：拆解跑到一半把 app 关掉再打开，
// 分镜表节点永久停在「本地找切点 / 0 镜」——不报错、不续跑、不提示可重试，和「正在跑」长得一模一样。
//
// 这里按「中断有几种」逐条钉：进程重启（快照 + 事件尾巴重放）/ 项目被替换（窗口关掉、切项目）/
// 子进程或引擎死 / 用户取消。每一条都断言节点在有限步内落到终态，且**有一句用户看得见的话**。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGenerationCanvasStore } from '../../store/generationCanvasStore'
import { abandonPendingCanvasWrite } from '../../events/canvasWriteBoundary'
import { readShotTable } from '../../../../../electron/shared/canvas/shotTable'
import { isDeconstructionTerminal } from './deconstructionLifecycle'
import { cancelDeconstruction, deconstructToShotTable, ensureDeconstructionShotTable } from './factBridge'

const bridge = vi.hoisted(() => ({ deconstruct: vi.fn(), onDeconstructionProgress: vi.fn(() => vi.fn()) }))
vi.mock('../../../../desktop/bridge', () => ({ getDesktopBridge: () => ({ video: bridge }) }))

const project = vi.hoisted(() => ({ controller: new AbortController() }))
function originProject() {
  const signal = project.controller.signal
  return {
    binding: { projectId: 'isolated-project', immutableProjectUuid: 'uuid', projectGeneration: 1 },
    signal,
    assertCurrent() { if (signal.aborted) throw Object.assign(new Error('stale'), { code: 'project_binding_stale' }) },
  }
}

beforeEach(() => {
  project.controller = new AbortController()
  abandonPendingCanvasWrite()
  bridge.deconstruct.mockReset()
  useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], groups: [], selectedNodeIds: [] })
})

function sourceVideo(): string {
  const store = useGenerationCanvasStore.getState()
  const node = store.addNode({ kind: 'video', title: 'Reference', position: { x: 0, y: 0 }, meta: {} })
  store.updateNode(node.id, { result: { id: 'result', type: 'video', url: 'nomi-local://isolated-project/video.mp4', createdAt: 1 } })
  return node.id
}

function tableSource(tableId: string) {
  const table = readShotTable(useGenerationCanvasStore.getState().nodes.find(node => node.id === tableId)?.meta)
  if (table?.source.kind !== 'deconstruction') throw new Error('expected a deconstruction table')
  return table.source
}

describe('deconstruction node terminal state', () => {
  it('落到中断可找回态，而不是重启后永远停在「本次拆解进行中」', () => {
    // 磁盘上的项目文件：拆到一半退出，快照里 status 还是 running。
    const persistedSnapshot = {
      nodes: [{
        id: 'table-1', kind: 'shot_table', title: 'Reference', position: { x: 0, y: 0 }, status: 'idle',
        meta: {
          shotTable: {
            schemaVersion: 1,
            source: { kind: 'deconstruction', sourceNodeId: 'video-1', title: 'Reference', status: 'running', phase: 0 },
            columnSetId: 'facts', columns: [], rows: [],
            view: { selectedRowIds: [], density: 'auto' }, revision: 3, updatedAt: '2026-09-17T09:50:00.000Z',
          },
        },
      }],
      edges: [], groups: [], selectedNodeIds: [],
    }
    // 快照之后还落了一截事件尾巴（写进度那几下也走 canvas.node.updated）。
    const eventTail = [{
      type: 'canvas.node.updated',
      payload: {
        nodeId: 'table-1',
        patch: {
          meta: {
            shotTable: {
              schemaVersion: 1,
              source: { kind: 'deconstruction', sourceNodeId: 'video-1', title: 'Reference', status: 'running', phase: 0 },
              columnSetId: 'facts', columns: [], rows: [],
              view: { selectedRowIds: [], density: 'auto' }, revision: 4, updatedAt: '2026-09-17T09:50:30.000Z',
            },
          },
        },
      },
    }]

    const store = useGenerationCanvasStore.getState()
    store.restoreSnapshot(persistedSnapshot)
    useGenerationCanvasStore.getState().applyEventTail(eventTail)

    const source = tableSource('table-1')
    expect(source.status).not.toBe('running')
    expect(isDeconstructionTerminal(source.status)).toBe(true)
    // 「可找回」不是「什么都没发生」：必须留一句用户看得见的话，否则空表和「还没拆过」长得一样。
    expect(source.errorMessage).toBeTruthy()
    expect(source.phase).toBeUndefined()
  })

  it('项目被换走（窗口关掉 / 切项目）后落中断态，而不是把 running 永久焊死', async () => {
    const sourceId = sourceVideo()
    const tableId = ensureDeconstructionShotTable(sourceId)!
    bridge.deconstruct.mockImplementation(async () => {
      project.controller.abort()
      project.controller = new AbortController()
      return { shots: [], durationSeconds: 0, hasAudio: false, failedShotIndexes: [] }
    })
    await deconstructToShotTable(sourceId, originProject())
    const source = tableSource(tableId)
    expect(source.status).not.toBe('running')
    expect(isDeconstructionTerminal(source.status)).toBe(true)
    expect(source.errorMessage).toBeTruthy()
  })

  it('引擎 / ffmpeg 子进程死掉时落失败态并带上原因', async () => {
    const sourceId = sourceVideo()
    bridge.deconstruct.mockRejectedValue(new Error('镜头切点检测失败（code -1）：ffmpeg 被杀'))
    const tableId = await deconstructToShotTable(sourceId, originProject())
    const source = tableSource(tableId!)
    expect(source.status).toBe('failed')
    expect(source.errorMessage).toContain('ffmpeg 被杀')
    expect(isDeconstructionTerminal(source.status)).toBe(true)
  })

  it('用户取消时落取消态，且取消后还能重新拆解', async () => {
    const sourceId = sourceVideo()
    const tableId = ensureDeconstructionShotTable(sourceId)!
    let releaseEngine!: () => void
    const engineHeld = new Promise<void>(resolve => { releaseEngine = resolve })
    let engineStarted!: () => void
    const started = new Promise<void>(resolve => { engineStarted = resolve })
    bridge.deconstruct.mockImplementation(async () => {
      engineStarted()
      await engineHeld
      return { shots: [], durationSeconds: 0, hasAudio: false, failedShotIndexes: [] }
    })
    const running = deconstructToShotTable(sourceId, originProject())
    await started
    cancelDeconstruction(tableId)
    expect(tableSource(tableId).status).toBe('cancelled')
    releaseEngine()
    await running
    // 取消之后引擎的迟到结果不许把表拽回 ready。
    expect(tableSource(tableId).status).toBe('cancelled')
    expect(isDeconstructionTerminal(tableSource(tableId).status)).toBe(true)
    // 取消是终态，但不是死胡同：重新拆解要能起来。
    bridge.deconstruct.mockResolvedValue({ shots: [], durationSeconds: 0, hasAudio: false, failedShotIndexes: [] })
    await deconstructToShotTable(sourceId, originProject())
    expect(tableSource(tableId).status).toBe('ready')
  })
})
