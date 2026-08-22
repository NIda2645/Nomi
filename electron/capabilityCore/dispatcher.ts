// 能力核 · 方法路由（单一真相源）。
// RPC 传输（rpcServer）与 headless host（host）共用这一份 method→core 映射，杜绝两份路由漂移（P1）。
import {
  addProjectNodes,
  connectProjectNodes,
  createNamedProject,
  deleteProjectNodes,
  generateOnProject,
  importProjectAsset,
  listAllProjects,
  listAvailableModels,
  readProjectCanvas,
  setProjectNodePrompt,
  type FetchTaskResultFn,
  type GenerateInput,
  type MakeVerifyDeps,
  type RunTaskFn,
} from './core'
import { listSkillSummaries, readSkillContent } from '../skills/skillStore'
import type { ProductionRunService } from '../productionRun/productionRunService'
import type { ProductionBrief } from '../productionRun/productionRunTypes'
import { withPreApprovedPlan, type ProjectGateway } from './gateway'
import { INTAKE_MAX_QUESTIONS, buildIntakeMessage, buildIntakeQuestions } from './mcpBriefIntake'
import type { CapabilityOriginHost } from './security'
import {
  createMcpGenerationPolicy,
  type McpGenerationCapability,
  type McpGenerationPolicy,
  type McpGenerationPolicySnapshot,
} from './mcpGenerationPolicy'

export type RpcPolicyErrorCode = 'feature_disabled' | 'phase_not_ready' | 'not_ready' | 'legacy_path_forbidden'

export type RpcPolicyErrorDetails = Readonly<{
  code: RpcPolicyErrorCode
  nextAction: string
  phase: McpGenerationPolicySnapshot['phase']
  capability: McpGenerationCapability
}>

export class RpcError extends Error {
  readonly code?: RpcPolicyErrorCode
  readonly nextAction?: string
  readonly phase?: McpGenerationPolicySnapshot['phase']
  readonly capability?: McpGenerationCapability

  constructor(message: string, readonly httpStatus: number, details?: RpcPolicyErrorDetails) {
    super(message)
    this.code = details?.code
    this.nextAction = details?.nextAction
    this.phase = details?.phase
    this.capability = details?.capability
  }
}

export function projectIdOf(params: Record<string, unknown>): string {
  return typeof params.projectId === 'string' ? params.projectId : ''
}

/**
 * makeGateway：按 projectId 解析该用哪个网关——A 模式（app 开着且该项目正打开）→ 渲染层网关（实时）；
 * 否则 → 磁盘网关（直写盘）。rpcServer 据 isProjectOpen + 渲染层可达性提供；headless host 恒磁盘网关。
 */
export type DispatchContext = {
  runTask: RunTaskFn
  fetchTaskResult?: FetchTaskResultFn
  makeGateway: (projectId: string) => ProjectGateway
  productionRuns: Pick<ProductionRunService, 'createDraft' | 'readProjection' | 'readEvents' | 'readArtifactProjection' | 'readFull' | 'command'> & Partial<{
    /** Task 4 versioned artifact MCP seam. Optional keeps low-level test doubles/source-compatible. */
    readArtifactContent: (projectId: string, runId: string, artifactId: string) => unknown
    requestArtifactRevision: (input: { projectId: string; runId: string; artifactId: string; expectedVersion: number; instruction: string; kind: 'script' | 'storyboard' }) => unknown
    reviewArtifact: (input: { projectId: string; runId: string; artifactId: string; expectedVersion: number; decision: 'approved' | 'changes_requested' | 'rejected' }) => unknown
    materializeStoryboard: (input: { projectId: string; runId: string; artifactId: string; expectedVersion: number }) => unknown
  }>
  /** Transport-owned authority. Request bodies may provide only an audit label, never trust. */
  origin?: { host: CapabilityOriginHost; actorId?: string }
  /** The frozen server-side generation policy. Omit in legacy callers to build the default snapshot. */
  generationPolicy?: McpGenerationPolicy
  /** Optional read-only context seam. No semantic route may fall through to a legacy service. */
  generationContext?: (params: Record<string, unknown>) => unknown | Promise<unknown>
  /**
   * 方案已由协议层 elicitation-first 拿到真人 accept（画布确认，见 mcpProtocol.ts）→ canvas.addNodes 预批准
   * 方案门、不再弹渲染层卡（免双问）。只作用于 addNodes 的 confirmPlan，钱路（confirmSpend）不受影响。
   */
  planConfirmed?: boolean
  /**
   * 审片环 deps 工厂（W1，可选）。传输层注入真实现（headless=makeShotVerifyDeps；GUI-RPC 同一份）→
   * generate 生成成功后跑判分→定向重试→红标。**不注入 = generate 行为逐字节不变**（默认）。
   * 领域策略住 shotVerifyOrchestrate，传输层只注入 deps，core 只透传 outcome（三层干净，方案 §3/§9）。
   */
  makeVerifyDeps?: MakeVerifyDeps
}

