// P4 S6 — 多镜物化节点（meta.productionRunId）失败重试的 onRetry 收口（把决策从 BaseGenerationNode 壳里抽出来，
// 守 800 行门岗 R9）。返回：多镜节点 + 项目已开 → 走返工链（同 Run 新 Job + 锚继承 + 单镜确认，§3.E）；否则 undefined
// （由调用方退回本地重跑/素材重导入，单镜与普通节点行为不变 = 回归门）。
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { useProductionCanvasLandingStore } from '../../production/productionCanvasLandingStore'
import { reworkProductionShot } from '../../production/productionShotActions'

/** 多镜物化节点走返工链的 onRetry；非多镜/项目没开 → null（调用方兜底本地重跑）。 */
export function useProductionNodeRetry(node: GenerationCanvasNode): (() => void) | null {
  const meta = node.meta as Record<string, unknown> | undefined
  const runId = typeof meta?.productionRunId === 'string' && meta.productionRunId ? meta.productionRunId : ''
  const shotId = typeof meta?.productionShotId === 'string' && meta.productionShotId ? meta.productionShotId : undefined
  const projectId = useProductionCanvasLandingStore((store) => store.projectId)
  if (!runId || !projectId) return null
  return () => { void reworkProductionShot(projectId, runId, shotId) }
}
