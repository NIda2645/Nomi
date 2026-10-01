// Agent 面板付费确认卡的**接线**：宿主投影 ↔ 介入槽 ↔ 卡体那张生成框。
//
// ── 三个数据面，一份意图 ──
//
//   · **宿主投影**（`productionRunApi.pendingSpend`）——「有一笔生成在等你点头」+ **正式报价**。
//   · **覆写账本**（`spendCardDraft`）——用户在卡上改了什么。只活在卡里，画布一个字都不动。
//   · **durable 候选**——Run 里的 `generationPlan.candidate`。它才是供应商真正会收到的那份载荷。
//
// 2026-09-11（P1.1b）之前，卡体直接绑着画布上那个草稿节点：卡上改一个字画布当场就变，
// 而落地链又会按候选把节点重画回去——两个方向同时开着，用户看到的是「改了又弹回去」，
// 价格也因此只能等确认那一刻才更新。现在改动落在**卡自己的账本**上：
//
//   ① 画布节点在按下「生成」之前不动（用户没答应花钱，画布就不该被改）；
//   ② 「候选 → 节点」始终单向，拉锯没有了；
//   ③ 价格可以用**同一条算式**当场本地重算（`spendCardEstimate`），不必等一个来回。
//
// 按下主按钮那一刻才把账本发出去：逐镜 `generation.revise` → 主进程重新封印 → **正式报价**。
// 正式报价与本地估算理应逐分相同（同算式同价目）；真不同时以主进程为准、卡上原地把数字换掉，
// **不弹第二张卡、不打断**（2026-09-11 用户拍板）。
import React from 'react'
import { useTranslation } from 'react-i18next'
import { isProjectExecutionContextCurrent, withProjectAction } from '../../project/projectCanvasReadSurface'
import { getDesktopBridge } from '../../../desktop/bridge'
import { productionRunApi } from '../../production/productionRunApi'
import { toast } from '../../../ui/toast'
import { useGenerationCanvasStore } from '../../generationCanvas/store/generationCanvasStore'
import { GENERATION_NODE_KINDS, getGenerationNodeCatalogKind } from '../../generationCanvas/model/generationNodeKinds'
import { preloadModelOptions, MODEL_REFRESH_EVENT } from '../../../config/modelCatalogCache'
import type { ModelOption, NodeKind } from '../../../config/models'
import type { NodeWriteAccess } from '../../generationCanvas/nodes/nodeWriteAccess'
import type { GenerationCanvasNode } from '../../generationCanvas/model/generationCanvasTypes'
import type { PendingSpendConfirm, PendingSpendRead, PendingSpendShot } from '../../../desktop/productionRunBridgeTypes'
import { projectSpendCard, spendCardPage } from './agentPanelSpendCard'
import { logRendererWarn } from '../../../desktop/rendererLog'
import { canvasReferenceInputs } from './spendCardReferences'
import {
  spendDraftKey, restoreSpendDraft, retainSpendDraft, consumeSpendDraft,
  applyPatchToNode,
  candidatePatchFromNode,
  projectSpendNode,
  draftAfterNodeEdit,
  draftIsEmpty,
  effectivePatchForShot,
  revisionsForConfirm,
  EMPTY_SPEND_DRAFT,
  type SpendDraft,
} from './spendCardDraft'
import { priceDisagreements, pricingResolverFromModelOptions, repricePendingSpend, type SpendPriceDisagreement } from './spendCardEstimate'
import type { InterventionData } from './agentPanelV4Types'
import { missingCardReasonOfReadFailure, missingInterventionCard, type MissingCardReason } from './missingInterventionCard'
import { spendActionFailureCopy, type SpendActionOutcome } from './spendActionFailure'

/** 和任务中心同一个节拍：付费卡是同一批 Run 事实的另一个读者，不另立一套刷新频率。 */
const POLL_INTERVAL_MS = 1500

