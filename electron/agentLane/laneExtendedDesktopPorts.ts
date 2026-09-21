import { argumentFailure } from './laneTools.mjs';
import { ZodError } from "zod";
import type { CanvasWriteApprovalAuthority } from '../shared/agentCapabilities/transportContracts'
import { randomUUID } from 'node:crypto'
import type { ProjectBinding } from '../shared/projectBinding'
import type { RuntimeToolCall, RuntimeToolDecision } from '../shared/agentCapabilities/transportContracts'
import type { PiTimelineReadTransportAdapter, PiTimelineWriteTransportAdapter, PreparedTimelineWrite } from '../capabilityCore/timelineTransportAdapters'
import type { PiCanvasWriteTransportAdapter, PreparedCanvasWrite } from '../capabilityCore/canvasWriteTransportAdapters'
import type { PiPhase4SurfaceTransportAdapter, PreparedExportWrite } from '../capabilityCore/phase4SurfaceTransportAdapters'
import type { PiGenerationTransportAdapter } from '../capabilityCore/generationTransportAdapters'
import type { PiSkillReadTransportAdapter } from '../capabilityCore/skillReadTransportAdapters'
import type { PiSkillWriteTransportAdapter, PreparedSkillWrite } from '../capabilityCore/skillWriteTransportAdapters'
import type { ProjectAgentProposalReceiptService } from '../capabilityCore/projectAgentProposalReceiptStore'
import { committedProjectAgentReceiptMatchesApproval } from '../capabilityCore/projectAgentProposalReceiptCorrelation'
import { modelToolCapabilityId } from '../shared/agentCapabilities/modelFacingTools'
import { residentGenerationUnavailableMessage } from '../capabilityCore/residentSurfaceLifecycle'
import { capabilityContractById } from '../shared/agentCapabilities/registry'
import { LANE_RECEIPT_AUTHORITY_NOTE } from '../shared/agentLane/laneReceiptAuthority'
import { LANE_DEFERRED_TOOL_CATALOG, LANE_DEFERRED_TOOL_GROUPS } from './laneToolCatalog'
import { createExtendedLaneTools } from './laneExtendedTools'
import { LaneDomainFailure, type OpenLaneOptions } from './laneRuntimePort'
import { verbToTransportCall, type VerbTransportCall } from './laneVerbTransport'
import { taskReferenceSchema } from '../shared/agentCapabilities/taskReference'
import type { GenerationInvocationContext } from '../shared/agentCapabilities/generationInvocationContext'
import type { LaneComposerContext } from '../shared/agentLane/laneDesktopContracts'

type Prepared =
  | { kind: 'timeline'; value: PreparedTimelineWrite }
  | { kind: 'canvas'; value: PreparedCanvasWrite }
  | { kind: 'export'; value: PreparedExportWrite }
  | { kind: 'skill'; value: PreparedSkillWrite }
  | { kind: 'direct'; value: { call: RuntimeToolCall } }

type Pending = { call: RuntimeToolCall; prepared: Prepared; approved?: CanvasWriteApprovalAuthority | true; generationContext?: GenerationInvocationContext }

export interface LaneExtendedDesktopPortsInput {
  binding: ProjectBinding
  /** These adapters must be minted by the committed Surface/main domain owner. */
  timelineRead: PiTimelineReadTransportAdapter
  timelineWrite: PiTimelineWriteTransportAdapter
  canvasWrite: PiCanvasWriteTransportAdapter
  phase4: PiPhase4SurfaceTransportAdapter
  skillRead: PiSkillReadTransportAdapter
  skillWrite: PiSkillWriteTransportAdapter
  /** Main generation owner may become ready after the project opens. */
  generation(): PiGenerationTransportAdapter | undefined
  receipts: Pick<ProjectAgentProposalReceiptService, 'read'>
  onTaskCreated?(call: RuntimeToolCall, result: unknown): Promise<void>
  context?(): LaneComposerContext
}

function failure(code: string): Extract<RuntimeToolDecision, { ok: false }> {
  return { ok: false, code, message: code }
}

/**
 * 生成面不在：code 照旧，message 说的是常驻生成面此刻的**相**（按配置关掉 / 还在起 / 装配抛了 /
 * 已停），由 residentSurfaceLifecycle 这一个 owner 回答。模型据此能告诉用户「等一会儿再试」还是
 * 「这个会话没有这条面」，而不是一句零信息的「生成服务暂时不可用」。
 */
function generationSurfaceUnavailable(): Extract<RuntimeToolDecision, { ok: false }> {
  return { ok: false, code: 'generation_surface_unavailable', message: residentGenerationUnavailableMessage() }
}

/**
 * 契约 parse：失败走**与 `laneTools` 同一个**正文构造器，不抛裸 `ZodError`。
 * 裸 `ZodError` 的 `message` 是 `JSON.stringify(issues, null, 2)`——模型读到的是一段 JSON 数组。
 */
