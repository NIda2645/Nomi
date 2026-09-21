import {
  deconstructionShotTableSchema,
  type DeconstructionShotTableDocument,
  type ShotTableColumn,
} from '../../../../../electron/shared/canvas/shotTable'
import type { DeconstructionResult, StoredDeconstructionResult } from '../deconstructionTypes'

export function defaultFactColumns(): ShotTableColumn[] {
  return ['shotSize', 'motion', 'visual', 'dialogue', 'onScreenText', 'mood'].map((columnId, order) => ({
    columnId, kind: 'builtin', labelKey: columnId, order, visible: true,
  }))
}

export function createDeconstructionShotTable(sourceNodeId: string, title: string): DeconstructionShotTableDocument {
  return deconstructionShotTableSchema.parse({
    schemaVersion: 1, source: { kind: 'deconstruction', sourceNodeId, title, status: 'idle' },
    columnSetId: 'facts', columns: defaultFactColumns(), rows: [],
    view: { selectedRowIds: [], density: 'auto' }, revision: 0, updatedAt: new Date().toISOString(),
  })
}

/**
 * 引擎结果 → 分镜表。
 *
 * 入参收 `DeconstructionResult | StoredDeconstructionResult`：前者是**这次刚拆出来的**（`cutCoverage` 必填），
 * 后者是**从老节点 meta 读回来的**（2026-09-22 之前落盘的没有这一块）。
 * 缺了就让 `source.cutCoverage` 也缺着——schema 那边是 `.optional()`，读得回来；
 * **绝不在这里编一个默认值**：老数据里已经没有任何依据能还原它当时是不是被压过上限，
 * 补一个 `capped:false` 就是把「不知道」伪造成「完整」。
 */
export function deconstructionResultToShotTable(
  table: DeconstructionShotTableDocument,
  result: DeconstructionResult | StoredDeconstructionResult,
): DeconstructionShotTableDocument {
  return deconstructionShotTableSchema.parse({
    ...table,
    // 拆完了但有话要说（如「对白没取到」）→ 顶上一行留着那句原因。没有话说才清空。
    // `cutCoverage` 跟着结果一起落进表：表存起来、重开项目再读回来时，「这张表是不是整条片子」
    // 仍然答得出来——否则重启一次就又变回一张看不出缺口的表。
    source: { ...table.source, status: 'ready', durationSeconds: result.durationSeconds, cutCoverage: result.cutCoverage, failedShotIndexes: result.failedShotIndexes, errorMessage: result.failureReason || undefined, failureKind: result.failureKind },
    rows: result.shots.map((shot) => ({
      rowId: `fact-${shot.index}`, order: shot.index,
      startSeconds: shot.startSeconds, endSeconds: shot.endSeconds, durationSeconds: shot.durationSeconds,
      carriedOver: shot.carriedOver, visionFailed: shot.visionFailed,
      ...(shot.sourceFrameUrl.startsWith('nomi-local://') ? { keyframeRef: shot.sourceFrameUrl } : {}),
      cells: {
        shotSize: shot.shotSize, motion: shot.motionPrompt, visual: shot.visual,
        dialogue: shot.dialogue, onScreenText: shot.onScreenText, mood: shot.mood,
        ...Object.fromEntries(table.columns.filter((column) => column.kind === 'custom')
          .map((column) => [column.columnId, shot.custom[column.columnId] ?? shot.custom[column.labelKey] ?? ''])),
      },
      imagePrompt: shot.imagePrompt, motionPrompt: shot.motionPrompt,
    })),
    revision: table.revision + 1,
    updatedAt: new Date().toISOString(),
  })
}