export function hasPendingSpendCapability(): boolean {
  return typeof getDesktopBridge()?.productionRuns?.pendingSpend === 'function'
}

/**
 * 主进程那份读结果 → 此刻卡上那一笔。`off`（本会话按配置没装这条面 / 还在起 / 已停）**不是失败**：
 * 这种相下没有任何一面能 announce「有一笔在等你」，所以没有卡可画，也没有错可报。
 * 只有主进程真的**拒绝**（装配抛了）才走 refresh 的 catch 渲那张会说话的卡。
 */
export function pendingSpendOfRead(read: PendingSpendRead): PendingSpendConfirm | undefined {
  return read.surface === 'ready' ? read.rows[0] : undefined
}

export type AgentPanelSpendConfirm = Readonly<{
  pending: PendingSpendConfirm | undefined
  /** 当前这一页的**草稿节点**（宿主投影 ⊕ 覆写）。它不在画布 store 里，改它不动画布。 */
  node: GenerationCanvasNode | undefined
  /** 卡体的写入面。`NodeGenerationComposer` 经它写，写到的是账本不是画布。 */
  writeAccess: NodeWriteAccess
  slot: InterventionData | undefined
  page: number
  busy: boolean
  /** 本地估算 ↔ 正式报价对不上的那些镜（正常为空）。以正式报价为准，卡上已原地更新。 */
  disagreements: readonly SpendPriceDisagreement[]
  setPage: (index: number) => void
  /** 「生成这张 / 这段」：只生成这一页这一镜。 */
  confirm: () => void
  /** 「生成剩下 N 张 / 段」：卡上还没决定的每一张各点一次「生成这张」（每张各记一笔授权）。 */
  confirmRemaining: () => void
  /** 「去掉这张 / 这段」：这一镜不生成，卡上剩下的照旧等人。 */
  remove: () => void
  discard: () => void
}>

