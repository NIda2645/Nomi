import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { directorPreviewBlocksForOperation } from '../generationCanvas/nodes/director/model/directorPreviewState'

/**
 * 3D-BOX 花钱闸：Agent 的 generate 出卡前问「这次的镜头里哪些被预演挡着」。
 * 判据只住 directorPreviewState；这里只把线上的入参收成干净形状。
 * candidateReferences 是主进程只读出的「每一镜候选带了哪些素材」。
 */
export function directorPreviewBlocksOp(data: Record<string, unknown>): { blocks: ReturnType<typeof directorPreviewBlocksForOperation> } {
  const operationId = typeof data.operationId === 'string' ? data.operationId : ''
  const shotIds = Array.isArray(data.shotIds) ? data.shotIds.filter((value): value is string => typeof value === 'string') : undefined
  const raw = data.candidateReferences && typeof data.candidateReferences === 'object' && !Array.isArray(data.candidateReferences) ? data.candidateReferences as Record<string, unknown> : undefined
  const candidateReferences = raw ? Object.fromEntries(Object.entries(raw).map(([shotId, ids]) => [shotId, Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []])) : undefined
  return { blocks: operationId ? directorPreviewBlocksForOperation(useGenerationCanvasStore.getState().nodes, operationId, shotIds, candidateReferences) : [] }
}
