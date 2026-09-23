import type { GenerationCanvasNode } from '../../../generationCanvas/model/generationCanvasTypes'
import { nodeShotField, overriddenShotFields } from '../../../generationCanvas/model/storyboardOverrides'
import type { ModelOption } from '../../../../config/models'
import { resolveArchetypeForModel } from '../../../../../electron/shared/modelArchetypes'
import type { ArchetypeMode, ArchetypeReferenceSlot, ModelArchetype } from '../../../../../electron/shared/modelArchetypes/types'
import type { ModelParameterControl } from '../../../../config/modelCatalogMeta'
import type { PlanAnchor, PlanShot } from '../../../generationCanvas/agent/storyboardPlan'
import { defaultCarrierForKind } from '../../../generationCanvas/agent/storyboardPlanEdits'
import { shotBindingsOf } from './shotReferenceSlots'

/**
 * 分镜行的**纯 derive 层**（v5 表形态）：画面格红态与参考区三形态都从「该行模型的档案 mode」
 * 推出来，与渲染解耦、可单测。storyboardPlanEdits 管 plan 的编辑，这里管「plan × 模型档案」的
 * 只读投影——档案是另一个真相源（P4 通用第一：按 slot 声明渲染，不为具体模型写 if）。
 */

/** 解析该镜当前生效的档案 mode（modeId 缺省 → 档案默认 mode）。无模型/无档案 → null。 */
export function resolveShotArchetypeMode(
  modelOption: ModelOption | null | undefined,
  modeId: string | undefined,
): { archetype: ModelArchetype; mode: ArchetypeMode } | null {
  if (!modelOption) return null
  const archetype = resolveArchetypeForModel({
    modelKey: modelOption.modelKey || modelOption.value,
    modelAlias: modelOption.modelAlias,
    vendorKey: modelOption.vendor,
    meta: modelOption.meta,
  })
  if (!archetype) return null
  const modes = archetype.modes
  const mode = modes.find((m) => m.id === modeId) ?? modes.find((m) => m.id === archetype.defaultModeId) ?? modes[0]
  if (!mode) return null
  return { archetype, mode }
}

/** 该 mode 的画幅控件（提示词块上沿的一等胶囊）。没有该参数的模型 → null（不渲染胶囊）。 */
export function aspectControlOf(mode: ArchetypeMode | null | undefined): ModelParameterControl | null {
  if (!mode) return null
  return mode.params.find((control) => control.key === 'aspect_ratio' && control.type === 'select') ?? null
}

/** 该镜引用的视觉锚（生成参考图那类；文本锚只拼 prompt，不占参考槽）。 */
export function referencedVisualAnchors(shot: PlanShot, anchors: readonly PlanAnchor[]): PlanAnchor[] {
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]))
  return shot.anchorIds
    .map((id) => byId.get(id))
    .filter((anchor): anchor is PlanAnchor => !!anchor && (anchor.carrier ?? defaultCarrierForKind(anchor.kind)) === 'visual')
}

/**
 * 该镜**缺必填参考**的槽（画面格红态 + 场组头「缺必填」计数的唯一判定）。
 * 判据只有一条：**按声明算** —— `min` 是唯一的必填信号，已绑定或计划供给的来源不足才缺。
 * - 非图片镜启用首帧时，原 materializer 会创建 first_frame 依赖；它和已绑定首帧至多算同一个来源；
 * - 图参考数组槽（image_ref）另可被引用的视觉锚满足（落画布时锚连 reference/character_ref 边），两条来源相加；
 * - 无模型/无档案（默认模型）→ 无契约可判，恒 []。
 *
 * 修的是什么：以前「非 image_ref 的必填槽无条件返回 true」——Seedance 首帧/首尾帧、Veo 首尾帧那些行
 * 于是**永远红、永远进不了批量**，而且行内没有任何能让它变绿的入口（红态只看契约不看内容）。
 */
export function missingRequiredSlots(
  mode: ArchetypeMode | null | undefined,
  shot: PlanShot,
  anchors: readonly PlanAnchor[],
): ArchetypeReferenceSlot[] {
  if (!mode) return []
  const visualCount = referencedVisualAnchors(shot, anchors).length
  return mode.slots.filter((slot) => {
    if (slot.min < 1) return false
    const bound = shotBindingsOf(shot, slot.kind).length
    const plannedFirstFrame = slot.kind === 'first_frame' && shot.shotKind !== 'image' && shot.keyframe?.enabled === true
    const anchorCredit = slot.kind === 'image_ref' ? visualCount : 0
    return Math.max(bound, plannedFirstFrame ? 1 : 0) + anchorCredit < slot.min
  })
}

// 参考列的视图模型**不在这一层**：v6 改成「一个槽一个格」之后它由 `shotReferenceCells.ts` 拥有
// （v5 的 `referenceZoneView` / `ReferenceZoneView` 已随本次改版删除——它把数组槽的每一张素材
// 都摊成一个 tile，正是行高被撑爆的成因，见合同 §4.1 规则①）。

/** Single owner: unmarked fields belong to the plan; marked fields belong to the original canvas node. */
export function effectiveShotValue(shot: PlanShot, node: GenerationCanvasNode | null | undefined, field: string): unknown {
  if (node && overriddenShotFields(node).includes(field)) return nodeShotField(node, field)
  if (field.startsWith('params.')) return shot.params?.[field.slice(7)]
  return shot[field as keyof PlanShot]
}