function parseToolArguments(spec: { name: string; schema: { parse(value: unknown): unknown } }, args: unknown): unknown {
  try {
    return spec.schema.parse(args)
  } catch (error) {
    if (error instanceof ZodError) throw new LaneDomainFailure(argumentFailure(spec.name, args, error))
    throw error
  }
}

function rejectPreparation(code: string): never {
  if (code === 'task_reference_required') throw new LaneDomainFailure({ code,
    message: 'The task reference has no verified domain (task_reference_required).',
    nextAction: 'Read the task result or canvas and copy domain and jobId from taskRef. Do not infer a task ID from a node ID.' })
  throw new LaneDomainFailure({ code, message: `Nomi could not prepare this domain action (${code}).`,
    nextAction: 'Read the current project again and request a new action with its current identifiers and revision.' })
}

function captureGenerationContext(context: LaneComposerContext | undefined): GenerationInvocationContext | undefined {
  if (!context) return undefined;
  if (context.admissionSurface === 'document' && context.storyboardTarget) {
    const target = structuredClone(context.storyboardTarget);
    return { storyboardTarget: target, sourceDocument: { documentId: target.sourceDocumentId,
      revision: target.sourceDocumentRevision, contentHash: target.sourceDocumentContentHash } };
  }
  // 渲染层声称的来源文稿。记录与比对用（见 GenerationInvocationContext 的头注释），不是凭据。
  const source = context.admissionSurface === 'document' && context.documentId && context.preconditions?.document
    && typeof context.preconditions.document.contentHash === 'string'
    ? { documentId: context.documentId, revision: context.preconditions.document.revision, contentHash: context.preconditions.document.contentHash }
    : undefined;
  return source ? { sourceDocument: source } : undefined;
}

/**
 * One lane boundary over existing executors; it owns no second domain store or mutation path.
 * 模型面是 20 个动词；这里按 `verbToTransportCall` 把动词翻成传输层方法，再交给各领域适配器。
 */
