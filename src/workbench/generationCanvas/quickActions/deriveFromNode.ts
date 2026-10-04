import type { GenerationCanvasEdgeMode, GenerationCanvasNode } from '../model/generationCanvasTypes'
import { nodeSelectedModelAddress } from '../nodes/controls/parameterControlModel'
import { resolveNodeVisualSize } from '../nodes/nodeSizing'
import type { GenerationRunOutcome } from '../runner/generationRunOutcome'
import type { GenerationConfirmationGuards } from '../runner/generationRunController'
import type { SpendInitiator } from '../spend/spendConfirm'
import { findQuickAction, type QuickActionGrid, type QuickActionId } from './quickActionCatalog'

/**
 * 一键派生（2026-10-04 节点快捷动作批次 1）：**建下游节点 + 连参考 + 填模板 + 沿用模型 + 提交**。
 *
 * 所有「点一下就生成」的入口（浮条预设场景 ▾、改图 ▾ 里花钱的那几项、以后的生成框预设与 Agent）
 * 都调这一个命令，不是每个按钮各写一套。本轮只有两样：
 *
 *   1. **规划**（`planDerivedNode`，纯函数）——新节点长什么样、放哪、怎么连、用哪条效果、沿用哪个模型；
 *   2. **派发口接口**（`DeriveDispatchPort`）——**没有实现**。
 *
 * ## 为什么派发只留接口（花钱边界）
 *
 * 画布付费今天从「渲染层确认 → 主进程内存令牌 → runTask」那台发动机出去；发动机收敛第一刀
 * （`docs/plan/2026-10-05-engine-convergence-cut1.md`）要把它并进制作流程。派生如果现在自己铸令牌、
 * 或直接调 `runGenerationNode`，就是**第三个钱口**——`spend.pending-identity` 的冻结名单里有
 * `mintSpendGrant`，新增调用处 `check:concept-owners` 会红。所以：
 *
 *   · 第一刀合入前，接线时**只许**这样实现：`dispatch = (nodeId, guards) => confirmAndRunNode(nodeId, guards)`
 *     ——那是画布单节点 ↑ 的同一扇门（E1）：用户单点不弹卡（09-25 拍板），第一次走匿名托管才弹披露卡；
 *   · 第一刀合入后：换成「画布生成这一镜」命令，派生出的节点建自己的单镜 Run。
 *
 * 两种实现都满足同一个接口，调用方（浮条）不用改。
 *
 * ## 「点了直接开跑」的边界（中途表见设计卡 §2）
 *
 *   · 新节点是本地的、免费的：先建好再提交。提交前任何打断（关窗 / 断网 / 换项目）都只留下一个空闲的新节点，不扣钱；
 *   · 派生**不是幂等的**：连点同一项 = 建两个新节点、各发一笔。这是「不弹确认」的代价，拍板时要讲清；
 *   · 失败落在**新节点**的错误卡上，源节点一个字段都不改；
 *   · 新节点 + 入边是一个撤销点（⌘Z 删掉它）；已经发出去的那一笔不因撤销而退。
 */

/** 派生出的节点上记一笔「我是谁派生的、出图是几行几列」，给「切成 N 张」与生成记录用。 */
export const QUICK_ACTION_META_KEY = 'quickAction'

export type QuickActionNodeMeta = Readonly<{
  id: QuickActionId
  sourceNodeId: string
  grid?: QuickActionGrid
}>

export type DeriveRequest = Readonly<{
  sourceNodeId: string
  actionId: QuickActionId
  /** 用户自己补的一句（模板在前、用户补充在后，生成记录里看得到拼好的全文）。浮条入口没有，生成框预设有。 */
  userSupplement?: string
  /** 谁发起的：浮条 = 'user'（不弹卡）；Agent = 'agent'（按现有判据一律弹卡）。 */
  initiator: SpendInitiator
}>

export type DerivedNodePlan = Readonly<{
  kind: 'image'
  /** 「多机位九宫格 · 雨夜街口」——标题带出身，画布上一眼看出它从哪来。 */
  title: string
  position: { x: number; y: number }
  categoryId?: string
  /** 源 → 新节点的那一条参考边。图片源接图片节点是通用参考（`selectConnectionEdgeMode` 同口径）。 */
  edge: Readonly<{ sourceNodeId: string; mode: GenerationCanvasEdgeMode }>
  /** 效果库条目；null = 没有模板（高清：要的是放大能力的模型）。正文在执行时从效果库取。 */
  effectId: string | null
  userSupplement?: string
  /** 沿用源节点选的模型；源没选过就交给现有默认模型选择（接线时由 `defaultNodeModelSelection` 补）。 */
  model: Readonly<{ vendorKey: string; modelKey: string }> | null
  meta: QuickActionNodeMeta
}>

/** 新节点放在源的右侧，与抽帧落点同一个间距（`extractVideoFrameToNode.ts`）；被占时由画布写入口的避让挪开。 */
export const DERIVED_NODE_GAP = 64

export function planDerivedNode(
  source: GenerationCanvasNode,
  request: Pick<DeriveRequest, 'actionId' | 'userSupplement'>,
  labels: { actionLabel: string; formatTitle: (action: string, source: string) => string },
): DerivedNodePlan {
  const action = findQuickAction(request.actionId)
  const size = resolveNodeVisualSize(source)
  const address = nodeSelectedModelAddress((source.meta ?? {}) as Record<string, unknown>)
  const sourceTitle = (source.title || '').trim()
  const supplement = request.userSupplement?.trim()
  return {
    kind: 'image',
    title: sourceTitle ? labels.formatTitle(labels.actionLabel, sourceTitle) : labels.actionLabel,
    position: { x: source.position.x + size.width + DERIVED_NODE_GAP, y: source.position.y },
    ...(source.categoryId ? { categoryId: source.categoryId } : {}),
    edge: { sourceNodeId: source.id, mode: 'reference' },
    effectId: action.effectId,
    ...(supplement ? { userSupplement: supplement } : {}),
    model: source.kind === 'image' && address.modelKey ? { vendorKey: address.vendorKey, modelKey: address.modelKey } : null,
    meta: { id: action.id, sourceNodeId: source.id, ...(action.grid ? { grid: action.grid } : {}) },
  }
}

/**
 * 唯一的派发口（接口）。实现见上面「为什么派发只留接口」——本轮**不实现**，
 * 也不许在别处为派生另写一条提交路。
 */
export type DeriveDispatchPort = {
  dispatch: (derivedNodeId: string, guards: GenerationConfirmationGuards) => Promise<GenerationRunOutcome>
}

/** 一次派生的结局：节点建没建、钱这一步走到哪。`blocked` = 一个节点都没建（例如没有能改图的模型）。 */
export type DeriveOutcome =
  | { status: 'blocked'; reason: 'no-image-model' | 'no-upscale-model' | 'missing-effect' }
  | { status: GenerationRunOutcome; derivedNodeId: string }

/** 派生出的节点身上那笔记录（读）。不是派生出来的节点返回 null。 */
export function readQuickActionMeta(node: Pick<GenerationCanvasNode, 'meta'>): QuickActionNodeMeta | null {
  const raw = (node.meta as Record<string, unknown> | undefined)?.[QUICK_ACTION_META_KEY]
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<QuickActionNodeMeta>
  if (typeof value.id !== 'string' || typeof value.sourceNodeId !== 'string') return null
  const grid = value.grid && Number.isInteger(value.grid.rows) && Number.isInteger(value.grid.cols) ? value.grid : undefined
  return { id: value.id as QuickActionId, sourceNodeId: value.sourceNodeId, ...(grid ? { grid } : {}) }
}
