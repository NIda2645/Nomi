// Agent lane · 延迟组动词 → 传输层方法调用的**唯一对应表**。
//
// 传输适配器（`capabilityCore/*TransportAdapters.ts`）按契约的 `method` 词表认路（`GENERATION_METHODS.plan` /
// `export_timeline` / `delete_canvas_nodes` …），那是宿主的方法名，模型永远看不见。模型看见的是 20 个动词
// （`verbs/`）。这里把「动词 + 参数」翻成「方法 + 参数」；反向不存在——没有任何一条路把方法名再暴露给模型。
//
// 方法名**不在这里手写**：生成域的取自 `GENERATION_METHODS`（字面量类型 `GenerationMethodName`，改名少一边
// 就是 tsc 红），其余取自各契约导出的别名表。`laneVerbTransport.test.ts` 再真跑一遍：每个动词翻出的方法
// 必须被目标 lane 的适配器认——那正是 #777 上整组生成动词恒 `generation_surface_unavailable` 的那条裂缝。
import type { RuntimeToolCall } from '../shared/agentCapabilities/transportContracts'
import { GENERATION_METHODS, type GenerationMethodName } from '../shared/agentCapabilities/generation'
import { TIMELINE_WRITE_ALIASES } from '../shared/agentCapabilities/timelineWrite'
import { EXPORT_READ_ALIASES, EXPORT_WRITE_ALIASES } from '../shared/agentCapabilities/exportCapabilities'
import { CANVAS_DELETE_ALIAS } from '../shared/agentCapabilities/canvasDelete'
import { SKILL_READ_ALIASES } from '../shared/agentCapabilities/skillRead'
import { SKILL_WRITE_ALIASES } from '../shared/agentCapabilities/skillWrite'
import { assetReadInputOf } from '../shared/agentCapabilities/verbs/verbSemanticInput'

type Args = Record<string, unknown>

/** 一次翻译的结果：走哪条传输、方法名与方法参数。生成 lane 的方法名按字面量类型收窄。 */
export type VerbTransportCall =
  | Readonly<{ lane: 'generation'; call: RuntimeToolCall & { toolName: GenerationMethodName } }>
  | Readonly<{ lane: 'timeline' | 'canvas' | 'export' | 'media' | 'skillRead' | 'skillWrite'; call: RuntimeToolCall }>

/** 生成 lane 的一次调用：`toolName` 只能是 `GENERATION_METHODS` 里的名字。 */
function generationCall(base: { toolCallId: string }, toolName: GenerationMethodName, args: Args): VerbTransportCall {
  return { lane: 'generation', call: { ...base, toolName, args } }
}

/**
 * `draft_shots` 的一镜 → 生成契约 `shots[]` 的一镜（语义字段；候选身份由宿主按目录合成）。
 *
 * **时长落在 `parameters.duration` 里，不是顶层字段**（2026-09-18 根因）：宿主读时长只有一处
 * （`mcpGenerationVideoResolve.shotDurationSeconds`，认 `parameters.duration` / `parameters.durationSeconds`），
 * 而 `generationPlanInputSchema` 的 `shots[]` 是 `.strict()`、压根没有顶层时长字段。此前这里把
 * `durationSec` 改名成顶层 `durationSeconds` 递过去，于是**每一次带时长的调用都被整条拒收**
 * （`generation_input_invalid`）——分镜天生每镜带时长，Agent 因此永远出不来分镜表。
 */
