import { describe, expect, it, vi } from 'vitest'
import { createLaneExtendedDesktopPorts, type LaneExtendedDesktopPortsInput } from './laneExtendedDesktopPorts'
import type { PreparedTimelineWrite } from '../capabilityCore/timelineTransportAdapters'
import type { PreparedCanvasWrite } from '../capabilityCore/canvasWriteTransportAdapters'
import type { PreparedExportWrite } from '../capabilityCore/phase4SurfaceTransportAdapters'
import type { PreparedSkillWrite } from '../capabilityCore/skillWriteTransportAdapters'
import type { RuntimeToolCall } from '../shared/agentCapabilities/transportContracts'
import type { ProjectAgentProposalReceiptView } from '../shared/projectAgentProposalReceipt'
import { createLaneApprovalGate } from './laneApprovalGate'
import { settleSpendWaiter, spendDecisionAwaited } from '../capabilityCore/spendDecisionWaiters'

const binding = { projectId: 'project-1', immutableProjectUuid: '00000000-0000-4000-8000-000000000001', projectGeneration: 1 }
const signal = new AbortController().signal
const plan = { baseRevision: 'revision-1', summary: 'Move clip', operations: [{ kind: 'move', clipId: 'clip-1', startFrame: 0 }] }
const call = (toolName: string, args: unknown = plan): RuntimeToolCall => ({ toolName, args, toolCallId: 'call-1' })

function setup() {
  const records: Array<Record<string, string | number>> = []
  const order: string[] = []
  let receipt: ProjectAgentProposalReceiptView | null = null
  const prepared = (value: RuntimeToolCall) => ({ call: value, invocation: { actionHash: 'action-hash' } })
  const input: LaneExtendedDesktopPortsInput = {
    binding,
    timelineRead: { tryExecute: vi.fn(async () => ({ ok: true as const, result: { operation: 'propose_edit_plan' } })), dispose: vi.fn() },
    timelineWrite: { prepare: vi.fn(async value => prepared(value) as unknown as PreparedTimelineWrite),
      execute: vi.fn(async () => { order.push('execute'); return { ok: true as const, result: { applied: true } } }), dispose: vi.fn() },
    canvasWrite: { prepare: vi.fn(async value => prepared(value) as unknown as PreparedCanvasWrite),
      execute: vi.fn(async () => ({ ok: true as const, result: { applied: true } })), dispose: vi.fn() },
    phase4: { tryExecuteRead: vi.fn(async () => ({ ok: true as const, result: { operation: 'get_media' } })),
      prepareWrite: vi.fn(async value => prepared(value) as unknown as PreparedExportWrite),
      executeWrite: vi.fn(async () => ({ ok: true as const, result: { accepted: true } })), dispose: vi.fn() },
    skillRead: { tryExecute: vi.fn(async () => ({ ok: true as const, result: {} })), dispose: vi.fn() },
    skillWrite: { prepare: vi.fn(async value => prepared(value) as unknown as PreparedSkillWrite), execute: vi.fn(async () => ({ ok: true as const, result: {} })), dispose: vi.fn() },
    generation: vi.fn(() => undefined), receipts: { read: vi.fn(() => receipt) }, onTaskCreated: vi.fn(async () => undefined),
  }
  const assembly = createLaneExtendedDesktopPorts(input)
  const record = vi.fn(async (_type: string, data: Record<string, string | number>) => { order.push('record'); records.push(data) })
  const execute = (value: RuntimeToolCall, abortSignal = signal) => assembly.tools.find(tool => tool.name === value.toolName)!.execute(value.args, { toolCallId: value.toolCallId, signal: abortSignal })
  const prepareAndApprove = async (value: RuntimeToolCall) => { await assembly.toolLifecycle.prepare(value, signal); await assembly.toolLifecycle.approved(value, record) }
  return { input, assembly, record, records, order, execute, prepareAndApprove,
    setReceipt(value: ProjectAgentProposalReceiptView) { receipt = value } }
}

