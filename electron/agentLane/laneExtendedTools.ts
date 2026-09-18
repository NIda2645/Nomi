import type { RuntimeToolCall, RuntimeToolDecision } from '../shared/agentCapabilities/transportContracts'
import type { LaneApprovalDecision } from '../shared/agentLane/laneContracts'
import type { LaneToolNextAction } from '../shared/agentLane/laneToolContract'
import { laneFailureFromDecision } from '../shared/agentLane/laneFailureFromDecision'
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
  const operation = record.operation && typeof record.operation === 'object' ? record.operation as Record<string, unknown> : undefined
  const draftOperationId = typeof operation?.operationId === 'string' ? operation.operationId : typeof record.operationId === 'string' ? record.operationId : undefined
  const confirmed = userAnsweredACard(approvalDecision)
  switch (verb) {
    case 'draft_shots':
      // 草稿 id 按 `draft_shots` / `generate` 收它的那个名字回给模型（这里曾经印 `jobId=`：
      // 同一个值出来叫 jobId、进去要填 operationId，而且这一刻根本没有 job 在跑）。
      return { kind: 'none', userSees: 'Draft shots are on the canvas with their model and price badge. Nothing has been generated and nothing has been spent; call generate when the user wants them made.', ...(draftOperationId ? { operationId: draftOperationId } : {}) }
    case 'generate': {
      // 走到这里只有一种可能：档位替用户决了门，这一笔**已经在跑**（没决成的那条走 `spendCardResult`）。
      const jobId = operationIdOf(result)
      return { kind: 'job_running', userSees: 'The user is in full-auto approval mode, so Nomi approved the spend on the authorisation they gave when switching in: generation has started and their provider credit is being spent. No card is waiting for them; progress shows in the task list.', ...(jobId ? { jobId } : {}) }
    }
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
 * `generate` 的返回值抄 GitHub MCP `issue_write` 弹表单时的形状：**isError + 明文停下**。模型读到的是一条
 * 错误结果，所以它不会把「卡已经出了」说成「已经生成了」，也不会接着调下一个工具。
 *
 * **只在真的有一张卡在等人时才走这条**：全自动档由策略代答的那一笔已经开跑了
 * （`policyStartedGeneration`），对它说「停下来等用户点卡」是双重错误——卡不存在，钱也已经花了。
 *
 * ── 为什么条件写在函数里，而不是只写在调用点（2026-09-18）──
 *
 * F 块的合同把这条列进 `residual_risks`：`code: 'user_sees_spend_card'` 只靠调用点那个 `if` 保证，
 * 门岗看不见。`check:announced-card` 的 `hardcoded-card-claim` 是**正则**，它分不清「写死且无条件」
 * 和「写死但被真实结论守着」——把它扩到 `code:` 会对这一行报**假红**，而假红只会教人绕开门岗
 * （R17：门岗红了先读它红在哪条判据，不是改判据）。所以这条不变量往**更早**一层搬：函数自己拿着
 * 那份结果，宣称「有一张卡在等你」之前先核对它。第二个调用点再出现时，它也带着同一道核对。
 */
function spendCardResult(result: unknown): never {
  if (policyStartedGeneration(result)) {
    // 程序员错误，不是用户错误：这一笔已经开跑、钱已经花了，任何「卡在等你」都是假话。
    throw new Error('spendCardResult called for a generation the approval policy already started'
      + ' — no card is waiting and credit is already being spent (see nextActionFor: job_running).')
  }
  const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  const shots = Array.isArray(record.shots) ? record.shots.length : undefined
  throw new LaneDomainFailure({
    code: 'user_sees_spend_card',
    message: `The user now sees a priced confirmation card in Nomi${shots ? ` for ${shots} shot(s)` : ''}. Generation has NOT started and nothing has been spent; only the user can approve the card.`,
    nextAction: 'STOP. Do not call any other tools and do not claim generation has started or completed. Tell the user what the card shows and wait for their decision.',
  })
}

/** 测试用：让「卡在等你」这句话的守卫本身可以被直接打上一枪（R17 阳性对照）。 */
export const __spendCardResultForTest = spendCardResult;

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
      // 卡真的在等人时才停下模型；全自动档代答的那一笔已经开跑，回执照实说（见 `nextActionFor`）。
      if (spec.name === 'generate' && !policyStartedGeneration(decision.result)) spendCardResult(decision.result)
      const text = JSON.stringify(decision.result ?? null)
      const nextAction = nextActionFor(spec.name, decision.result, context.approvalDecision)
      return { ok: true, text, details: decision.result, ...(nextAction ? { nextAction } : {}) }
    }))
}