const PRODUCTION_START_FIELDS = new Set([
  'projectId', 'playbook', 'playbookVersion', 'host', 'actorId', 'brief', 'trustLevel',
])

function requiredIdentifier(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(normalized) || normalized === '.' || normalized === '..') throw new RpcError(`Invalid ${label} id`, 400)
  return normalized
}

function assertOnlyFields(params: Record<string, unknown>, allowed: Set<string>): void {
  const unexpected = Object.keys(params).find((key) => !allowed.has(key))
  if (unexpected) throw new RpcError(`Production field is not allowed: ${unexpected}`, 400)
}

function optionalText(value: unknown, label: string, max = 500): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized || normalized.length > max) throw new RpcError(`Invalid ${label}`, 400)
  return normalized
}

function stringList(value: unknown, label: string, maxItems = 20): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > maxItems) throw new RpcError(`Invalid ${label}`, 400)
  return value.map((item, index) => optionalText(item, `${label}[${index}]`) as string)
}

function artifactVersion(value: unknown): number {
  const version = Number(value)
  if (!Number.isInteger(version) || version < 1) throw new RpcError('Invalid artifact version', 400)
  return version
}

function revisionInstruction(value: unknown): string {
  const instruction = typeof value === 'string' ? value.trim() : ''
  if (!instruction || instruction.length > 4_000) throw new RpcError('Invalid revision instruction', 400)
  return instruction
}

function artifactReadService(ctx: DispatchContext) {
  if (typeof ctx.productionRuns.readArtifactContent !== 'function') throw new RpcError('Versioned artifact reads are unavailable', 501)
  return ctx.productionRuns.readArtifactContent
}

function artifactRevisionService(ctx: DispatchContext) {
  if (typeof ctx.productionRuns.requestArtifactRevision !== 'function') throw new RpcError('Artifact revisions are unavailable', 501)
  return ctx.productionRuns.requestArtifactRevision
}

function artifactReviewService(ctx: DispatchContext) {
  if (typeof ctx.productionRuns.reviewArtifact !== 'function') throw new RpcError('Artifact review is unavailable', 501)
  return ctx.productionRuns.reviewArtifact
}

function storyboardMaterializeService(ctx: DispatchContext) {
  if (typeof ctx.productionRuns.materializeStoryboard !== 'function') throw new RpcError('Storyboard materialization is unavailable', 501)
  return ctx.productionRuns.materializeStoryboard
}

function productionBrief(value: unknown): ProductionBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RpcError('Invalid production brief', 400)
  const raw = value as Record<string, unknown>
  const allowed = new Set(['goal', 'audience', 'channel', 'tone', 'durationSeconds', 'sellingPoints', 'referenceArtifactIds'])
  const unexpected = Object.keys(raw).find((key) => !allowed.has(key))
  if (unexpected) throw new RpcError(`Production brief field is not allowed: ${unexpected}`, 400)
  const goal = optionalText(raw.goal, 'brief goal', 2_000)
  if (!goal) throw new RpcError('Production brief goal is required', 400)
  const duration = raw.durationSeconds === undefined ? undefined : Number(raw.durationSeconds)
  if (duration !== undefined && (!Number.isFinite(duration) || duration < 1 || duration > 3_600)) {
    throw new RpcError('Invalid brief durationSeconds', 400)
  }
  return {
    goal,
    ...(optionalText(raw.audience, 'brief audience') ? { audience: optionalText(raw.audience, 'brief audience') } : {}),
    ...(optionalText(raw.channel, 'brief channel') ? { channel: optionalText(raw.channel, 'brief channel') } : {}),
    ...(optionalText(raw.tone, 'brief tone') ? { tone: optionalText(raw.tone, 'brief tone') } : {}),
    ...(duration !== undefined ? { durationSeconds: duration } : {}),
    ...(raw.sellingPoints !== undefined ? { sellingPoints: stringList(raw.sellingPoints, 'brief sellingPoints') } : {}),
    ...(raw.referenceArtifactIds !== undefined
      ? { referenceArtifactIds: stringList(raw.referenceArtifactIds, 'brief referenceArtifactIds') }
      : {}),
  }
}

