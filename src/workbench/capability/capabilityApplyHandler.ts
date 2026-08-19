import { useGenerationCanvasStore } from '../generationCanvas/store/generationCanvasStore'
import { getActiveWorkbenchProjectId } from '../project/workbenchProjectSession'
import { useSpendConfirmStore } from '../generationCanvas/spend/spendConfirm'
import { getDesktopBridge } from '../../desktop/bridge'
import i18n from '../../i18n'
import { runStoryboardPlanner } from '../generationCanvas/agent/runStoryboardPlanner'
import { runDirectionPlanner } from '../generationCanvas/agent/runDirectionPlanner'
import { useWorkbenchStore } from '../workbenchStore'
import { mintSpendGrant } from '../api/taskApi'
import { runGenerationNode } from '../generationCanvas/runner/generationRunController'
import { arrangeStoryboardToTimeline } from '../generationCanvas/agent/sendStoryboardToTimeline'
import { exportTimelineToMp4 } from '../export/exportApi'
import { verifyShotsAndReport, useShotVerifyStore, isShotVerifyEnabled } from '../generationCanvas/agent/shotVerifyStore'

// 能力核 A 模式实时桥 · 渲染层处理器。
// 主进程把外部 MCP 的画布读/写/付费确认转发到这里（只在该项目正打开时路由），处理后回结果。
// 单一真相源：画布读写复用 store 现成动作（readDocumentSnapshot / applyExternalGraph），
// 付费确认复用全仓唯一的 useSpendConfirmStore（不另造并行 UI，P1）。

type SpendConfirmPayload = {
  projectId?: string
  projectName?: string
  nodeId?: string
  intent?: string
  vendor?: string
  modelKey?: string
  prompt?: string
  /** 主进程带上：这次确认还会换来「本会话该项目后续生成免问」→ 卡上多写一句授权范围。 */
  grantsSessionTrust?: boolean
}

// 方案门（Phase B）：外部 agent 批量落节点前的确认。projectId 由主进程网关带上（可能非当前项目）。
type PlanConfirmPayload = {
  projectId?: string
  nodeCount?: number
  titles?: string[]
}

function describeIntent(intent: string | undefined): string {
  const normalized = String(intent || '')
  if (normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'text') {
    return i18n.t(`runtime.capability.intent.${normalized}`)
  }
  return i18n.t('runtime.capability.intent.fallback')
}

/** 外部 MCP 付费确认：弹全仓唯一的确认对话框（agent 来源 + 明细 + 60s 倒计时），真人点了才回 confirmed。 */
async function confirmSpendForAgent(info: SpendConfirmPayload): Promise<{ confirmed: boolean }> {
  const store = useGenerationCanvasStore.getState()
  const node = store.nodes.find((item) => item.id === info.nodeId)
  const nodeLabel =
    node?.title?.trim() ||
    (typeof node?.prompt === 'string' && node.prompt.trim()
      ? node.prompt.trim().slice(0, 24)
      : i18n.t('runtime.capability.newNode'))
  // 参考图门 vs 生成门（Phase B）：定妆/场景卡（meta.referenceSheet）= 参考图门（相机图标+措辞），否则生成门。
  const isReference = Boolean(node?.meta && (node.meta as Record<string, unknown>).referenceSheet === true)
  const promptPreview = typeof info.prompt === 'string' && info.prompt.trim() ? info.prompt.trim().slice(0, 60) : ''
  const projectName = typeof info.projectName === 'string' ? info.projectName.trim() : ''
  const ok = await useSpendConfirmStore.getState().requestConfirm({
    kind: isReference ? 'reference' : 'generation',
    title: isReference
      ? i18n.t('runtime.capability.referenceTitle')
      : i18n.t('runtime.capability.spendTitle', { intent: describeIntent(info.intent) }),
    // 授权范围写在脸上：这一点下去还会换来「本会话该项目后续生成免问」，不写明就是骗同意（D4）。
    message: [
      promptPreview
        ? i18n.t('runtime.capability.spendMessageWithPrompt', {
            prompt: `${promptPreview}${info.prompt && info.prompt.length > 60 ? '…' : ''}`,
          })
        : i18n.t('runtime.capability.spendMessage'),
      ...(info.grantsSessionTrust ? [i18n.t('runtime.capability.spendGrantsSessionTrust')] : []),
    ].join('\n'),
    confirmLabel: i18n.t('runtime.capability.confirmGenerate'),
    source: 'agent',
    countdownMs: 60_000,
    details: [
      // 项目行放第一位：用户可能不在这个项目里，先让他知道花在哪个项目。
      ...(projectName ? [{ label: i18n.t('runtime.capability.project'), value: projectName }] : []),
      { label: i18n.t('runtime.capability.node'), value: nodeLabel },
      {
        label: i18n.t('runtime.capability.model'),
        value: [info.vendor, info.modelKey].filter(Boolean).join(' · ') || i18n.t('runtime.capability.defaultModel'),
      },
      { label: i18n.t('runtime.capability.output'), value: describeIntent(info.intent) },
    ],
  })
  return { confirmed: Boolean(ok) }
}

