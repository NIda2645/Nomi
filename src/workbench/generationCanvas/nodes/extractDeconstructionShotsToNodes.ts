// 「把选中的拆解镜头落成画布节点」整动作（不碰 UI，拆解面板调用它）。
//
// 复用既有「批量产出逐步冒出 + 自动编组」拍板（2026-08-02，见 [[batch-output-appears-progressively-and-grouped]]）：
//   逐个抽帧 → 逐个落节点（逐个冒）→ 落完自动编成一组 → 整批一个 Cmd+Z。
//
// 与 extractShotCutsToNodes 的两点差异（故不直接复用它，另起一条）：
//   1. **携带 meta.videoAnalysis**：每个节点带上这一镜的 imagePrompt/motionPrompt（提示词随节点走，方案 §3.1）。
//   2. **整批一个撤销步**：走 multiShotCanvasLanding 同款事务（withCanvasGestureContext + suppressUndoBarriers，
//      ctx 外先打一个 barrier）——N 个 addNode 各自的 barrier 被抑制，一次 Cmd+Z 撤整批。
//      （extractShotCutsToNodes 每 addNode 打一个 barrier=N 步撤销，不满足本处「整批一个 Cmd+Z」的拍板。）
import { resolveNodeVisualSize } from './nodeSizing'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
import { useWorkbenchStore } from '../../workbenchStore'
import { getActiveWorkbenchProjectId } from '../../project/workbenchProjectSession'
import { getDesktopBridge } from '../../../desktop/bridge'
import { toast } from '../../../ui/toast'
import { withCanvasGestureContext } from '../events/canvasGestureContext'
import { pushUndoSnapshot } from '../events/canvasUndoJournal'
import { interruptPendingCanvasWrite } from '../events/canvasWriteBoundary'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import type { DeconstructionShot } from './deconstructionTypes'
import { shotCutNodePositions } from './shotCutSelection'
import i18n from '../../../i18n'

export type ExtractDeconstructionProgress = { done: number; total: number }

/** 一镜落节点时随身携带的分析（图片/运镜提示词随节点走，供后续「整组当参考生成」直接取用）。 */
type ShotNodeMeta = {
  sourceShotIndex: number
  startSeconds: number
  endSeconds: number
  shotSize: string
  mood: string
  imagePrompt: string
  motionPrompt: string
  onScreenText: string
  dialogue: string
}

export async function extractDeconstructionShotsToNodes(params: {
  node: GenerationCanvasNode
  shots: readonly DeconstructionShot[]
  onProgress?: (progress: ExtractDeconstructionProgress) => void
}): Promise<{ created: number; failed: number; groupId: string | null }> {
  const { node, shots, onProgress } = params
  const videoUrl = node.result?.url
  if (node.result?.type !== 'video' || !videoUrl || !shots.length) return { created: 0, failed: 0, groupId: null }

  const projectId = getActiveWorkbenchProjectId()
  if (!projectId) {
    toast(i18n.t('generationCommon.node.extractFrame.missingProject'), 'error')
    return { created: 0, failed: 0, groupId: null }
  }
  const extractFrame = getDesktopBridge()?.video?.extractFrame
  if (!extractFrame) {
    toast(i18n.t('generationCommon.node.extractFrame.desktopOnly'), 'error')
    return { created: 0, failed: 0, groupId: null }
  }

  const size = resolveNodeVisualSize(node)
  // 复用切图九宫格的紧凑网格坐标（配 exactPosition 跳过逐卡避让，否则会被推散）。
  const positions = shotCutNodePositions({ origin: node.position, sourceSize: size, count: shots.length })
  const sourceTitle = (node.title || i18n.t('generationCommon.node.extractFrame.defaultVideoTitle')).trim()

  // 整批一个撤销步（multiShotCanvasLanding 同款事务）：ctx 外先打一个 barrier，批内 addNode 各自的 barrier 被抑制。
  interruptPendingCanvasWrite()
  const txnId = `txn_deconstruct_land_${node.id}_${Date.now()}`
  const ctx = { source: 'user' as const, txnId, suppressUndoBarriers: true }
  const inTxn = <T,>(fn: () => T): T => withCanvasGestureContext(ctx, fn)
  let barrierPlaced = false

  const createdIds: string[] = []
  let failed = 0
  // 抽帧是逐个 ffmpeg（几十张会花点时间）→ 串行 + 逐个报进度（别一次并发几十个进程打满机器）。
  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i] as DeconstructionShot
    onProgress?.({ done: i, total: shots.length })
    // 抽这一镜中点那帧（拿它当节点画面；引擎的 sourceFrameUrl 是同一张，但那是只读对照、可能未持久成节点素材）。
    const at = (shot.startSeconds + shot.endSeconds) / 2
    let url: string
    try {
      const result = await extractFrame({ videoUrl, which: at, projectId })
      url = result?.url || ''
    } catch {
      failed += 1
      continue
    }
    if (!url) { failed += 1; continue }
    // 第一张真要落时才打 barrier（纯失败空跑不占撤销步）。
    if (!barrierPlaced) { pushUndoSnapshot(); barrierPlaced = true }
    const meta: ShotNodeMeta = {
      sourceShotIndex: shot.index,
      startSeconds: shot.startSeconds,
      endSeconds: shot.endSeconds,
      shotSize: shot.shotSize,
      mood: shot.mood,
      imagePrompt: shot.imagePrompt,
      motionPrompt: shot.motionPrompt,
      onScreenText: shot.onScreenText,
      dialogue: shot.dialogue,
    }
    const created = inTxn(() =>
      useGenerationCanvasStore.getState().addNode({
        kind: 'image',
        title: i18n.t('generationCommon.node.deconstruct.nodeTitle', {
          shot: shot.index,
          size: shot.shotSize || i18n.t('generationCommon.node.deconstruct.unknownSize'),
        }),
        position: positions[i] ?? node.position,
        exactPosition: true,
        categoryId: node.categoryId,
        // 提示词随节点走（图片提示词进 prompt，全量分析进 meta.videoAnalysis 供整组生成取用）。
        prompt: shot.imagePrompt || '',
        meta: { videoAnalysis: meta },
      }),
    )
    const createdAt = Date.now()
    inTxn(() =>
      useGenerationCanvasStore.getState().updateNode(created.id, {
        result: { id: `deconstruct-${shot.index}-${createdAt}`, type: 'image', url, createdAt },
      }),
    )
    createdIds.push(created.id)
  }
  onProgress?.({ done: shots.length, total: shots.length })

  let groupId: string | null = null
  if (createdIds.length) {
    // 自动成一组：拆出来的一整场戏立刻能整组喂参考 / 一起生成（拍板 2026-08-02）。
    const group = inTxn(() =>
      useGenerationCanvasStore.getState().createGroup(
        node.categoryId || 'shots',
        i18n.t('generationCommon.node.deconstruct.groupName', { title: sourceTitle }),
        { nodeIds: createdIds },
      ),
    )
    groupId = group?.id ?? null
    inTxn(() => useGenerationCanvasStore.getState().selectNodes(createdIds))
    // 落完把整块揭进视口（同批量/切图既有 fit 信号），否则多半一半落在视口外。
    useWorkbenchStore.getState().requestCanvasFit(node.categoryId || 'shots')
  }

  if (failed > 0) {
    toast(i18n.t('generationCommon.node.deconstruct.someFailed', { failed, created: createdIds.length }), 'error')
  }
  return { created: createdIds.length, failed, groupId }
}