function productionStartInput(params: Record<string, unknown>, authority: DispatchContext['origin']) {
  const forbidden = Object.keys(params).find((key) => !PRODUCTION_START_FIELDS.has(key))
  if (forbidden) throw new RpcError(`Production start field is not allowed: ${forbidden}`, 400)
  const actorId = authority?.actorId ?? optionalText(params.actorId, 'origin actor', 160)
  // B3：可选信任档位随草稿一起声明（不传 = 服务侧默认 key_confirm）。非法值早拒，不静默兜底。
  let trustLevel: string | undefined
  if (params.trustLevel !== undefined) {
    trustLevel = String(params.trustLevel)
    if (!['key_confirm', 'budget_only', 'confirm_all'].includes(trustLevel)) throw new RpcError('Invalid trust level', 400)
  }
  return {
    projectId: requiredIdentifier(params.projectId, 'project'),
    playbook: {
      name: requiredIdentifier(params.playbook, 'playbook'),
      version: optionalText(params.playbookVersion, 'playbook version', 120) ?? '1.0.0',
    },
    origin: {
      host: authority?.host ?? 'external',
      ...(actorId ? { actorId } : {}),
    },
    brief: productionBrief(params.brief),
    ...(trustLevel ? { policy: { trustLevel: trustLevel as import('../productionRun/productionRunTypes').TrustLevel } } : {}),
  }
}

const SEMANTIC_GENERATION_ROUTES: Readonly<Record<string, Readonly<{
  capability: McpGenerationCapability
  contextRead?: boolean
}>>> = Object.freeze({
  nomi_session_open: { capability: 'context' },
  nomi_get_generation_context: { capability: 'context', contextRead: true },
  nomi_operation_create: { capability: 'create' },
  nomi_submit_generation_plan: { capability: 'plan' },
  nomi_preview_execution: { capability: 'preview' },
  nomi_request_generation_gate: { capability: 'gate_request' },
  nomi_decide_generation_gate: { capability: 'gate_decide' },
  nomi_start_generation: { capability: 'start' },
  nomi_operation_read: { capability: 'read' },
  nomi_subscribe_run: { capability: 'events' },
  nomi_cancel_generation: { capability: 'cancel' },
  nomi_reconcile_generation: { capability: 'reconcile' },
  nomi_steer_generation: { capability: 'steer' },
  // P5 compatibility names are intentionally explicit stubs, not aliases to old artifact owners.
  nomi_get_artifact: { capability: 'read' },
  nomi_propose_adopt_artifact: { capability: 'create' },
})

const SEMANTIC_BINDING_FIELDS = new Set([
  'leaseHandle', 'receiptId', 'contractHash', 'gateKind', 'operationId', 'shotId', 'runtimeTaskId',
  'immutableProjectUuid', 'projectGeneration', 'serverNonce', 'handoff', 'actionNonce',
  'projectSelectionHandle', 'targetHash', 'reservationId',
])

const LEGACY_ROUTE_CAPABILITY: Readonly<Record<string, McpGenerationCapability>> = Object.freeze({
  nomi_generate: 'create',
  'production.start': 'create',
  'production.control': 'cancel',
  'production.decide-gate': 'gate_decide',
  nomi_start_playbook: 'create',
})

function policyError(
  details: RpcPolicyErrorDetails,
  message = `generation.single-shot ${details.code}`,
): RpcError {
  return new RpcError(message, 403, details)
}

function unavailableSemanticRoute(policy: McpGenerationPolicy, capability: McpGenerationCapability): RpcError {
  const snapshot = policy.snapshot()
  return policyError({
    code: 'not_ready',
    nextAction: snapshot.nextAction,
    phase: snapshot.phase,
    capability,
  }, `generation.single-shot ${capability} is not ready`)
}

function hasSemanticBinding(route: string, params: Record<string, unknown>): boolean {
  const keys = Object.keys(params)
  if (keys.some((key) => SEMANTIC_BINDING_FIELDS.has(key))) return true
  // runId is a normal identifier on the two legacy run-control calls. It is a
  // P3 binding marker only when paired with another sealed semantic field.
  if (keys.includes('runId') && keys.some((key) => SEMANTIC_BINDING_FIELDS.has(key))) return true
  // The legacy draft entry points never accepted a runId at all; fail closed
  // before their normal field validator can turn a P3 call into a generic 400.
  return ['nomi_generate', 'production.start', 'nomi_start_playbook'].includes(route) && keys.includes('runId')
}