export function createLaneExtendedDesktopPorts(input: LaneExtendedDesktopPortsInput) {
  const byName = new Map(LANE_DEFERRED_TOOL_CATALOG.map(spec => [spec.name, spec]))
  const pending = new Map<string, Pending>()
  let disposed = false

  const translate = (wire: RuntimeToolCall): VerbTransportCall => {
    if ((wire.toolName === 'check_job' || wire.toolName === 'cancel_job') && !taskReferenceSchema.safeParse(wire.args).success) {
      rejectPreparation('task_reference_required')
    }
    const translated = verbToTransportCall(wire)
    if (!translated) rejectPreparation('capability_unsupported')
    return translated
  }

  const toolLifecycle: NonNullable<OpenLaneOptions['toolLifecycle']> = {
    async prepare(wire, signal) {
      const spec = byName.get(wire.toolName)
      if (!spec) return
      if (disposed || signal.aborted) rejectPreparation('capability_cancelled')
      if (pending.has(wire.toolCallId)) rejectPreparation('capability_authority_invalid')
      const call = { ...wire, args: parseToolArguments(spec, wire.args) }
      const contract = capabilityContractById(modelToolCapabilityId(spec, call.args))
      if (!contract) rejectPreparation('capability_unsupported')
      if (contract.effect === 'read') return
      const { lane, call: transport } = translate(call)
      let prepared: Prepared
      if (lane === 'timeline') {
        const value = await input.timelineWrite.prepare(transport, signal)
        if (!value) rejectPreparation('capability_unsupported')
        prepared = { kind: 'timeline', value }
      } else if (lane === 'canvas') {
        const value = await input.canvasWrite.prepare(transport, signal)
        if (!value) rejectPreparation('capability_unsupported')
        prepared = { kind: 'canvas', value }
      } else if (lane === 'export') {
        const value = await input.phase4.prepareWrite(transport, signal)
        if (!value) rejectPreparation('capability_unsupported')
        prepared = { kind: 'export', value }
      } else if (lane === 'skillWrite') {
        const dirName = String((call.args as { dirName?: unknown }).dirName ?? '')
        const value = await input.skillWrite.prepare(transport, { target: { kind: 'skill', dirName }, preconditions: {} }, signal)
        if (!value) rejectPreparation('capability_unsupported')
        prepared = { kind: 'skill', value }
      } else {
        // Draft creation, generation planning and the model-setup panel have their own durable domain owner.
        prepared = { kind: 'direct', value: { call } }
      }
      if (disposed || signal.aborted) rejectPreparation('capability_cancelled')
      pending.set(call.toolCallId, { call, prepared, generationContext: captureGenerationContext(input.context?.()) })
    },
    async approved(call, record) {
      const entry = pending.get(call.toolCallId)
      if (!entry) return
      if (entry.approved || disposed || entry.call.toolName !== call.toolName) rejectPreparation('capability_authority_invalid')
      if (entry.prepared.kind === 'direct') {
        // The lane's approval note is already durable before this callback; no G5 journal is fabricated.
        entry.approved = true
        return
      }
      const approval: CanvasWriteApprovalAuthority = { approvalId: `approval-${randomUUID()}`,
        receiptProposalId: `receipt-${randomUUID()}`, actionHash: entry.prepared.value.invocation.actionHash }
      await record(LANE_RECEIPT_AUTHORITY_NOTE, { ...approval, toolCallId: call.toolCallId })
      // Abort/settlement may have run while persistence was in flight.
      if (disposed || pending.get(call.toolCallId) !== entry) rejectPreparation('capability_cancelled')
      entry.approved = approval
    },
    settled(call) { pending.delete(call.toolCallId) },
  }

  async function executeRead(call: RuntimeToolCall, signal: AbortSignal): Promise<RuntimeToolDecision> {
    const { lane, call: transport } = translate(call)
    if (lane === 'skillRead') return await input.skillRead.tryExecute(transport, signal) ?? failure('capability_unsupported')
    if (lane === 'media' || lane === 'export') return await input.phase4.tryExecuteRead(transport, signal) ?? failure('capability_unsupported')
    if (lane === 'generation') {
      return await input.generation()?.tryExecute(transport, signal) ?? generationSurfaceUnavailable()
    }
    return failure('capability_unsupported')
  }

  async function execute(call: RuntimeToolCall, signal: AbortSignal): Promise<RuntimeToolDecision> {
    if (disposed || signal.aborted) return failure('capability_cancelled')
    const spec = byName.get(call.toolName)
    if (!spec) return failure('capability_unsupported')
    // Compare the same schema-normalized arguments captured during prepare. Zod
    // may materialize defaults/normalization, so comparing the raw wire object
    // would reject an otherwise identical approved call.
    const normalizedCall = { ...call, args: parseToolArguments(spec, call.args) }
    const contract = capabilityContractById(modelToolCapabilityId(spec, normalizedCall.args))
    if (!contract) return failure('capability_unsupported')
    // 读走 `executeRead`：路由判据是**动词声明翻出来的 lane**（`translate`，20 动词那张传输表），
    // 不再是这里按 `internalGroup` 手写的分支树。`origin/main` 那棵树里的 `production` 一支随
    // 37 个内部名一起退役（v2 的声明里没有 `production` 组）；生成面不在时的那句相由
    // `generationSurfaceUnavailable()` 说（#785 的 owner），在 `executeRead` 里。
    if (contract.effect === 'read') return executeRead(normalizedCall, signal)
    const entry = pending.get(call.toolCallId)
    if (!entry?.approved || entry.call.toolName !== normalizedCall.toolName
      || JSON.stringify(entry.call.args) !== JSON.stringify(normalizedCall.args)) return failure('capability_authority_invalid')
    // Consume before crossing the domain boundary. Even an exception cannot reuse this approval.
    pending.delete(call.toolCallId)
    const { prepared, approved } = entry
    let result: RuntimeToolDecision
    if (prepared.kind === 'direct') {
      // 传输方法名同样由声明翻（`translate`），不按组名手写；生成面不在 → #785 那句「此刻是哪个相」。
      const { call: transport } = translate(normalizedCall)
      result = await input.generation()?.tryExecute(transport, signal, entry.generationContext) ?? generationSurfaceUnavailable()
    } else {
      if (approved === true) return failure('capability_authority_invalid')
      switch (prepared.kind) {
        case 'timeline': result = await input.timelineWrite.execute(prepared.value, approved, signal); break
        case 'canvas': result = await input.canvasWrite.execute(prepared.value, approved, signal); break
        case 'export': result = await input.phase4.executeWrite(prepared.value, approved, signal); break
        case 'skill': result = await input.skillWrite.execute(prepared.value, approved, signal); break
      }
      if (result.ok && (prepared.kind === 'canvas' || prepared.kind === 'export')) {
        if (!committedProjectAgentReceiptMatchesApproval(input.binding, input.receipts.read(), approved)) {
          return failure('capability_receipt_unresolved')
        }
      }
    }
    if (result.ok && normalizedCall.toolName === 'draft_shots' && !(normalizedCall.args as { operationId?: unknown }).operationId) {
      await input.onTaskCreated?.(normalizedCall, result.result)
    }
    return result
  }

  return { tools: createExtendedLaneTools({ execute }), toolLifecycle, groups: LANE_DEFERRED_TOOL_GROUPS,
    dispose() { disposed = true; pending.clear() },
  }
}