function draftShotToPlanShot(shot: Args): Args {
  const { shotId, role, title, prompt, taskKind, durationSec, modelKey, modeId, candidate, parameters, references } = shot as {
    shotId?: string; role?: string; title?: string; prompt: string; taskKind?: string; durationSec?: number; modelKey?: string; modeId?: string;
    candidate?: { providerId?: string; modelId?: string }; parameters?: Args; references?: string[]
  }
  const withDuration = durationSec === undefined ? parameters : { ...(parameters ?? {}), duration: durationSec }
  // 目录点名（`candidate.providerId` / `candidate.modelId`）是模型**明说**的身份，优先于 `modelKey`。
  // 它过去在这里被整只丢掉（解构里根本没有它），而丢掉一次点名的后果是按用户默认模型去花钱——
  // 不报错、不拒收，只是用错模型（2026-09-18 扫描的 D 类）。
  const modelId = candidate?.modelId ?? modelKey
  return {
    ...(shotId ? { shotId } : {}), ...(role ? { role } : {}), ...(title ? { title } : {}), prompt,
    ...(taskKind ? { taskKind } : {}),
    ...(candidate?.providerId ? { providerId: candidate.providerId } : {}),
    ...(modelId ? { modelId } : {}), ...(modeId ? { modeId } : {}),
    ...(withDuration ? { parameters: withDuration } : {}),
    ...(references ? { references: references.map((assetId) => ({ assetId })) } : {}),
  }
}

/**
 * `draft_shots` 的两个**顶层**缺省（`taskKind` / `candidate`）折进每一镜。
 *
 * 它们在动词上声明成「这一批镜头的默认值」，而传输层过去只读 `shots` 与 `draftId`——顶层那两个字段
 * 被整只丢掉，且**不报任何错**：模型说「这三镜都用 apimart 的 image-1 出图」，宿主照用户的默认模型跑。
 * 一次花钱的调用用错模型而没有人被告知，比被拒收更糟。逐镜自己写的值永远优先。
 */
function withDraftDefaults(shot: Args, defaults: { taskKind?: string; candidate?: { providerId?: string; modelId?: string } }): Args {
  const candidate = shot.candidate ?? defaults.candidate
  return {
    ...shot,
    ...(shot.taskKind === undefined && defaults.taskKind !== undefined ? { taskKind: defaults.taskKind } : {}),
    ...(candidate !== undefined ? { candidate } : {}),
  }
}

/**
 * 把一个延迟组动词调用翻成传输层调用。返回 `undefined` = 这个动词不走延迟组（常驻工具自己绑执行）。
 * 参数在这里**只改形状不改语义**：schema 已由 pi 的 ajv 验过。
 */
