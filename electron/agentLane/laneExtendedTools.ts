import type { RuntimeToolCall, RuntimeToolDecision } from '../shared/agentCapabilities/transportContracts'
import type { LaneApprovalDecision } from '../shared/agentLane/laneContracts'
import type { LaneToolNextAction } from '../shared/agentLane/laneToolContract'
import { laneFailureFromDecision } from '../shared/agentLane/laneFailureFromDecision'
import { generateUserDecisionOf } from '../shared/agentLane/generateUserDecision'
import { LANE_DEFERRED_TOOL_CATALOG } from './laneToolCatalog'
import { bindLaneTool, LaneDomainFailure, type LaneToolDescriptor } from './laneRuntimePort'

export interface LaneExtendedPort {
  execute(call: RuntimeToolCall, signal: AbortSignal): Promise<RuntimeToolDecision>
}

/**
 * 闸真的把一张卡摆到用户面前过吗（`laneApprovalGate.decisionFor` 的结论）。
 *
 * `auto-granted` = 这一档下压根没问；`granted-once` / `granted-session` = 卡出过，**而且用户已经答完了**
 * ——闸跑在 `before_tool`，回执写出来的时候那张卡已经翻篇。两种情况下「现在有一张卡在问你」都是假的。
 * 缺席（没装闸的影子夹具 / 单测）= 不知道，回执就不提卡。
 */
function userAnsweredACard(decision: LaneApprovalDecision | undefined): boolean {
  return decision === 'granted-once' || decision === 'granted-session'
}

/**
 * 「全自动」档代答之后的那份结果（`generationTransportAdapters.decideByPolicyAfterDraft`）：
 * 封印 → 铸收据 → 决门 → **已经开跑**。认得出它，`generate` 的回执才说得出真话。
 */
function policyStartedGeneration(result: unknown): boolean {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const spend = record.spendDecision
  return Boolean(spend && typeof spend === 'object' && typeof (spend as { decidedBy?: unknown }).decidedBy === 'string')
}

function operationIdOf(result: unknown): string | undefined {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const drafted = record.drafted && typeof record.drafted === 'object' ? record.drafted as Record<string, unknown> : record
  const operation = drafted.operation && typeof drafted.operation === 'object' ? drafted.operation as Record<string, unknown> : undefined
  if (typeof operation?.operationId === 'string') return operation.operationId
  return typeof drafted.operationId === 'string' ? drafted.operationId : undefined
}

/** One receipt for an explicit policy decision that already started generation. */
function startedGenerationAction(result: unknown): LaneToolNextAction {
  const jobId = operationIdOf(result)
  return { kind: 'job_running', userSees: 'The user is in full-auto approval mode, so Nomi approved the spend on the authorisation they gave when switching in: generation has started and their provider credit is being spent. No card is waiting for them; progress shows in the task list.', ...(jobId ? { jobId } : {}) }
}

/**
 * 写动词成功时用户接下来看到什么（设计正本 §6.2）。
 *
 * ── 为什么它不能是一张静态表（2026-09-18 · T-ED-02）──
 *
 * 这一句是**回执**：它在动作已经做完之后写，讲的是用户此刻看到什么。而这里原来对
 * `edit_timeline` **无条件**回「时间轴高亮着计划，一张复审卡在问用户要不要应用」——
 * 三档里没有任何一档在这一刻是这样：闸跑在 `before_tool`，`step` / `safe-auto` 那张卡
 * 用户早答完了（答完才轮到执行），`project` 档压根没出过卡。于是模型照着这句话
 * 让用户去点一张不存在的卡，用户等着、以为 Nomi 坏了（2026-09-12「劈成两半」那次）。
 *
 * 修法不是把那句话改对，是**让它从真实的那个结论派生**（`context.approvalDecision`）——
 * 静态表的下一个动词还会再来一次。`check:announced-card` 的 `hardcoded-card-claim` 规则
 * 把「回执里写死『用户看到卡』」这一族钉在门岗上。
 */
function nextActionFor(
  verb: string, result: unknown, approvalDecision: LaneApprovalDecision | undefined,
): LaneToolNextAction | undefined {
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const draftOperationId = operationIdOf(result)
  const confirmed = userAnsweredACard(approvalDecision)
  switch (verb) {
    case 'draft_shots':
      // 草稿 id 按 `draft_shots` / `generate` 收它的那个名字回给模型（这里曾经印 `jobId=`：
      // 草稿的寻址字段仍为 operationId；只有本次结果明确已开跑时，才另带执行回执）。
      return { ...(policyStartedGeneration(result) ? startedGenerationAction(result) : { kind: 'none' as const, userSees: 'Draft changes are saved in the project. Saving does not imply canvas placement or a new generation start.' }), ...(draftOperationId ? { operationId: draftOperationId } : {}) }
    case 'generate':
      return generateReceipt(result)
    case 'edit_timeline': {
      // 闸跑在执行**之前**，所以能走到这一行就说明编辑已经落到时间轴上了。回执讲的是那件事。
      const how = confirmed
        ? 'The user approved the review card, so the planned timeline edit is now applied.'
        : 'The timeline edit applied directly — this approval mode did not ask, and no card is waiting for the user.'
      // 契约返回的字段叫 `undoToken`，`undo` 收的字段也叫 `undoToken`——原样带过去，不改名。
      // （这里曾经改成 `changeId`：一条工具结果里正文印 undoToken、末行印 changeId，模型得自己猜。）
      return { kind: 'none', userSees: `${how} It is reversible; call undo to take it back.`, ...(typeof record.undoToken === 'string' ? { undoToken: record.undoToken } : {}) }
    }
    case 'undo':
      return { kind: 'none', userSees: 'The timeline is back to before that change.' }
    case 'delete_from_canvas':
      // 不可逆动词在每一档都先出确认卡（`capabilityIsHardGated`），但 `kind` 仍从真实结论取：
      // 写死的那一刻，下一个动词就会再来一次 T-ED-02。
      return { kind: confirmed ? 'user_sees_confirm_card' : 'none',
        userSees: confirmed ? 'The nodes are gone from the canvas after the user confirmed.' : 'The nodes are gone from the canvas.' }
    case 'export_video':
      return { kind: 'job_running', userSees: 'The export is running; progress shows in the task list.', ...(typeof record.jobId === 'string' ? { jobId: record.jobId } : {}) }
    case 'cancel_job':
      return { kind: confirmed ? 'user_sees_confirm_card' : 'none',
        userSees: confirmed
          ? 'The job was cancelled after the user confirmed; credit already spent is not refunded.'
          : 'The job was cancelled; credit already spent is not refunded.' }
    case 'save_skill':
      return { kind: 'none', userSees: 'The skill is in the user\'s library and can be deleted there.' }
    default:
      return undefined
  }
}

