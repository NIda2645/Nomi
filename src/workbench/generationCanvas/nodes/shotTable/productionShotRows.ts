import type { ModelOption } from '../../../../config/models'
import type { GenerationCanvasNode } from '../../model/generationCanvasTypes'
import { deriveNodeRowExec } from '../../../creation/storyboard/exec/storyboardRowStatus'
import { referenceColumnOf } from '../../../creation/storyboard/shotRow/shotReferenceCells'
import type { ReferenceBindingMap } from '../../../creation/storyboard/shotRow/shotReferenceSlots'
import { resolveShotArchetypeMode } from '../../../creation/storyboard/shotRow/shotRowModel'
import { referenceSlotStorage } from '../controls/archetypeMeta'
import type { ArchetypeMode } from '../../../../config/modelArchetypes/types'
import { deriveShotPlaceholderState } from '../../../production/shotPlaceholderState'

/** 落地 store 缓存的那份 Run。类型从渲染层自己的占位派生函数取，渲染层不直接引主进程模块（check:boundaries）。 */
export type LandedRun = NonNullable<Parameters<typeof deriveShotPlaceholderState>[0]>
import type { ShotTableRowView } from './selectShotTableRows'

/**
 * `shot_table(production)` 的行：**从画布节点 derive，零缓存**。Agent 分镜只有一份账本
 * （Run 的 generationPlan → 落地节点），这张表是那组节点的表格表示版。
 *
 * 两半列的来源与方案表同一条纪律：左半（画面）= 节点 prompt；右半（参考槽）= 该节点所选模型的
 * `mode.slots`，绑定按画布同一张 referenceSlotStorage 表从 meta 读回。
 */

function metaOf(node: GenerationCanvasNode): Record<string, unknown> {
  return (node.meta as Record<string, unknown> | undefined) ?? {}
}

/** 该 Run 落在画布上的镜头节点（锚 = 参考卡，不占镜号；跨分类副本 / 基于此重生成的不算）。按画布顺序 = 落地顺序。 */
export function productionShotNodes(nodes: readonly GenerationCanvasNode[], runId: string): GenerationCanvasNode[] {
  return nodes.filter((node) => {
    const meta = metaOf(node)
    return meta.productionRunId === runId && meta.productionShotRole !== 'anchor' && !node.regeneratedFrom && !node.derivedFrom
  })
}

function durationOf(node: GenerationCanvasNode): number {
  const meta = metaOf(node)
  const value = node.kind === 'image' ? meta.imageDurationSec : meta.duration
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function modeOf(node: GenerationCanvasNode, imageModelOptions: readonly ModelOption[], videoModelOptions: readonly ModelOption[]): ArchetypeMode | null {
  const meta = metaOf(node)
  const modelKey = typeof meta.modelKey === 'string' ? meta.modelKey : ''
  if (!modelKey) return null
  const vendor = typeof meta.modelVendor === 'string' ? meta.modelVendor : typeof meta.vendor === 'string' ? meta.vendor : ''
  const options = node.kind === 'image' ? imageModelOptions : videoModelOptions
  const option = options.find((candidate) => candidate.value === modelKey && (!vendor || candidate.vendor === vendor)) ?? null
  const modeId = (meta.archetype as { modeId?: unknown } | undefined)?.modeId
  return resolveShotArchetypeMode(option, typeof modeId === 'string' ? modeId : undefined)?.mode ?? null
}

/** 节点 meta 里的参考绑定 → 参考列的绑定图（键 = 槽 kind，与 shotReferenceMetaPatch 写入的是同一张存储表）。 */
function bindingsOf(node: GenerationCanvasNode, mode: ArchetypeMode | null): ReferenceBindingMap {
  const meta = metaOf(node)
  const bindings: ReferenceBindingMap = {}
  for (const slot of mode?.slots ?? []) {
    const storage = referenceSlotStorage(slot)
    if (!storage) continue
    const value = meta[storage.metaKey]
    const urls = storage.isArray
      ? (Array.isArray(value) ? value.filter((url): url is string => typeof url === 'string' && url.length > 0) : [])
      : typeof value === 'string' && value ? [value] : []
    bindings[slot.kind] = urls.map((url) => ({ url }))
  }
  return bindings
}

export function selectProductionShotRows(input: {
  runId: string
  nodes: readonly GenerationCanvasNode[]
  imageModelOptions: readonly ModelOption[]
  videoModelOptions: readonly ModelOption[]
  /** 落地 store 里缓存的 Run（占位三态的来源）；不是这个 Run 或没有 → 只看节点。 */
  run?: LandedRun | null
}): ShotTableRowView[] {
  const { runId, nodes, imageModelOptions, videoModelOptions } = input
  const run = input.run && input.run.runId === runId ? input.run : null
  return productionShotNodes(nodes, runId).map((node, position) => {
    const phase = run ? deriveShotPlaceholderState(run, node.id) : null
    const exec = deriveNodeRowExec(node, phase?.phase === 'generating'
      ? { generating: true }
      : phase?.phase === 'failed' ? { failedMessage: phase.failureMessage ?? '' } : undefined)
    const mode = modeOf(node, imageModelOptions, videoModelOptions)
    return {
      id: node.id,
      index: position + 1,
      duration: durationOf(node),
      prompt: node.prompt ?? '',
      thumbnail: exec.resultUrl ?? undefined,
      exec,
      references: referenceColumnOf(mode, bindingsOf(node, mode)),
    }
  })
}