function guardLegacyRoute(policy: McpGenerationPolicy, route: string, params: Record<string, unknown>): void {
  if (!hasSemanticBinding(route, params)) return
  const snapshot = policy.snapshot()
  const capability = LEGACY_ROUTE_CAPABILITY[route] ?? 'create'
  throw policyError({
    code: 'legacy_path_forbidden',
    nextAction: snapshot.nextAction,
    phase: snapshot.phase,
    capability,
  }, `Legacy route ${route} cannot carry generation.single-shot bindings`)
}

async function dispatchSemanticStub(
  route: Readonly<{ capability: McpGenerationCapability; contextRead?: boolean }>,
  params: Record<string, unknown>,
  ctx: DispatchContext,
  policy: McpGenerationPolicy,
): Promise<unknown> {
  const decision = policy.decide(route.capability)
  if (decision.kind === 'blocked') {
    throw policyError({
      code: decision.code,
      nextAction: decision.nextAction,
      phase: decision.phase,
      capability: decision.capability,
    })
  }
  if (route.contextRead && typeof ctx.generationContext === 'function') return ctx.generationContext(params)
  // Even when a phase advertises a capability, this slice has no write owner.
  // Keep the route explicit so it cannot fall through to a legacy service.
  throw unavailableSemanticRoute(policy, route.capability)
}