/**
 * `generate` 成功返回时，用户在那张报价卡上**已经答完了**（等待住在预检期，见 `laneExtendedDesktopPorts.preflightGenerate`）。
 * 回执从那个真实结论派生，三种都是成功形状——没有任何东西坏了：
 *
 *   · approved   → 钱的那条链已经跑完，任务开跑；
 *   · declined   → 他点了 ×。收回的是**这一次出价**，草稿原样留着（2026-09-22 用户拍板）：
 *                  不要重试、不要替他重新起草，等他说下一步；他要是还想生成，对同一份草稿再 generate；
 *   · redirected → 卡还没答他就打了字。这一次出价收回、草稿留着，那句话就是下一步的输入。
 *
 * 2026-09-22 之前这里是一条 `isError + STOP`（`user_sees_spend_card`）：回合当场结束，用户点完「生成」
 * 之后没有任何回合接得住结果；而 × 在模型眼里和「工具坏了」是同一个形状，于是它重试、进熔断。
 */
function generateReceipt(result: unknown): LaneToolNextAction {
  const decision = generateUserDecisionOf(result)
  const operationId = operationIdOf(result)
  const id = operationId ? { operationId } : {}
  if (decision?.outcome === 'approved') {
    return { kind: 'job_running', ...(operationId ? { jobId: operationId } : {}),
      userSees: 'The user approved the priced card, so generation has started and their provider credit is being spent. No card is waiting any more; progress shows in the task list. Do not call generate again for this draft.' }
  }
  if (decision?.outcome === 'declined') {
    return { kind: 'none', ...id,
      userSees: 'The user closed the priced card without approving it. Nothing was generated and nothing was spent. He withdrew this quote, not the draft: the shots, parameters and his own edits are all still there, and so are the placeholder nodes on the canvas. Do not call generate again right now and do not redraft on your own: acknowledge it briefly and ask what he would like instead. If he asks for it again later, call generate on this same draft (revise it first with draft_shots if he wants changes).' }
  }
  if (decision?.outcome === 'redirected') {
    return { kind: 'none', ...id,
      userSees: `While the priced card was waiting, the user wrote: "${decision.userSaid}". That is his answer to the card: this quote was withdrawn, nothing was generated and nothing was spent, and the draft is kept as it was. Do what he wrote (revise the draft with draft_shots if he asked for changes), then call generate again only if he still wants it generated.` }
  }
  if (policyStartedGeneration(result)) return startedGenerationAction(result)
  // 卡摆出去了，却没有任何结论随结果回来：预检期那次等待没跑（宿主没接 `toolLifecycle.approved`）。
  // 这里**不许**顺着说「已经开始生成」——那句话只属于上面那一支。照实报错，模型据此不会谎报。
  throw new LaneDomainFailure({
    code: 'generation_approval_unavailable',
    message: 'generate put a priced card in front of the user, but this host did not wait for his answer, so there is no decision to report. Generation has NOT started and nothing has been spent.',
    nextAction: 'Do not claim generation started. Tell the user the confirmation step did not run in this session and ask him to try again.',
  })
}

export function createExtendedLaneTools(port: LaneExtendedPort): LaneToolDescriptor[] {
  // Visibility groups do not transfer execution ownership: timeline reads keep their typed port
  // (`laneTimelineTools.ts`); `list_models` is native-assembled (`laneModelRead.mts`) and never reaches here.
  return LANE_DEFERRED_TOOL_CATALOG
    .filter(spec => spec.contractId !== 'timeline.read')
    .map(spec => bindLaneTool(spec, async (args, context) => {
      const decision = await port.execute({ toolCallId: context.toolCallId, toolName: spec.name, args }, context.signal)
      // 域端口给了一句比 code 更具体的话（#785：常驻生成面此刻的相——按配置关掉 / 还在起 / 装配抛了）
      // 就带给模型；只有 code 的照旧。否则 owner 说得再清楚，模型看到的仍是一句零信息的「不可用」。
      if (!decision.ok) throw new LaneDomainFailure(laneFailureFromDecision({
        toolName: spec.name,
        code: decision.code,
        message: decision.message,
        fallbackCode: 'capability_execution_failed',
        nextAction: 'Read the current project state and review the current identifiers, revision and approval before requesting a new action. Do not repeat an unknown paid submission.',
      }))
      const text = JSON.stringify(decision.result ?? null)
      const nextAction = nextActionFor(spec.name, decision.result, context.approvalDecision)
      return { ok: true, text, details: decision.result, ...(nextAction ? { nextAction } : {}) }
    }))
}
