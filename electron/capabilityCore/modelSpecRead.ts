// 对外/对内模型面的**分级披露**读侧：薄名单一档、单模型详情一档。
//
// 住在自己的文件里而不是 core.ts：core 贴着 800 行门岗（R9），而这两支本身是一个完整单元
// ——它们是「模型说明书」这份知识的唯一出口，两个模型面都从这里取。
import { readCatalog } from '../catalog/catalogStore'
import { currentCatalogFingerprint } from './modelOnboarding/dispatch'
import { agentModelEntriesFromCatalog } from '../catalog/agentModelEntriesFromCatalog'
import {
  findModelEntry,
  modelSpecDetail,
  modelSpecRow,
  type ModelSpecDetail,
  type ModelSpecRow,
} from '../shared/agentCapabilities/modelSpecProjection'

/**
 * 对外模型面的**薄名单**：每行只留选型需要的最少字段。与应用内 Agent 的薄名单
 * 是同一个 `modelSpecRow` 投影，不是第二份（用户拍板：MCP 不能重造一套，而是复用）。
 */
export function listModelSpecRows(): ModelSpecRow[] {
  return agentModelEntriesFromCatalog(readCatalog()).map((row) => modelSpecRow(row.entry, row.availability))
}

/** 对外模型面的**单模型详情**：全部模式、参数、参考槽、变体。找不到 → null（协议层转 error）。 */
export function readModelSpecDetail(modelId: string, vendor?: string | null): ModelSpecDetail | null {
  const rows = agentModelEntriesFromCatalog(readCatalog())
  const entry = findModelEntry(rows.map((row) => row.entry), modelId, vendor)
  if (!entry) return null
  const availability = rows.find((row) => row.entry === entry)!.availability
  return modelSpecDetail(entry, availability)
}

/**
 * 取详情，取不到就**带出路地拒**——与准入层那族同一条纪律：
 * 事实进 `details`（语言中立），人话由 `buildToolErrorOutcome` 的码表按 locale 出。
 */
export function requireModelSpecDetail(modelId: string, vendor: unknown): ModelSpecDetail {
  const detail = readModelSpecDetail(modelId, typeof vendor === 'string' ? vendor : undefined)
  if (detail) return detail
  throw Object.assign(new Error(`Unknown model: ${modelId}`), {
    code: 'unknown_model_identity',
    details: { modelKey: modelId, ...(typeof vendor === 'string' ? { vendor } : {}) },
  })
}

/**
 * `models.list` / `models.read` 的路由那一半。放这里而不是 dispatcher：
 * 两档分级是同一份知识的两个出口，出口逻辑跟着知识走（dispatcher 也贴着 800 行门岗）。
 */
export function dispatchModelSpec(method: string, params: Record<string, unknown>): unknown {
  if (method === 'models.read') {
    const modelId = typeof params.modelId === 'string' ? params.modelId.trim() : ''
    if (!modelId) {
      throw Object.assign(new Error('target=model requires modelId'), {
        code: 'unknown_model_identity',
        details: { at: 'modelId' },
      })
    }
    return requireModelSpecDetail(modelId, params.vendor)
  }
  // `fingerprint` 与 `nomi_remove_provider` 的 `ifUnchanged` 同一个函数算，不许两份。
  return { models: listModelSpecRows(), fingerprint: currentCatalogFingerprint() }
}