/** 外部 MCP 方案门（Phase B）：agent 要往画布落一套节点（≥2）前弹确认卡（免费可撤），复用同一漏斗（P1）。 */
async function confirmPlanForAgent(info: PlanConfirmPayload): Promise<{ confirmed: boolean }> {
  const count = typeof info.nodeCount === 'number' ? info.nodeCount : 0
  const titles = Array.isArray(info.titles) ? info.titles.filter((t) => typeof t === 'string' && t.trim()) : []
  const preview = titles.slice(0, 5).join('、') + (titles.length > 5 ? '…' : '')
  const projectName = (() => {
    if (!info.projectId) return ''
    const active = getActiveWorkbenchProjectId()
    return info.projectId === active ? '' : info.projectId // 非当前项目才显 id 提示（当前项目无需重复）
  })()
  const ok = await useSpendConfirmStore.getState().requestConfirm({
    kind: 'plan',
    title: i18n.t('runtime.capability.planTitle'),
    message: i18n.t('runtime.capability.planMessage', { count }),
    confirmLabel: i18n.t('runtime.capability.planConfirm'),
    source: 'agent',
    countdownMs: 60_000,
    details: [
      ...(projectName ? [{ label: i18n.t('runtime.capability.project'), value: projectName }] : []),
      { label: i18n.t('runtime.capability.planNodeCount'), value: i18n.t('runtime.capability.planNodeCountValue', { count }) },
      ...(preview ? [{ label: i18n.t('runtime.capability.planIncludes'), value: preview }] : []),
    ],
  })
  return { confirmed: Boolean(ok) }
}

/** 从 content 偏差的 `actual`（人话「第 N 档」）抠回 1-5 档分数；抠不出给 undefined。 */
function scoreFromDeviationActual(actual: unknown): number | undefined {
  const match = typeof actual === 'string' ? actual.match(/(\d+)/) : null
  if (!match) return undefined
  const n = Number(match[1])
  return Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : undefined
}

/**
 * W1.5 路径②审片：production run 的 qa 阶段让渲染层对本次生成镜头判分。
 * 复用**现成的** verifyShotsAndReport（判分+对账卡+回灌闭环，内部逻辑一字不改），
 * 这里只做参数适配（run 的镜头节点 id → 它的入参）+ 从 shotVerify store 读回判决塑形回传。
 * 判决 = content 偏差（每条 kind:'content' 回指 shotNodeId + 维度 field + 档位 actual + reason）；
 * 被审但无偏差的镜头 = 过检。verify 关闭 / 无镜头 → skipped（driver 据此落「审片跳过」）。
 */
async function verifyShotsForProduction(shotNodeIds: readonly string[]): Promise<unknown> {
  if (!isShotVerifyEnabled()) return { skipped: true, skipReason: '画面审片已在设置中关闭' }
  const knownNodeIds = new Set(useGenerationCanvasStore.getState().nodes.map((node) => node.id))
  const reviewedShotIds = shotNodeIds.filter((id) => knownNodeIds.has(id))
  if (reviewedShotIds.length === 0) return { skipped: true, skipReason: '当前项目里找不到本次生成的镜头节点' }
  // 现成闭环：内部 gather → 判分 → 写 shotVerify store（不改它）。判决从 store 读回。
  await verifyShotsAndReport(reviewedShotIds)
  const deviations = useShotVerifyStore.getState().deviations
  const flaggedByShot = new Map<string, Array<{ dimensionName?: string; score?: number; reason?: string }>>()
  for (const deviation of deviations) {
    if (deviation.kind !== 'content' || !deviation.shotNodeId) continue
    const list = flaggedByShot.get(deviation.shotNodeId) ?? []
    list.push({
      dimensionName: typeof deviation.field === 'string' ? deviation.field : undefined,
      score: scoreFromDeviationActual(deviation.actual),
      reason: typeof deviation.reason === 'string' ? deviation.reason : undefined,
    })
    flaggedByShot.set(deviation.shotNodeId, list)
  }
  const nodesById = new Map(useGenerationCanvasStore.getState().nodes.map((node) => [node.id, node]))
  const verdicts = reviewedShotIds.map((shotNodeId) => {
    const flagged = flaggedByShot.get(shotNodeId) ?? []
    const title = (nodesById.get(shotNodeId)?.title || '').trim()
    return {
      shotNodeId,
      passed: flagged.length === 0,
      ...(title ? { shotTitle: title } : {}),
      ...(flagged.length ? { flagged } : {}),
    }
  })
  return { reviewedShotIds, verdicts }
}