export async function dispatch(method: string, params: Record<string, unknown>, ctx: DispatchContext): Promise<unknown> {
  const generationPolicy = ctx.generationPolicy ?? createMcpGenerationPolicy()
  const classifiedRoute = generationPolicy.classifyRoute(method)
  if (classifiedRoute.kind === 'legacy') guardLegacyRoute(generationPolicy, method, params)
  const semanticRoute = SEMANTIC_GENERATION_ROUTES[method]
  if (semanticRoute) return dispatchSemanticStub(semanticRoute, params, ctx, generationPolicy)

  switch (method) {
    case 'ping':
      return { ok: true }
    case 'project.list':
      return { projects: listAllProjects() }
    case 'project.create':
      return createNamedProject(typeof params.name === 'string' ? params.name : undefined)
    case 'models.list':
      return { models: listAvailableModels() }
    case 'skills.list':
      // 导演/编剧技能库元数据（渐进披露，不含正文）。供 MCP 脊柱 resources/prompts 列表。
      return { skills: listSkillSummaries() }
    case 'skills.read':
      // 按 name/directoryName 读一个技能正文。找不到 ⇒ null（协议层转 error）。
      return readSkillContent(String(params.name || params.directoryName || ''))
    case 'production.start':
      return ctx.productionRuns.createDraft(productionStartInput(params, ctx.origin))
    case 'production.get':
      assertOnlyFields(params, new Set(['projectId', 'runId']))
      return ctx.productionRuns.readProjection(
        requiredIdentifier(params.projectId, 'project'),
        requiredIdentifier(params.runId, 'run'),
      )
    case 'production.events': {
      assertOnlyFields(params, new Set(['projectId', 'runId', 'afterCursor', 'waitMs']))
      const afterCursor = params.afterCursor === undefined ? 0 : Number(params.afterCursor)
      const waitMs = params.waitMs === undefined ? 0 : Number(params.waitMs)
      if (!Number.isInteger(afterCursor) || afterCursor < 0) throw new RpcError('Invalid production event cursor', 400)
      if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 25_000) throw new RpcError('Invalid production event waitMs', 400)
      return ctx.productionRuns.readEvents(
        requiredIdentifier(params.projectId, 'project'),
        requiredIdentifier(params.runId, 'run'),
        afterCursor,
        Math.floor(waitMs),
      )
    }
    case 'production.artifact':
      assertOnlyFields(params, new Set(['projectId', 'runId', 'artifactId']))
      return ctx.productionRuns.readArtifactProjection(
        requiredIdentifier(params.projectId, 'project'),
        requiredIdentifier(params.runId, 'run'),
        requiredIdentifier(params.artifactId, 'artifact'),
      )
    case 'production.artifact.read': {
      assertOnlyFields(params, new Set(['projectId', 'runId', 'artifactId']))
      return artifactReadService(ctx)(
        requiredIdentifier(params.projectId, 'project'),
        requiredIdentifier(params.runId, 'run'),
        requiredIdentifier(params.artifactId, 'artifact'),
      )
    }
    case 'production.artifact.revise': {
      assertOnlyFields(params, new Set(['projectId', 'runId', 'artifactId', 'expectedVersion', 'instruction', 'kind']))
      const kind = params.kind === 'script' || params.kind === 'storyboard' ? params.kind : ''
      if (!kind) throw new RpcError('Artifact revision kind must be script or storyboard', 400)
      return artifactRevisionService(ctx)({
        projectId: requiredIdentifier(params.projectId, 'project'),
        runId: requiredIdentifier(params.runId, 'run'),
        artifactId: requiredIdentifier(params.artifactId, 'artifact'),
        expectedVersion: artifactVersion(params.expectedVersion),
        instruction: revisionInstruction(params.instruction),
        kind,
      })
    }
    case 'production.artifact.review': {
      assertOnlyFields(params, new Set(['projectId', 'runId', 'artifactId', 'expectedVersion', 'decision']))
      const decision = params.decision === 'approved' || params.decision === 'changes_requested' || params.decision === 'rejected'
        ? params.decision
        : ''
      if (!decision) throw new RpcError('Invalid artifact review decision', 400)
      return artifactReviewService(ctx)({
        projectId: requiredIdentifier(params.projectId, 'project'),
        runId: requiredIdentifier(params.runId, 'run'),
        artifactId: requiredIdentifier(params.artifactId, 'artifact'),
        expectedVersion: artifactVersion(params.expectedVersion),
        decision,
      })
    }
    case 'production.storyboard.materialize': {
      assertOnlyFields(params, new Set(['projectId', 'runId', 'artifactId', 'expectedVersion']))
      return storyboardMaterializeService(ctx)({
        projectId: requiredIdentifier(params.projectId, 'project'),
        runId: requiredIdentifier(params.runId, 'run'),
        artifactId: requiredIdentifier(params.artifactId, 'artifact'),
        expectedVersion: artifactVersion(params.expectedVersion),
      })
    }
    case 'production.control': {
      // A4：pause/resume/cancel。B3：set_trust（配 trustLevel）改信任档位。
      // commandId 按 (action[/trustLevel], revision) 确定 → 同一状态下重复触发天然幂等。
      assertOnlyFields(params, new Set(['projectId', 'runId', 'action', 'trustLevel']))
      const action = String(params.action || '')
      if (!['pause', 'resume', 'cancel', 'set_trust'].includes(action)) throw new RpcError('Invalid production control action', 400)
      const projectId = requiredIdentifier(params.projectId, 'project')
      const runId = requiredIdentifier(params.runId, 'run')
      const full = ctx.productionRuns.readFull(projectId, runId)
      if (!full) throw new RpcError(`Production run not found: ${runId}`, 404)
      if (action === 'set_trust') {
        const trustLevel = String(params.trustLevel || '')
        if (!['key_confirm', 'budget_only', 'confirm_all'].includes(trustLevel)) throw new RpcError('Invalid trust level', 400)
        if (trustLevel !== 'confirm_all' && full.gates.some((gate) => gate.status === 'waiting'
          && gate.scope === 'job_set' && gate.gateId.startsWith('gate-shot-'))) {
          throw new RpcError('Decide the waiting shot in Nomi before changing its trust level', 403)
        }
        await ctx.productionRuns.command(projectId, runId, {
          commandId: `mcp-control-set_trust-${trustLevel}-${full.revision}`,
          expectedRevision: full.revision,
          type: 'run.control',
          payload: { action, trustLevel },
          issuedAt: new Date().toISOString(),
        })
        return ctx.productionRuns.readProjection(projectId, runId)
      }
      await ctx.productionRuns.command(projectId, runId, {
        commandId: `mcp-control-${action}-${full.revision}`,
        expectedRevision: full.revision,
        type: 'run.control',
        payload: { action },
        issuedAt: new Date().toISOString(),
      })
      return ctx.productionRuns.readProjection(projectId, runId)
    }
    case 'production.decide-gate': {
      // B1：agent 已用 elicitation 问过真人，拿到 accept 才调这里表态一道门（方向门可带 choiceKey）。
      assertOnlyFields(params, new Set(['projectId', 'runId', 'gateId', 'decision', 'choiceKey']))
      const decision = String(params.decision || '')
      if (decision !== 'approved' && decision !== 'rejected') throw new RpcError('Invalid production gate decision', 400)
      const projectId = requiredIdentifier(params.projectId, 'project')
      const runId = requiredIdentifier(params.runId, 'run')
      const gateId = requiredIdentifier(params.gateId, 'gate')
      const rawChoice = typeof params.choiceKey === 'string' ? params.choiceKey.trim() : ''
      const choiceKey = /^[A-Za-z0-9._-]{1,40}$/.test(rawChoice) ? rawChoice : undefined
      const full = ctx.productionRuns.readFull(projectId, runId)
      if (!full) throw new RpcError(`Production run not found: ${runId}`, 404)
      const gate = full.gates.find((item) => item.gateId === gateId)
      if (!gate) throw new RpcError(`Production gate not found: ${gateId}`, 404)
      const creativeGate = gate.scope === 'stage'
        && (gate.gateId.startsWith('gate-direction-') || gate.gateId.startsWith('gate-sample-') || gate.gateId.startsWith('gate-freeze-'))
      if (!creativeGate) throw new RpcError('This production gate must be decided in Nomi', 403)
      await ctx.productionRuns.command(projectId, runId, {
        commandId: `mcp-decide-${gateId}-${decision}-${full.revision}`,
        expectedRevision: full.revision,
        type: 'gate.decide',
        payload: { gateId, status: decision, ...(choiceKey ? { choiceKey } : {}) },
        issuedAt: new Date().toISOString(),
      })
      return ctx.productionRuns.readProjection(projectId, runId)
    }
    case 'canvas.read':
      return readProjectCanvas(ctx.makeGateway(projectIdOf(params)))
    case 'canvas.addNodes': {
      // 方案已被协议层 elicitation-first 批准 → 预批准方案门（不再弹渲染层卡，免双问）；否则原网关照常确认。
      const base = ctx.makeGateway(projectIdOf(params))
      const gateway = ctx.planConfirmed ? withPreApprovedPlan(base) : base
      return addProjectNodes(gateway, Array.isArray(params.nodes) ? (params.nodes as never[]) : [], projectIdOf(params))
    }
    case 'canvas.connect':
      return connectProjectNodes(ctx.makeGateway(projectIdOf(params)), Array.isArray(params.connections) ? (params.connections as never[]) : [])
    case 'canvas.setPrompt':
      return setProjectNodePrompt(
        ctx.makeGateway(projectIdOf(params)),
        String(params.nodeId || ''),
        String(params.prompt || ''),
        typeof params.title === 'string' ? params.title : undefined,
      )
    case 'canvas.deleteNodes':
      return deleteProjectNodes(ctx.makeGateway(projectIdOf(params)), Array.isArray(params.nodeIds) ? (params.nodeIds as string[]) : [])
    case 'brief.intake': {
      // W3 幕 0：只组题/给默认，**不落任何状态**——真正的「问」由协议层弹 elicitation（enum 候选），
      // 客户端不支持表单时协议层退化成把题面交给模型在对话里一次问全。
      assertOnlyFields(params, new Set(['projectId', 'kind']))
      const questions = buildIntakeQuestions({ kind: typeof params.kind === 'string' ? params.kind : '' })
      return { questions, message: buildIntakeMessage(questions), maxQuestions: INTAKE_MAX_QUESTIONS }
    }
    case 'asset.import':
      // M2：本机文件 → 项目素材 → nomi-local:// URL。安全判据在 importAssetGuard（纯函数，逐条单测）。
      assertOnlyFields(params, new Set(['projectId', 'path', 'title']))
      return importProjectAsset({
        projectId: requiredIdentifier(params.projectId, 'project'),
        path: String(params.path || ''),
        ...(typeof params.title === 'string' && params.title.trim() ? { title: params.title.trim() } : {}),
      })
    case 'generate':
      // makeVerifyDeps 是**传输层注入**（不是模型能填的入参）→ 从 ctx 取、覆盖任何请求体里的同名字段
      // （防外部 agent 伪造），与 makeGateway/planConfirmed 同注入模式。不注入 = 审片环不跑（默认行为不变）。
      return generateOnProject(
        { ...(params as unknown as GenerateInput), makeVerifyDeps: ctx.makeVerifyDeps },
        ctx.makeGateway(projectIdOf(params)),
        ctx.runTask,
        ctx.fetchTaskResult,
      )
    default:
      throw new RpcError(`未知方法: ${method}`, 404)
  }
}