export function verbToTransportCall(call: RuntimeToolCall): VerbTransportCall | undefined {
  const args = (call.args && typeof call.args === 'object' ? call.args : {}) as Args
  const base = { toolCallId: call.toolCallId }
  switch (call.toolName) {
    case 'draft_shots': {
      const defaults = {
        ...(typeof args.taskKind === 'string' ? { taskKind: args.taskKind } : {}),
        ...(args.candidate && typeof args.candidate === 'object' ? { candidate: args.candidate as { providerId?: string; modelId?: string } } : {}),
      }
      const shots = (Array.isArray(args.shots) ? args.shots : []).map((shot) => withDraftDefaults(shot as Args, defaults))
      const draftId = typeof args.draftId === 'string' ? args.draftId : undefined
      if (draftId) {
        // 修改已有草稿：单镜草稿按顶层候选 patch（多镜按 shotId 的 patch 不在本刀，返回值会说清）。
        const first = shots[0] ?? {}
        const { shotId: _shotId, role: _role, ...rest } = draftShotToPlanShot(first)
        return generationCall(base, GENERATION_METHODS.plan, { operation: 'patch', operationId: draftId, patch: rest })
      }
      // 草稿建即落画布、带单价角标，但报价卡先藏着（`cardHidden`）——出卡是 `generate` 的事，不是建草稿的副作用。
      if (shots.length === 1 && !shots[0]?.role && !shots[0]?.title) {
        // 单镜：走单镜 create（宿主从 prompt/taskKind 合成候选），与「一句话生成一张图」同一条路。
        // **带 role 或 title 的不走这条**：这两个都是镜头**信封**上的字段（给人看/排序用，不进 provider
        // 请求），而单镜路把镜头摊平成顶层参数、顶层没有它们的位置。摊平就只能悄悄丢掉——
        // 那正是 2026-09-18 这一整条链的病根。`role` 本来就这么判，`title` 照同一条规则。
        // `shotId` 也不再在这里摘：动词自己保证「没有 draftId 就不许带 shotId」，带了的那次走上面的
        // patch 分支。摘掉它同样是静默丢字段（模型以为在改 shot-3，实际新建了一份草稿）。
        return generationCall(base, GENERATION_METHODS.plan, { operation: 'create', ...draftShotToPlanShot(shots[0]!), cardHidden: true })
      }
      return generationCall(base, GENERATION_METHODS.plan, { operation: 'create', shots: shots.map(draftShotToPlanShot), cardHidden: true })
    }
    case 'generate':
      return generationCall(base, GENERATION_METHODS.plan, { operation: 'present', operationId: args.draftId, ...(args.shotIds ? { shotIds: args.shotIds } : {}) })
    case 'check_job':
      return generationCall(base, GENERATION_METHODS.status, { operation: 'read', operationId: args.jobId })
    case 'cancel_job':
      return generationCall(base, GENERATION_METHODS.status, { operation: 'cancel', operationId: args.jobId })
    case 'look_at_media': {
      // 五合一读 → 契约五个方法之一（`assetReadInputOf`，与对外 MCP 同一张表）；方法名就是 phase4 读适配器认的别名。
      const { operation, ...methodArgs } = assetReadInputOf(args) as { operation: string } & Args
      return { lane: 'media', call: { ...base, toolName: operation, args: methodArgs } }
    }
    case 'edit_timeline': {
      const { revision, ...plan } = args as { revision: string } & Args
      return { lane: 'timeline', call: { ...base, toolName: TIMELINE_WRITE_ALIASES.applyPlan, args: { planId: `plan-${call.toolCallId}`, baseRevision: revision, ...plan } } }
    }
    case 'undo':
      return { lane: 'timeline', call: { ...base, toolName: TIMELINE_WRITE_ALIASES.undo, args: { undoToken: args.changeId, expectedRevision: args.expectedRevision } } }
    case 'delete_from_canvas':
      return { lane: 'canvas', call: { ...base, toolName: CANVAS_DELETE_ALIAS, args } }
    case 'export_video':
      return { lane: 'export', call: { ...base, toolName: EXPORT_WRITE_ALIASES.start, args } }
    case 'read_skill':
      return { lane: 'skillRead', call: { ...base, toolName: SKILL_READ_ALIASES.load, args: { name: args.name } } }
    case 'save_skill':
      return { lane: 'skillWrite', call: { ...base, toolName: SKILL_WRITE_ALIASES.author, args } }
    // `start_model_setup` 不在这里：它是**常驻**动词（没有 `internalGroup`），执行绑在 `laneDesktopTools`，
    // 永远不经延迟组这条路。这里曾经有一条 `modelSetup` 分支——`laneExtendedDesktopPorts` 没有对应的
    // 适配器分支，真走到它只会掉进 direct → 生成适配器 → `generation_surface_unavailable`。
    // 一条永远不会被调用、被调用就一定错的分支不是保险，是并行版（P1），所以删掉。
    default:
      return undefined
  }
}

/** `check_job` / `cancel_job` 的导出那一半：生成域说「不认识这个 id」时再问导出域。 */
export function exportJobTransportCall(call: RuntimeToolCall): RuntimeToolCall {
  const args = (call.args && typeof call.args === 'object' ? call.args : {}) as Args
  return {
    toolCallId: call.toolCallId,
    toolName: call.toolName === 'cancel_job' ? EXPORT_WRITE_ALIASES.cancel : EXPORT_READ_ALIASES.inspect,
    args: { jobId: args.jobId },
  }
}