/** 处理一条主进程转发来的能力操作。未知操作抛错（主进程会把错误透传给 agent）。 */
export async function handleCapabilityApply(op: string, payload: unknown): Promise<unknown> {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const projectId = typeof data.projectId === 'string' ? data.projectId : ''
  const activeId = getActiveWorkbenchProjectId()
  // 画布读写**只能**作用于当前打开的项目（动 store → 必须是活动项目，否则串台）；目标≠活动 → 拒。
  // 确认门（spend.confirm / plan.confirm）不在此限：AI 想在「非当前项目」生成/落方案时也弹全局卡，
  // 卡里标明项目名，确认后走盘落地（不动非活动 store）。这正是治静默黑洞的关键放开。
  if (op !== 'spend.confirm' && op !== 'plan.confirm' && projectId && activeId && projectId !== activeId) {
    throw new Error(i18n.t('runtime.capability.projectChanged'))
  }

  switch (op) {
    case 'canvas.read-doc':
      return useGenerationCanvasStore.getState().readDocumentSnapshot()
    case 'canvas.apply':
      useGenerationCanvasStore.getState().applyExternalGraph(data.snapshot)
      return { ok: true }
    case 'spend.confirm':
      return confirmSpendForAgent(data as SpendConfirmPayload)
    case 'plan.confirm':
      return confirmPlanForAgent(data as PlanConfirmPayload)
    case 'production.plan-directions': {
      // B1 方向门：driver 停在 awaiting_direction 时让渲染层拟 2-3 个「创意方向」候选（三选一）。
      // 走无工具的一次性文本链路（runDirectionPlanner），语言跟随 brief。失败冒泡给 driver 走
      // gate title/summary 兜底——不静默编造候选（诚实降级）。
      const brief = data.brief && typeof data.brief === 'object' && !Array.isArray(data.brief)
        ? data.brief as Record<string, unknown>
        : {}
      const playbook = data.playbook && typeof data.playbook === 'object' && !Array.isArray(data.playbook)
        ? data.playbook as Record<string, unknown>
        : null
      return runDirectionPlanner({ brief, playbook })
    }
    case 'production.plan-storyboard': {
      const brief = data.brief && typeof data.brief === 'object' && !Array.isArray(data.brief)
        ? data.brief as Record<string, unknown>
        : {}
      const result = await runStoryboardPlanner({
        storyText: typeof brief.goal === 'string' ? brief.goal : '',
        skill: { key: 'brand.promo', name: '品牌宣传片' },
      })
      const plan = useWorkbenchStore.getState().storyboardPlan
      if (!plan) throw new Error(i18n.t('runtime.capability.storyboardPlanMissing'))
      return { text: result.text, plan }
    }
    case 'production.generate-node': {
      const nodeId = typeof data.nodeId === 'string' ? data.nodeId.trim() : ''
      if (!nodeId) throw new Error('Production generation requires a node')
      const grantId = await mintSpendGrant([nodeId], typeof data.maxAttemptsPerJob === 'number' ? data.maxAttemptsPerJob : undefined)
      const result = await runGenerationNode(nodeId, { grantId })
      return {
        nodeId,
        status: 'succeeded',
        assets: result.url ? [{ type: result.type, url: result.url, ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}) }] : [],
      }
    }
    case 'production.arrange': {
      const result = arrangeStoryboardToTimeline()
      if (!result.ok && result.total === 0) throw new Error('没有可排片的镜头')
      return { arranged: result.sent.length, total: result.total, placed: result.sent.map((item) => ({ nodeId: item.nodeId, role: item.role, startFrame: item.startFrame })), skipped: result.skipped }
    }
    case 'production.verify-shots': {
      // W1.5：qa 阶段审片（路径②）。driver 传本次已生成的镜头节点 id，渲染层复用现成审片闭环判分回传。
      const shotNodeIds = Array.isArray(data.shotNodeIds)
        ? data.shotNodeIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : []
      return verifyShotsForProduction(shotNodeIds)
    }
    case 'production.export': {
      const project = typeof data.projectId === 'string' ? data.projectId : ''
      const state = useWorkbenchStore.getState()
      const result = await exportTimelineToMp4({
        projectId: project,
        timeline: state.timeline,
        aspectRatio: state.previewAspectRatio,
        generationNodes: useGenerationCanvasStore.getState().nodes,
        outputName: typeof data.outputName === 'string' ? data.outputName : undefined,
      })
      return { relativePath: result.relativePath, size: result.size }
    }
    default:
      throw new Error(i18n.t('runtime.capability.unknownOperation', { operation: op }))
  }
}

let unregister: (() => void) | null = null

/** 在 app 启动时注册一次（NomiStudioApp）。重复注册先反注册旧的。preload 无 onApply（老版本）则 no-op。 */
export function registerCapabilityApplyHandler(): void {
  unregister?.()
  unregister = null
  const onApply = getDesktopBridge()?.capability?.onApply
  if (typeof onApply === 'function') {
    unregister = onApply(handleCapabilityApply)
  }
}
