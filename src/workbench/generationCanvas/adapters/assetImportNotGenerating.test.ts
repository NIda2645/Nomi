import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importLocalMediaFilesToGenerationCanvas } from './assetImportAdapter'
import { useGenerationCanvasStore, __resetGenerationCanvasHistoryForTests } from '../store/generationCanvasStore'
import { generationFeedback } from '../../observability/generationFeedback'
import type { WorkbenchAssetDto } from '../../api/assetUploadApi'
import {
  createProjectCanvasReadSurfaceCoordinator,
  registerProjectCanvasReadSurfaceCoordinator,
  withProjectAction,
  type ProjectExecutionContext,
} from '../../project/projectCanvasReadSurface'
import type { CanvasReadSurfaceBridge } from '../../../../electron/shared/surfacePortBinding'

// 导入现在必须带着「发起时的那个项目」跑（2026-09-17 合入的项目身份单点签发）：
// 这里用与 assetImportAdapter.test.ts 同一份真协调器，而不是绕开它塞状态。
function currentProject(): ProjectExecutionContext {
  return withProjectAction((context) => context, () => { throw new Error('no project open') })
}
const makeCoordinator = () => createProjectCanvasReadSurfaceCoordinator({
  createSurfaceInstanceId: () => 'window',
  getSurfaceBridge: () => ({
    suspend: async () => ({ suspension: {} }), release: async () => ({ released: true }),
    commitCanvasRead: async ({ projectId }: { projectId: string }) => ({ binding: { binding: {
      projectId, immutableProjectUuid: '11111111-1111-4111-8111-111111111111', projectGeneration: 1,
    } } }),
  } as unknown as CanvasReadSurfaceBridge),
})
let coordinator: ReturnType<typeof makeCoordinator>
let unregister: () => void

/**
 * 导入不是生成。把「正在拷文件」写成生成词表里的 `queued`，整套生成过程反馈
 * （含等待层与它的无 GPU 兜底块）就会误挂到导入节点上——2026-09-14「深灰卡中间一根蓝条」的根因。
 */
describe('导入中的节点不得伪装成排队中的生成', () => {
  beforeEach(async () => {
    coordinator = makeCoordinator(); unregister = registerProjectCanvasReadSurfaceCoordinator(coordinator)
    const epoch = coordinator.beginHydration()
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
    await epoch.commitCanvasRead('project-a')
    __resetGenerationCanvasHistoryForTests()
    useGenerationCanvasStore.getState().restoreSnapshot({ nodes: [], edges: [], selectedNodeIds: [], groups: [] })
  })
  afterEach(() => { unregister?.() })

  it('建卡那一刻状态不是 queued/running，导入中的真相只在 meta.uploadStatus', async () => {
    // 定值断言：赋值发生在 Promise 执行器里，TS 的控制流看不见它，写成 `| null` 会被窄成 null。
    let release!: (asset: WorkbenchAssetDto) => void
    const uploadFile = vi.fn(() => new Promise<WorkbenchAssetDto>((resolve) => { release = resolve }))
    const pending = importLocalMediaFilesToGenerationCanvas(
      [new File([new Uint8Array(64)], 'shot.png', { type: 'image/png', lastModified: 1 })],
      {
        projectContext: currentProject(),
        capacity: null,
        basePosition: { x: 0, y: 0 },
        createObjectUrl: () => 'blob:preview',
        revokeObjectUrl: vi.fn(),
        readImageDimensions: async () => ({ width: 3840, height: 2160 }),
        uploadFile: uploadFile as never,
        recoverFile: async () => null,
      },
    )
    await vi.waitFor(() => expect(useGenerationCanvasStore.getState().nodes).toHaveLength(1))
    const node = useGenerationCanvasStore.getState().nodes[0]
    expect(node.meta?.uploadStatus).toBe('uploading')
    expect(node.status).not.toBe('queued')
    expect(node.status).not.toBe('running')
    // 直接问那套派生：导入中的节点不该被判成「有生成在跑」，生成等待层因此不会挂上来。
    expect(generationFeedback(node, Date.now())?.active ?? false).toBe(false)

    release({ id: 'a1', name: 'shot.png', createdAt: '', updatedAt: '', userId: 'local', data: { url: 'nomi-local://p/shot.png' } })
    await pending
    expect(useGenerationCanvasStore.getState().nodes[0].status).toBe('success')
  })
})
