import { z } from 'zod'

export const AGENT_SYSTEM_SCHEMA_VERSION = 1 as const

const schemaVersionError = (label: string) =>
  `Unsupported agent-system ${label} schema version; expected ${AGENT_SYSTEM_SCHEMA_VERSION}`

const versionSchema = z
  .number()
  .int()
  .positive()
  .refine((value) => value === AGENT_SYSTEM_SCHEMA_VERSION, {
    message: schemaVersionError('artifact'),
  })

const textListSchema = z.array(z.string().min(1)).default([])

export const agentSystemBudgetSchema = z
  .object({
    currency: z.string().min(1),
    maxAmount: z.number().finite().nonnegative(),
    maxTurns: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
  })
  .strict()

export const agentSystemEnvironmentSchema = z
  .object({
    network: z.enum(['off', 'fixture-only', 'allowlisted']),
    provider: z.enum(['fake', 'recorded', 'live']),
  })
  .strict()

export const agentSystemRubricCriterionSchema = z
  .object({
    id: z.string().min(1),
    criterion: z.string().min(1),
    hardGate: z.boolean().default(true),
  })
  .strict()

export const agentSystemEvidenceSchema = z
  .object({
    version: versionSchema,
    evidenceId: z.string().min(1),
    kind: z.enum(['trace', 'artifact', 'screenshot', 'log', 'metric']),
    label: z.string().min(1),
    uri: z.string().min(1),
    sha256: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
  })
  .strict()

export const agentSystemTraceItemSchema = z
  .object({
    itemId: z.string().min(1),
    kind: z.string().min(1),
    status: z.enum(['pending', 'consumed', 'missing', 'skipped']),
  })
  .strict()

export const agentSystemTraceEffectSchema = z
  .object({
    effectId: z.string().min(1),
    kind: z.string().min(1),
    count: z.number().int().nonnegative(),
  })
  .strict()

export const agentSystemTraceSchema = z
  .object({
    version: versionSchema,
    runId: z.string().min(1),
    caseId: z.string().min(1),
    items: z.array(agentSystemTraceItemSchema),
    effects: z.array(agentSystemTraceEffectSchema),
    evidence: z.array(agentSystemEvidenceSchema).default([]),
    notes: textListSchema,
  })
  .strict()