export function useAgentPanelSpendConfirm(): AgentPanelSpendConfirm {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = React.useState<PendingSpendConfirm | undefined>(undefined)
  const [draft, setDraft] = React.useState<SpendDraft>(EMPTY_SPEND_DRAFT)
  const draftOwner = React.useRef<string | undefined>(undefined)
  const [page, setPage] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [disagreements, setDisagreements] = React.useState<readonly SpendPriceDisagreement[]>([])
  const [modelOptions, setModelOptions] = React.useState<readonly ModelOption[]>([])
  // 「读不到」是一种**结果**，不是一种空。它一路留到槽里，渲成一张会说话的卡。
  const [readFailure, setReadFailure] = React.useState<MissingCardReason | undefined>(undefined)
  const nodes = useGenerationCanvasStore((state) => state.nodes)
  const edges = useGenerationCanvasStore((state) => state.edges)
  // 「Nomi 选的」说的是**最初那一份**：用户在卡上换过模型之后这句话就不再为真。
  // 所以记的是这一笔第一次被看到时的模型身份，不是当前这一份（当前那份一改就跟着变，永远为真）。
  const originalModelIds = React.useRef<{ operationId: string; modelIds: readonly string[] } | null>(null)

  const refresh = React.useCallback(async (): Promise<PendingSpendConfirm | undefined> => {
    // 每次轮询都是一次读动作：此刻签发已打开的项目；回包到时它已不是当前项目就丢弃，不把上一个项目的卡闪进来。
    const project = withProjectAction((issued) => issued)
    if (!project) {
      setPending(undefined)
      return undefined
    }
    if (!hasPendingSpendCapability()) { setPending(undefined); setReadFailure(undefined); return undefined }
    try {
      const read = await productionRunApi.pendingSpend(project.binding.projectId)
      if (!isProjectExecutionContextCurrent(project)) return undefined
      const next = pendingSpendOfRead(read)
      const nextOwner = next ? spendDraftKey(next) : undefined
      if (draftOwner.current !== nextOwner) {
        // 账本锚的是**这一次生成**（`operationId`）：换了一次生成才是换了一本，读不到就是空。
        // 价格刷新、改参数推版、收回出价再出价都只换报价指纹，换不掉他正在打的那句话（裁决 B）。
        // 读永不抛（`readSpendDraft` 自己兜住），所以这里不需要「失败就别换 owner」的回退。
        const restored = next ? restoreSpendDraft(next) : EMPTY_SPEND_DRAFT
        draftOwner.current = nextOwner
        setDraft(restored)
        setDisagreements([])
      }
      setReadFailure(undefined)
      setPending(next)
      if (next && originalModelIds.current?.operationId !== next.operationId) {
        originalModelIds.current = { operationId: next.operationId, modelIds: next.shots.map((shot) => shot.modelId) }
        // 换了一笔 = 换了一份账本。旧覆写跟着走只会把上一笔的模型贴到这一笔上。
      }
      if (!next) {
        originalModelIds.current = null
        setDraft(EMPTY_SPEND_DRAFT)
      }
      return next
    } catch (error) {
      if (!isProjectExecutionContextCurrent(project)) return undefined
      // 2026-09-12：这里原来是「通道还没起来 / 项目正在切——这不是错误态，只是『现在没有
      // 要确认的东西』」，然后 `setPending(undefined)`。那句话把两件事说成了一件——
      // **读不到 ≠ 没有**。主进程现在只在「真的没有」时回空数组，抛出来的一律是失败；
      // 失败就必须让用户看见，否则模型说「请在确认卡上点头」而面板一片空白。
      setPending(undefined)
      setReadFailure(missingCardReasonOfReadFailure(error))
      return undefined
    }
  }, [])

  React.useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  const index = pending ? spendCardPage(pending, page) : 0
  const shot = pending?.shots[index]

  // 本地报价要的价目：就是模型下拉里那些行自带的 `pricing`（和主进程读的是同一份目录）。
  // 按这一笔涉及的节点 kind 预取；目录刷新时重取，好让「刚在设置里改完价目」当场生效。
  const kindKey = React.useMemo(() => {
    const kinds = new Set<NodeKind>()
    for (const entry of pending?.shots ?? []) {
      const node = entry.nodeId ? nodes.find((candidate) => candidate.id === entry.nodeId) : undefined
      if (node) kinds.add(getGenerationNodeCatalogKind(node.kind))
      else for (const kind of GENERATION_NODE_KINDS) kinds.add(getGenerationNodeCatalogKind(kind))
    }
    return [...kinds].sort().join(',')
  }, [pending, nodes])

  React.useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      const kinds = kindKey ? (kindKey.split(',') as NodeKind[]) : []
      if (kinds.length === 0) { if (!cancelled) setModelOptions([]); return }
      const loaded = await Promise.all(kinds.map(async (kind) => {
        try { return await preloadModelOptions(kind) } catch { return [] as ModelOption[] }
      }))
      if (!cancelled) setModelOptions(loaded.flat())
    }
    void load()
    const onRefresh = (): void => void load()
    if (typeof window !== 'undefined') window.addEventListener(MODEL_REFRESH_EVENT, onRefresh)
    return () => {
      cancelled = true
      if (typeof window !== 'undefined') window.removeEventListener(MODEL_REFRESH_EVENT, onRefresh)
    }
  }, [kindKey])

  const resolvePricing = React.useMemo(
    () => (modelOptions.length > 0 ? pricingResolverFromModelOptions(modelOptions) : undefined),
    [modelOptions],
  )

  // 卡上此刻这一份（本地重算过的）。投影层只认识这一种输入——「本地算的」和「宿主送来的」
  // 在它眼里没有区别，不需要第二条渲染分支。
  const repriced = React.useMemo(
    () => (pending ? repricePendingSpend(pending, draft, resolvePricing) : undefined),
    [pending, draft, resolvePricing],
  )

  /**
   * 卡上某一镜此刻摆着的那张框：宿主投影 ⊕ 画布连线带来的参考图 ⊕ **正在编辑的那一层**（见 spendCardDraft 顶部注释）。
   * 卡体（当前这一页）和「生成剩下 N 张」要发出去的每一页都读这一份——卡上看到的就是会发出去的（第 4 条），算法只有一份。
   */
  const shownNodeFor = React.useCallback((entry: PendingSpendShot): GenerationCanvasNode | undefined => {
    const placed = entry.nodeId ? nodes.find((candidate) => candidate.id === entry.nodeId) : undefined
    const option = modelOptions.find(candidate => candidate.modelKey === entry.modelId && candidate.vendor === entry.providerId)
    const base = projectSpendNode(entry, placed, option, canvasReferenceInputs(placed, nodes, edges))
    return base ? applyPatchToNode(base, effectivePatchForShot(draft, entry.shotId)) : undefined
  }, [nodes, edges, modelOptions, draft])

  // 卡体绑的那份草稿节点 = 当前这一页那一镜摆着的那张框。
  const draftNode = React.useMemo(() => (shot ? shownNodeFor(shot) : undefined), [shot, shownNodeFor])

  // 写入面：卡体所有改动都落这里。`latestNode` 必须回**草稿**那一份——增量 patch 要在最新值上
  // 合并，回 store 那份会把用户刚改的字段悄悄擦掉（lost-update）。
  const editContext = React.useRef<{ node: GenerationCanvasNode | undefined; shotId: string | undefined }>({
    node: undefined, shotId: undefined,
  })
  editContext.current = { node: draftNode, shotId: shot?.shotId }
  const pendingRef = React.useRef<PendingSpendConfirm | undefined>(undefined)
  pendingRef.current = pending

  // A writer belongs to one editing visit, not whichever card occupies the panel
  // when an upload settles. A -> B -> A creates a new visit and cannot revive A's
  // retired callbacks. Candidate/quote identity matters even when nodeId is equal.
  const writeOwner = JSON.stringify([
    pending?.projectId, pending?.runId, pending?.operationId, pending?.quoteId,
    pending?.candidateRevision, pending?.planVersion, shot?.shotId, shot?.nodeId,
  ])
  const writeScope = React.useMemo(() => ({ owner: writeOwner, active: true }), [writeOwner])
  const currentWriteScope = React.useRef(writeScope)
  currentWriteScope.current = writeScope
  React.useLayoutEffect(() => {
    writeScope.active = true
    return () => { writeScope.active = false }
  }, [writeScope])

  const writeAccess = React.useMemo<NodeWriteAccess>(() => {
    const nodeId = draftNode?.id
    const canWrite = () => Boolean(nodeId && writeScope.active && currentWriteScope.current === writeScope)
    return Object.freeze({
      canWrite,
      updateNode: (requestedNodeId: string, patch: Partial<GenerationCanvasNode>) => {
        if (!canWrite() || requestedNodeId !== nodeId) return
        const context = editContext.current
        const base = context.node
        const target = pendingRef.current?.shots.find((entry) => entry.shotId === context.shotId)
        if (!base || base.id !== nodeId || !target) return
        const nextNode = { ...base, ...patch }
        // A gesture can append several references before React renders again.
        context.node = nextNode
        setDraft((previous) => {
          const selected = modelOptions.find(option => option.modelKey === nextNode.meta?.modelKey && option.vendor === nextNode.meta?.modelVendor)
          const next = draftAfterNodeEdit(previous, target, nextNode, selected)
          if (draftOwner.current) retainSpendDraft(draftOwner.current, next)
          return next
        })
      },
      latestNode: (requestedNodeId: string) => canWrite() && requestedNodeId === nodeId ? editContext.current.node : undefined,
    })
  }, [draftNode?.id, writeScope, modelOptions])

  const slot = React.useMemo(() => {
    // 读不到的时候**先**出那张会说话的卡：此刻我们并不知道有没有待确认的一笔，
    // 而「不知道」正是必须说出口的那一种（`missingInterventionCard.ts`）。
    if (readFailure) {
      return missingInterventionCard({ reason: readFailure, announcer: 'spend-confirm', detail: 'productionRunApi.pendingSpend rejected' }, t)
    }
    if (!repriced) return undefined
    const remembered = originalModelIds.current
    const card = projectSpendCard(repriced, { page: index }, t, {
      locale: i18n.language,
      ...(remembered?.operationId === repriced.operationId ? { agentPickedModelIds: remembered.modelIds } : {}),
    })
    // 2026-09-22：× 不再问那一句「你在卡上改的内容会一起丢掉」——它已经不为真。
    // 裁决 D（× 只收回这一次出价）之后草稿和节点都留着，而账本锚 `operationId` 之后
    // **没提交的手改也跟着留**（同一个 operationId 再出价就在卡上）。没有东西丢，就不拦他一下。
    return card
  }, [readFailure, repriced, index, t, i18n.language])

  /**
   * 卡上四个动作共用的一次执行。**宿主说不行就必须让用户看见**：
   *
   * 这一层此前是 `.catch(() => undefined)` —— 主进程返回的 `{ok:false, message}` 和抛出来的异常一起
   * 被吞掉，于是用户按下「生成 ¥0.50」之后界面一动不动：卡还在、钱没花、一个字的解释都没有。
   * 而宿主那头明明有话说（「模型未加入白名单」「供应商还没配好」……）。按了没反应是最贵的一种沉默：
   * 用户只能再按一次，或者以为 Nomi 坏了。
   */
  const act = React.useCallback((run: (target: PendingSpendConfirm) => Promise<SpendActionOutcome | unknown>) => {
    const target = pending
    if (!target || busy) return
    setBusy(true)
    // 用户看到的永远是 i18n 的句子（R15），**不是宿主那句原话**：主进程的 message 混着内部术语和英文
    // （`Provider X lacks required recovery capabilities: configured_provider`），直接印出去就是把
    // 内部状态倒给用户。原话进控制台供排查。
    //
    // 说哪一句由**事实**决定，不是一句放之四海的安慰话（`spendActionFailureCopy`）：宿主按账本回
    // `generation_execution_failed`（落过了、结果未知 → 先去核对）还是没发起；没发起的话宿主点名是哪一种
    // （项目刚变了、供应商没接好……）。「可以改一下再按一次」只在认不出、而卡此刻真能改的时候出现
    // （第 11 条：2026-09-30 用户那张卡改不了，却被告诉「改一下再按」，按了两次同一句话）。
    const failed = (reason: unknown, outcome: SpendActionOutcome | undefined): void => {
      logRendererWarn('spend-confirm-refused', { code: outcome?.message ?? outcome?.code, failure: outcome?.failure }, reason)
      toast(t(spendActionFailureCopy(outcome, writeAccess.canWrite?.() === true)), 'error')
    }
    void run(target)
      .then((result) => {
        const outcome = result as SpendActionOutcome | undefined
        if (outcome && outcome.ok === false) failed(outcome, outcome)
      })
      .catch((error: unknown) => failed(error, undefined))
      .finally(() => {
        setBusy(false)
        void refresh()
      })
  }, [pending, busy, refresh, t, writeAccess])

  const persistEdits = async (target: PendingSpendConfirm, shotIds: readonly string[] | undefined, ledger: SpendDraft): Promise<SpendActionOutcome & { quoteId?: string; remaining: SpendDraft }> => {
    let quoteId = target.quoteId
    let remaining = ledger
    for (const revision of revisionsForConfirm(target.shots, ledger, shotIds)) {
      const result = await productionRunApi.reviseSpend({
        projectId: target.projectId, operationId: target.operationId, quoteId,
        shotId: revision.shotId, patch: { ...revision.patch },
      })
      if (!result.ok) return { ...result, remaining }
      if (!result.quoteId) return { ok: false, message: 'generation_quote_changed', remaining }
      quoteId = result.quoteId
      // A later revision can fail; preserve the still-unsubmitted shots before any refresh.
      remaining = consumeSpendDraft(target, remaining, [revision.shotId])
    }
    return { ok: true, quoteId, remaining }
  }

  /**
   * 点下去那一刻，先把这几镜卡上摆着的那一份落进候选，再读一次宿主的**正式报价**——「生成这张」和「生成剩下 N 张」共用这一段。
   *
   * 顺序是硬的：**先落账本，再封印**，反了就会封上一份用户已经改掉的合同。发出去的是卡上那张框现算出来的
   * （`candidatePatchFromNode`，和卡上改一下时同一张映射表），不只看账本——画布连线不是一次手改，但它照样要发出去。
   * 正式报价与本地估算对不上时以宿主为准、卡上原地换数，停在更新后的卡上等用户再按（不弹第二张卡）。
   */
  const persistShown = async (target: PendingSpendConfirm, entries: readonly PendingSpendShot[]): Promise<
    | Readonly<{ ok: true; approved: PendingSpendConfirm; remaining: SpendDraft }>
    | SpendActionOutcome
  > => {
    const shotIds = entries.map((entry) => entry.shotId)
    let perShot = { ...draft.perShot }
    for (const entry of entries) {
      const node = shownNodeFor(entry)
      const option = node ? modelOptions.find((candidate) => candidate.modelKey === node.meta?.modelKey && candidate.vendor === node.meta?.modelVendor) : undefined
      const shown = node ? candidatePatchFromNode(node, entry, option) : undefined
      if (shown) perShot = { ...perShot, [entry.shotId]: shown }
    }
    const ledger: SpendDraft = { perShot }
    if (draftIsEmpty({ perShot: Object.fromEntries(shotIds.map((shotId) => [shotId, effectivePatchForShot(ledger, shotId)])) })) {
      return { ok: true, approved: target, remaining: draft }
    }
    const saved = await persistEdits(target, shotIds, ledger)
    let remaining = saved.remaining
    if (!saved.ok) {
      if (draftOwner.current === spendDraftKey(target)) setDraft(remaining)
      return saved
    }
    const authoritative = await refresh()
    const local = repricePendingSpend(target, ledger, resolvePricing)
    if (!authoritative || authoritative.operationId !== target.operationId || authoritative.quoteId !== saved.quoteId) {
      return { ok: false, message: 'generation_quote_changed' }
    }
    const gaps = priceDisagreements(local, authoritative).filter(gap => shotIds.includes(gap.shotId))
    setDisagreements(gaps)
    // 只有这几镜进了候选；卡上别的镜没提交的手改照旧留在卡上。
    remaining = consumeSpendDraft(target, remaining, shotIds)
    if (draftOwner.current === spendDraftKey(target)) setDraft(remaining)
    if (gaps.length > 0) return { ok: false, message: 'generation_quote_changed' }
    return { ok: true, approved: authoritative, remaining }
  }

  return {
    pending: repriced,
    node: draftNode,
    writeAccess,
    slot,
    page: index,
    busy,
    disagreements,
    setPage,
    /**
     * 「生成这张 / 这段」= 只生成这一页那一镜（第 1 条）。宿主只批这一镜、只派这一镜，卡上别的镜照旧等人；
     * 这一镜决定了，卡翻到下一镜（`page` 不动，列表少了这一镜，同一个位置就是下一镜）。
     *
     * 顺序是硬的：**先把这一镜的账本落进候选，再封印**。反了就会封上一份用户已经改掉的合同。
     * 落完先读一次宿主的**正式报价**：与本地估算不一致时以它为准、卡上原地换数（不弹第二张卡），
     * 报价不同则停在更新后的卡上，等用户再次确认。
     */
    confirm: () => act(async (target) => {
      const currentShot = target.shots[index]
      if (!currentShot) return { ok: false, message: 'generation_scope_invalid' }
      const saved = await persistShown(target, [currentShot])
      if (!('approved' in saved)) return saved
      const { approved } = saved
      const confirmed = await productionRunApi.confirmSpend(approved.projectId, approved.operationId, approved.quoteId, currentShot.shotId)
      if (confirmed.ok) {
        const remaining = consumeSpendDraft(approved, saved.remaining, [currentShot.shotId])
        if (draftOwner.current === spendDraftKey(approved)) setDraft(remaining)
      }
      return confirmed
    }),
    /**
     * 「生成剩下 N 张 / 段」（2026-10-01 用户拍板）= 卡上还没决定的每一张各点一次「生成这张」。
     *
     * 渲染层只做两件事：把每一页卡上摆着的那一份先落进候选（和逐张点同一段 `persistShown`），再把「用户点的是这 N 张」
     * 递给宿主。批不批、派不派、一张一张怎么封印都由宿主决定（`confirmRemainingSpendShots`）：每张各封一份只盖它自己的授权，
     * 没有总价授权；哪一张没成就停在那一张，它和它后面的镜照旧留在卡上——和逐张点到那里停下一模一样。
     */
    confirmRemaining: () => act(async (target) => {
      // 只剩 1 张时卡上没有这颗按钮；真走到这里就是卡刚变了。
      if (target.shots.length < 2) return { ok: false, message: 'generation_scope_invalid' }
      const saved = await persistShown(target, target.shots)
      if (!('approved' in saved)) return saved
      const { approved } = saved
      const shotIds = approved.shots.map((entry) => entry.shotId)
      const confirmed = await productionRunApi.confirmSpendRemaining(approved.projectId, approved.operationId, approved.quoteId, shotIds)
      if (confirmed.ok) {
        const remaining = consumeSpendDraft(approved, saved.remaining, shotIds)
        if (draftOwner.current === spendDraftKey(approved)) setDraft(remaining)
      }
      return confirmed
    }),
    /**
     * 「去掉这张 / 这段」= 这一镜不生成（第 2 条）。占位留在画布上，它在卡上没提交的改动跟着丢掉；
     * 卡上剩下的镜照旧等人，一镜不剩时卡自己关。
     */
    remove: () => act(async (target) => {
      const currentShot = target.shots[index]
      if (!currentShot) return { ok: false, message: 'generation_scope_invalid' }
      const removed = await productionRunApi.removeSpendShot(target.projectId, target.operationId, target.quoteId, currentShot.shotId)
      if (removed.ok) {
        const remaining = consumeSpendDraft(target, draft, [currentShot.shotId])
        if (draftOwner.current === spendDraftKey(target)) setDraft(remaining)
      }
      return removed
    }),
    /**
     * × = **收回这一次出价**，草稿和画布一个字不动（2026-09-22 下午用户拍板：
     * 「第二种，× 只关这次请求，节点和草稿都留着」）。
     *
     * 所以这里**不再动画布**：宿主那边把这一次出价收回（计划回到 draft / 未 present），
     * 占位节点、分镜表、用户自己建的节点全都原样留着，他随时可以说一句「还是生成吧」再出同一张卡。
     *
     * 2026-09-21 到 09-22 中间这里是「撤掉这次操作自己造的占位节点 + 一个 ⌘Z 全回来」
     * （`spendCardRollback.ts`，随本刀删）。它在 33 镜的计划上说不通：卡上只摆 3 镜，撤 3 个、
     * 留 30 个孤儿；撤了之后落地轮询又会把它们补回来（那正是「点了 ×，画布上多出一个节点」那条红）。
     * 两个自洽方向里用户选了「都留着」。
     */
    discard: () => act(async (target) => productionRunApi.discardSpend(target.projectId, target.operationId, target.quoteId)),
  }
}