describe('deferred desktop domain authority', () => {
  it.each(['generation', 'export'] as const)('C17: explicit %s reads and cancels only its owner even when raw IDs collide', async domain => {
    const f = setup()
    const generation = { tryExecute: vi.fn(async () => ({ ok: true as const, result: { operationId: 'same-id' } })), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    vi.mocked(f.input.generation).mockReturnValue(generation)
    await f.execute(call('check_job', { domain, jobId: 'same-id' }))
    const value = call('cancel_job', { domain, jobId: 'same-id' })
    await f.prepareAndApprove(value)
    await f.execute(value)
    expect(generation.tryExecute).toHaveBeenCalledTimes(domain === 'generation' ? 2 : 0)
    expect(f.input.phase4.tryExecuteRead).toHaveBeenCalledTimes(domain === 'export' ? 1 : 0)
    expect(f.input.phase4.prepareWrite).toHaveBeenCalledTimes(domain === 'export' ? 1 : 0)
    expect(f.input.phase4.executeWrite).toHaveBeenCalledTimes(domain === 'export' ? 1 : 0)
  })
  it('C17: explicit export permission failure never prepares or cancels generation', async () => {
    const f = setup()
    const generation = { tryExecute: vi.fn(), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    vi.mocked(f.input.generation).mockReturnValue(generation)
    vi.mocked(f.input.phase4.prepareWrite).mockRejectedValue(new Error('permission denied'))
    await expect(f.prepareAndApprove(call('cancel_job', { domain: 'export', jobId: 'same-id' }))).rejects.toThrow('permission denied')
    expect(generation.tryExecute).not.toHaveBeenCalled()
    expect(f.input.phase4.executeWrite).not.toHaveBeenCalled()
  })
  it('C17: a legacy raw ID never chooses one of two domains for cancellation', async () => {
    const f = setup(), value = call('cancel_job', { jobId: 'same-id' })
    const generation = { tryExecute: vi.fn(async () => ({ ok: true as const, result: { operationId: 'same-id' } })), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    vi.mocked(f.input.generation).mockReturnValue(generation)
    // 2026-09-22：这里原来断的是**裸 ZodError** 的形状（`issues[].code/path` 是 zod 内部结构）。
    // 裸 ZodError 的 `message` 就是 `JSON.stringify(issues, null, 2)`，模型收到的是一整段 JSON 数组
    // （真实轨迹里以 `[` 开头的那几条）。现在这条路和 `laneTools` 共用同一个正文构造器，
    // 断言也跟着换成**模型真正读到的那份**：码 + 字段名 + 期望类型，不含收到的值。
    await expect(f.prepareAndApprove(value)).rejects.toMatchObject({
      failure: { code: 'tool_arguments_invalid',
        // 顺带证明这次换法是**变好**：模型读到的是「domain 该是 'generation' | 'export'」，
        // 而不是一段 zod 内部结构的 JSON。
        issues: expect.arrayContaining([expect.objectContaining({ path: 'domain', expected: "'generation' | 'export'" })]) },
    })
    expect(f.input.phase4.prepareWrite).not.toHaveBeenCalled()
    expect(f.input.phase4.executeWrite).not.toHaveBeenCalled()
    expect(generation.tryExecute).not.toHaveBeenCalled()
  })
  it('never executes an unprepared or unapproved timeline write', async () => {
    const f = setup(), value = call('edit_timeline')
    expect(await f.execute(value)).toMatchObject({ ok: false, failure: { code: 'capability_authority_invalid' } })
    await f.assembly.toolLifecycle.prepare(value, signal)
    expect(await f.execute(value)).toMatchObject({ ok: false })
    expect(f.input.timelineWrite.execute).not.toHaveBeenCalled()
  })
  it('persists the prepared hash before execution and consumes authority once', async () => {
    const f = setup(), value = call('edit_timeline')
    await f.prepareAndApprove(value)
    expect(await f.execute(value)).toMatchObject({ ok: true })
    expect(f.order).toEqual(['record', 'execute'])
    expect(f.records[0]).toMatchObject({ actionHash: 'action-hash', toolCallId: value.toolCallId })
    expect(await f.execute(value)).toMatchObject({ ok: false })
    expect(f.input.timelineWrite.execute).toHaveBeenCalledTimes(1)
  })
  it('does not execute when authority persistence fails', async () => {
    const f = setup(), value = call('edit_timeline')
    await f.assembly.toolLifecycle.prepare(value, signal)
    await expect(f.assembly.toolLifecycle.approved(value, async () => { throw new Error('disk unavailable') })).rejects.toThrow('disk unavailable')
    expect(await f.execute(value)).toMatchObject({ ok: false })
    expect(f.input.timelineWrite.execute).not.toHaveBeenCalled()
  })
  it('rejects changed parameters under an approved tool call identity', async () => {
    const f = setup(), value = call('edit_timeline')
    await f.prepareAndApprove(value)
    expect(await f.execute({ ...value, args: { ...plan, baseRevision: 'other' } })).toMatchObject({ ok: false })
    expect(f.input.timelineWrite.execute).not.toHaveBeenCalled()
  })
  it.each(['export_video', 'delete_from_canvas'])('requires the correlated committed G5 receipt for %s', async name => {
    const f = setup(), value = call(name, name === 'export_video' ? { expectedRevision: 'revision-1' } : { nodeIds: ['node-1'] })
    await f.prepareAndApprove(value)
    expect(await f.execute(value)).toMatchObject({ ok: false, failure: { code: 'capability_receipt_unresolved' } })
  })
  it('accepts export only when its exact approved receipt is committed', async () => {
    const f = setup(), value = call('export_video', { expectedRevision: 'revision-1' })
    await f.prepareAndApprove(value)
    const authority = f.records[0]
    f.setReceipt({ binding, revision: 1, lifecycle: 'committed', proposalId: String(authority.receiptProposalId), operationId: 'export-commit',
      proposal: { proposalId: String(authority.receiptProposalId), hostApprovalId: String(authority.approvalId), hostActionHash: String(authority.actionHash), summary: 'Export', stepLabels: [], compensation: [], watchNodes: [], reconciliationOk: true } })
    expect(await f.execute(value)).toMatchObject({ ok: true })
  })
  it('does not lose a delayed generation owner, and never falls back to another runtime', async () => {
    // 动词名是 20 动词面的 `draft_shots`（旧的 `nomi_generation_status` 已退役），它是写动词，
    // 所以先过 prepare/approve 才轮到生成域。
    const f = setup(), value = call('draft_shots', { shots: [{ prompt: 'test shot' }] })
    await f.assembly.toolLifecycle.prepare(value, signal)
    await f.assembly.toolLifecycle.approved(value, f.record)
    // 2026-09-14（#785）：不再是一个光秃秃的 code。模型看到的是常驻生成面此刻的**相**（还在起 /
    // 按配置关掉 / 装配抛了），由 residentSurfaceLifecycle 这一个 owner 说出口；测试进程里没人
    // boot 过，所以是 starting。正文前半截由 laneExtendedTools 拼上动词名。
    expect(await f.execute(value)).toMatchObject({ ok: false,
      failure: { code: 'generation_surface_unavailable', message: expect.stringMatching(/still starting/) } })
    const adapter = { tryExecute: vi.fn(async () => ({ ok: true as const, result: { operationId: 'run-1' } })), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    vi.mocked(f.input.generation).mockReturnValue(adapter)
    await f.assembly.toolLifecycle.prepare(value, signal)
    await f.assembly.toolLifecycle.approved(value, f.record)
    expect(await f.execute(value)).toMatchObject({ ok: true })
    expect(adapter.tryExecute).toHaveBeenCalledTimes(1)
  })
  it('settlement cancels an authority whose journal write is still in flight', async () => {
    const f = setup(), value = call('edit_timeline')
    await f.assembly.toolLifecycle.prepare(value, signal)
    let release!: () => void
    const persisted = new Promise<void>(resolve => { release = resolve })
    const approval = f.assembly.toolLifecycle.approved(value, () => persisted)
    f.assembly.toolLifecycle.settled(value)
    release()
    await expect(approval).rejects.toThrow('capability_cancelled')
    expect(await f.execute(value)).toMatchObject({ ok: false })
    expect(f.input.timelineWrite.execute).not.toHaveBeenCalled()
  })
  it('joins a successfully created draft to the domain task projection', async () => {
    const f = setup(), value = call('draft_shots', { shots: [{ prompt: 'Create a short film' }] })
    vi.mocked(f.input.generation).mockReturnValue({ tryExecute: vi.fn(async () => ({ ok: true as const, result: { runId: 'run-1' } })), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() })
    await f.prepareAndApprove(value)
    expect(await f.execute(value)).toMatchObject({ ok: true })
    expect(f.input.onTaskCreated).toHaveBeenCalledWith(value, { runId: 'run-1' })
  })
})

// ── 2026-09-22 裁决 A：`generate` 的「等用户」住在预检期（审批闸 hold），execute 里没有任何等待 ──
describe('generate：等用户住在预检期，结局以成功形状交给 execute', () => {
  const presentedCard = { ok: true as const, result: { operation: { operationId: 'op-1' }, shots: ['shot-1'], nextAction: 'await_user' } }
  const generateCall: RuntimeToolCall = { toolName: 'generate', args: { operationId: 'op-1' }, toolCallId: 'call-generate' }

  function withGate(f: ReturnType<typeof setup>, generation: { tryExecute: ReturnType<typeof vi.fn>; withdrawPresentation: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }) {
    vi.mocked(f.input.generation).mockReturnValue(generation as never)
    const gate = createLaneApprovalGate({ specs: [], hasUserInterface: true })
    const controller = new AbortController()
    const host = { signal: controller.signal, canAskUser: true,
      waitForUser: () => ({ outcome: gate.hold({ toolCallId: generateCall.toolCallId, toolName: 'generate' }, controller.signal),
        settle: (outcome: Parameters<typeof gate.settleHold>[1]) => gate.settleHold(generateCall.toolCallId, outcome) }) }
    return { gate, controller, host }
  }
  const untilHolding = async (gate: ReturnType<typeof createLaneApprovalGate>) => { await vi.waitFor(() => expect(gate.holding()).toBeDefined()) }

  it('面板点了「生成」→ 回合拿到 approved；execute 不再碰领域（不会把答完的卡重新摆出来）', async () => {
    const f = setup()
    const generation = { tryExecute: vi.fn(async () => presentedCard), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    const { gate, host } = withGate(f, generation)
    await f.assembly.toolLifecycle.prepare(generateCall, signal)
    const approving = f.assembly.toolLifecycle.approved(generateCall, f.record, host)
    await untilHolding(gate)
    expect(gate.pending(), '这次等待不投影成闸卡——那张报价卡已经有人画了').toBeUndefined()
    expect(settleSpendWaiter('project-1', 'op-1', { kind: 'confirmed' })).toBe(true)
    await approving
    const outcome = await f.execute(generateCall) as { ok: boolean; details?: { userDecision?: unknown } }
    expect(outcome.ok).toBe(true)
    expect(outcome.details?.userDecision).toEqual({ outcome: 'approved' })
    expect(generation.tryExecute, '整条链上领域只被碰一次（present）').toHaveBeenCalledTimes(1)
    expect(generation.withdrawPresentation).not.toHaveBeenCalled()
    expect(spendDecisionAwaited('project-1', 'op-1')).toBe(false)
  })

  it('× → declined：成功形状，计划已由那条 IPC 写成终态，这里不再动它', async () => {
    const f = setup()
    const generation = { tryExecute: vi.fn(async () => presentedCard), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    const { gate, host } = withGate(f, generation)
    await f.assembly.toolLifecycle.prepare(generateCall, signal)
    const approving = f.assembly.toolLifecycle.approved(generateCall, f.record, host)
    await untilHolding(gate)
    settleSpendWaiter('project-1', 'op-1', { kind: 'declined' })
    await approving
    const outcome = await f.execute(generateCall) as { ok: boolean; details?: { userDecision?: unknown } }
    expect(outcome.ok, '「用户没同意」不是错误——不重试、不进熔断').toBe(true)
    expect(outcome.details?.userDecision).toEqual({ outcome: 'declined' })
    expect(generation.withdrawPresentation).not.toHaveBeenCalled()
  })

  it('卡待决时用户打了字（E）→ redirected：出价收回、计划留着，那句话一字不改交给模型', async () => {
    const f = setup()
    const generation = { tryExecute: vi.fn(async () => presentedCard), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    const { gate, host } = withGate(f, generation)
    await f.assembly.toolLifecycle.prepare(generateCall, signal)
    const approving = f.assembly.toolLifecycle.approved(generateCall, f.record, host)
    await untilHolding(gate)
    expect(gate.settleHold(gate.holding()!.toolCallId, { kind: 'redirected', text: '第二镜改成竖版' })).toBe(true)
    await approving
    const outcome = await f.execute(generateCall) as { ok: boolean; details?: { userDecision?: unknown }; nextAction?: { userSees: string } }
    expect(outcome.ok).toBe(true)
    expect(outcome.details?.userDecision).toEqual({ outcome: 'redirected', userSaid: '第二镜改成竖版' })
    expect(outcome.nextAction?.userSees).toContain('第二镜改成竖版')
    expect(generation.withdrawPresentation).toHaveBeenCalledWith('op-1')
  })

  it('按停止 / 关窗 → 等待兑现成 cancelled，出价收回（卡不许留成孤儿），注册表清干净', async () => {
    const f = setup()
    const generation = { tryExecute: vi.fn(async () => presentedCard), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    const { gate, host } = withGate(f, generation)
    await f.assembly.toolLifecycle.prepare(generateCall, signal)
    const approving = f.assembly.toolLifecycle.approved(generateCall, f.record, host)
    await untilHolding(gate)
    gate.cancelAll('window-closed')
    await approving
    expect(generation.withdrawPresentation).toHaveBeenCalledWith('op-1')
    expect(spendDecisionAwaited('project-1', 'op-1')).toBe(false)
    expect(await f.execute(generateCall)).toMatchObject({ ok: false })
  })

  it('全自动代答 / 文稿方案：present 返回时已有结局，不借等待', async () => {
    const f = setup()
    const started = { ok: true as const, result: { drafted: { operation: { operationId: 'op-1' } }, spendDecision: { decidedBy: 'policy:full_auto' }, started: {} } }
    const generation = { tryExecute: vi.fn(async () => started), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    const { gate, host } = withGate(f, generation)
    await f.assembly.toolLifecycle.prepare(generateCall, signal)
    await f.assembly.toolLifecycle.approved(generateCall, f.record, host)
    expect(gate.holding()).toBeUndefined()
    const outcome = await f.execute(generateCall) as { ok: boolean; nextAction?: { kind: string } }
    expect(outcome.ok).toBe(true)
    expect(outcome.nextAction?.kind).toBe('job_running')
    expect(generation.tryExecute).toHaveBeenCalledTimes(1)
  })

  it('没有窗口能问人：出价收回，照实报错（这是真错误，error 形状是对的）', async () => {
    const f = setup()
    const generation = { tryExecute: vi.fn(async () => presentedCard), withdrawPresentation: vi.fn(async () => undefined), dispose: vi.fn() }
    const { host } = withGate(f, generation)
    await f.assembly.toolLifecycle.prepare(generateCall, signal)
    await f.assembly.toolLifecycle.approved(generateCall, f.record, { ...host, canAskUser: false })
    expect(generation.withdrawPresentation).toHaveBeenCalledWith('op-1')
    expect(await f.execute(generateCall)).toMatchObject({ ok: false })
  })
})