export const agentSystemVerdictSchema = z
  .object({
    version: versionSchema,
    runId: z.string().min(1),
    caseId: z.string().min(1),
    status: z.enum(['pass', 'fail', 'blocked', 'needs_attention']),
    summary: z.string().min(1),
    findings: z
      .array(
        z
          .object({
            id: z.string().min(1),
            status: z.enum(['pass', 'fail', 'blocked']),
            note: z.string().min(1).optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()

export const agentSystemCaseSchema = z
  .object({
    version: versionSchema,
    caseId: z.string().min(1),
    journeyId: z.enum(['J1', 'J2', 'J3', 'J4', 'J5']),
    objective: z.string().min(1),
    initialProjectSnapshot: z.string().min(1),
    userMessages: z.array(z.string().min(1)).min(1),
    allowedSkills: textListSchema,
    allowedCapabilities: textListSchema,
    initialToolSurface: textListSchema,
    budget: agentSystemBudgetSchema,
    environment: agentSystemEnvironmentSchema,
    forbiddenEffects: textListSchema,
    expectedTerminalState: z.string().min(1),
    rubric: z.array(agentSystemRubricCriterionSchema).min(1),
    evidence: textListSchema,
  })
  .strict()

export const agentSystemAuthorityAdapterOwners = [
  {
    authority: 'creation.agent',
    adapter: 'pi-sdk-runtime',
    owner: 'electron/harness/runtime/pi/*.mts',
    source: 'docs/ARCHITECTURE-NOW.md',
  },
  {
    authority: 'creation.agent',
    adapter: 'tool-selection-policy',
    owner: 'electron/harness/agentChatPolicy.ts',
    source: 'docs/ARCHITECTURE-NOW.md',
  },
  {
    authority: 'creation.agent',
    adapter: 'session-ownership',
    owner: 'src/workbench/ai/agentSessionKey.ts',
    source: 'docs/ARCHITECTURE-NOW.md',
  },
  {
    authority: 'mcp.transport',
    adapter: 'tool-catalog',
    owner: 'electron/capabilityCore/mcpToolCatalog.ts',
    source: 'docs/ARCHITECTURE-NOW.md',
  },
  {
    authority: 'timeline.preview',
    adapter: 'timeline-planner',
    owner: 'src/workbench/generationCanvas/agent/storyboardTimelinePlan.ts',
    source: 'docs/ARCHITECTURE-NOW.md',
  },
] as const

export const CREATOR_RUBRIC: z.infer<typeof agentSystemRubricCriterionSchema>[] = [
  { id: 'goal-fidelity', criterion: '目标/受众/平台保持一致', hardGate: true },
  { id: 'story-coherence', criterion: '分镜和节奏可理解且可编辑', hardGate: true },
  { id: 'identity-continuity', criterion: '跨镜身份不张冠李戴', hardGate: true },
  { id: 'visual-quality', criterion: '构图、可读性和镜头稳定性达标', hardGate: true },
  { id: 'editability', criterion: '用户能改并看到影响', hardGate: true },
  { id: 'cost-clarity', criterion: '预算和一次确认边界清楚', hardGate: true },
  { id: 'recovery-quality', criterion: '重启或失败后继续，不重复 effect', hardGate: true },
  { id: 'export-readiness', criterion: '产物、画布和导出闭合', hardGate: true },
]

const creatorBudget = (maxTurns: number, maxTokens: number) => ({
  currency: 'USD',
  maxAmount: 0,
  maxTurns,
  maxTokens,
})

const baseForbiddenEffects = [
  'duplicate provider effect',
  'blind retry after unknown',
  'cross-project mutation',
  'unapproved spend',
]

export const AGENT_SYSTEM_CASES: z.infer<typeof agentSystemCaseSchema>[] = [
  {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    caseId: 'J1',
    journeyId: 'J1',
    objective: '从一句目标生成可编辑短视频结构',
    initialProjectSnapshot: 'empty-creator-shell',
    userMessages: ['把这句话变成一条可编辑短视频结构。'],
    allowedSkills: ['brief-intake', 'storyboard', 'plan-preview'],
    allowedCapabilities: ['creation.agent'],
    initialToolSurface: ['creation.agent', 'timeline.preview'],
    budget: creatorBudget(6, 4096),
    environment: { network: 'fixture-only', provider: 'fake' },
    forbiddenEffects: [...baseForbiddenEffects, 'export.media', 'provider.submit'],
    expectedTerminalState: 'editable-structure-ready',
    rubric: CREATOR_RUBRIC,
    evidence: ['trace', 'artifact'],
  },
  {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    caseId: 'J2',
    journeyId: 'J2',
    objective: '为指定镜头选择模型并加入或替换参考素材',
    initialProjectSnapshot: 'empty-references-shell',
    userMessages: ['给这个镜头选一个合适模型，再把参考素材换进去。'],
    allowedSkills: ['model-selection', 'reference-management', 'cost-preview'],
    allowedCapabilities: ['creation.agent', 'references.assets'],
    initialToolSurface: ['creation.agent', 'references.assets'],
    budget: creatorBudget(6, 4096),
    environment: { network: 'fixture-only', provider: 'fake' },
    forbiddenEffects: [...baseForbiddenEffects, 'export.media', 'timeline.commit'],
    expectedTerminalState: 'reference-set-ready',
    rubric: CREATOR_RUBRIC,
    evidence: ['trace', 'artifact'],
  },
  {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    caseId: 'J3',
    journeyId: 'J3',
    objective: '用户确认后执行一次生成并在画布或时间轴预览',
    initialProjectSnapshot: 'single-shot-approval-shell',
    userMessages: ['确认后只执行一次生成，然后给我预览结果。'],
    allowedSkills: ['approval', 'generation', 'preview'],
    allowedCapabilities: ['creation.agent', 'generation.execution', 'timeline.preview'],
    initialToolSurface: ['creation.agent', 'generation.execution', 'timeline.preview'],
    budget: creatorBudget(8, 6144),
    environment: { network: 'fixture-only', provider: 'fake' },
    forbiddenEffects: [...baseForbiddenEffects, 'double-submit', 'stale-approval-reuse'],
    expectedTerminalState: 'single-generation-preview-ready',
    rubric: CREATOR_RUBRIC,
    evidence: ['trace', 'artifact', 'screenshot'],
  },
  {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    caseId: 'J4',
    journeyId: 'J4',
    objective: '在审批等待或 provider unknown 时重启或断线后继续',
    initialProjectSnapshot: 'recovery-shell',
    userMessages: ['如果中断了，恢复后继续，不要重复提交。'],
    allowedSkills: ['recovery', 'reconcile', 'approval-resume'],
    allowedCapabilities: ['creation.agent', 'generation.execution'],
    initialToolSurface: ['creation.agent', 'generation.execution'],
    budget: creatorBudget(8, 6144),
    environment: { network: 'fixture-only', provider: 'fake' },
    forbiddenEffects: [...baseForbiddenEffects, 'blind-resubmit', 'fresh-approval-after-unknown'],
    expectedTerminalState: 'reconciled-without-duplicate-spend',
    rubric: CREATOR_RUBRIC,
    evidence: ['trace', 'artifact'],
  },
  {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    caseId: 'J5',
    journeyId: 'J5',
    objective: '发现跨镜身份或节奏问题后修改并导出',
    initialProjectSnapshot: 'editable-export-shell',
    userMessages: ['把跨镜一致性和节奏问题修掉，然后导出。'],
    allowedSkills: ['continuity', 'editing', 'export-readiness'],
    allowedCapabilities: ['generation.execution', 'timeline.preview', 'export.media'],
    initialToolSurface: ['generation.execution', 'timeline.preview', 'export.media'],
    budget: creatorBudget(10, 8192),
    environment: { network: 'fixture-only', provider: 'fake' },
    forbiddenEffects: [...baseForbiddenEffects, 'silent-export', 'delete-without-undo'],
    expectedTerminalState: 'export-ready-with-editable-continuity',
    rubric: CREATOR_RUBRIC,
    evidence: ['trace', 'artifact', 'screenshot'],
  },
]

export function parseAgentSystemCase(input: unknown) {
  return agentSystemCaseSchema.parse(input)
}

export function parseAgentSystemTrace(input: unknown) {
  return agentSystemTraceSchema.parse(input)
}

export function parseAgentSystemEvidence(input: unknown) {
  return agentSystemEvidenceSchema.parse(input)
}

export function parseAgentSystemVerdict(input: unknown) {
  return agentSystemVerdictSchema.parse(input)
}

export function serializeAgentSystemCase(value: unknown) {
  return JSON.stringify(agentSystemCaseSchema.parse(value))
}

export function deserializeAgentSystemCase(value: string | unknown) {
  return parseAgentSystemCase(typeof value === 'string' ? JSON.parse(value) : value)
}

export function serializeAgentSystemTrace(value: unknown) {
  return JSON.stringify(agentSystemTraceSchema.parse(value))
}

export function deserializeAgentSystemTrace(value: string | unknown) {
  return parseAgentSystemTrace(typeof value === 'string' ? JSON.parse(value) : value)
}

export function serializeAgentSystemEvidence(value: unknown) {
  return JSON.stringify(agentSystemEvidenceSchema.parse(value))
}

export function deserializeAgentSystemEvidence(value: string | unknown) {
  return parseAgentSystemEvidence(typeof value === 'string' ? JSON.parse(value) : value)
}

export function serializeAgentSystemVerdict(value: unknown) {
  return JSON.stringify(agentSystemVerdictSchema.parse(value))
}

export function deserializeAgentSystemVerdict(value: string | unknown) {
  return parseAgentSystemVerdict(typeof value === 'string' ? JSON.parse(value) : value)
}

export type HarnessMismatch =
  | { kind: 'unconsumed-item'; itemId: string }
  | { kind: 'effect-count-mismatch'; expected: number; actual: number }

export function detectHarnessMismatches(input: {
  expectedItemIds: readonly string[]
  consumedItemIds: readonly string[]
  expectedEffectCount: number
  actualEffectCount: number
}) {
  const mismatches: HarnessMismatch[] = []
  for (const itemId of input.expectedItemIds) {
    if (!input.consumedItemIds.includes(itemId)) mismatches.push({ kind: 'unconsumed-item', itemId })
  }
  if (input.expectedEffectCount !== input.actualEffectCount) {
    mismatches.push({
      kind: 'effect-count-mismatch',
      expected: input.expectedEffectCount,
      actual: input.actualEffectCount,
    })
  }
  return mismatches
}
