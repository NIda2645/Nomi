// Agent lane · 延迟组动词 → 传输层方法调用。**这个文件不再手写任何字段名单。**
//
// 对应关系住在 `verbTransportRoutes.ts`（一张数据表，源/目标名单都从各自的 schema 取）；这里只剩下
// 两样真正的逻辑：走哪条 lane / 哪个方法，以及 `draft_shots` 那三支的分支判断（改草稿 / 单镜摊平 /
// 多镜）。字段怎么落位由 `projectByFieldMap` 执行那张表。
//
// 为什么这么改（2026-09-18，用户原话「该有两遍，不该有四遍」）：一个能力原本被重述四遍——动词声明、
// 这里的翻译、契约 schema、handler 及下游投影。头两遍该有（模型要对它友好的形状，宿主要内部形状，而且
// 宿主那道校验是跨进程 + 花钱闸的准入规定，必须继续独立跑）。这一遍不该手写：它承载的全部信息就是
// 前两遍之间的对应关系。手写它的代价当天量到过两次——`durationSec` 被改名成宿主没有的顶层字段（整条
// 拒收），平铺的模型字段与逐镜 `candidate.providerId/modelId` 压根没被列进解构（**静默**丢掉，模型点名的
// 模型被换成用户默认的那个去花钱）。这两种病因是同一个：对应关系只活在一段手写代码里，没有东西能核对
// 它完不完整、指向的宿主字段存不存在。
//
// 方法名同样不手写：生成域取自 `GENERATION_METHODS`（字面量类型，改名少一边就是 tsc 红），其余取自
// 各契约导出的别名表。`laneVerbTransport.test.ts` 再真跑一遍每个动词翻出的方法能不能被目标适配器认。
import type { RuntimeToolCall } from '../shared/agentCapabilities/transportContracts'
import { GENERATION_METHODS, type GenerationMethodName } from '../shared/agentCapabilities/generation'
import { TIMELINE_WRITE_ALIASES } from '../shared/agentCapabilities/timelineWrite'
import { EXPORT_READ_ALIASES, EXPORT_WRITE_ALIASES } from '../shared/agentCapabilities/exportCapabilities'
import { CANVAS_DELETE_ALIAS } from '../shared/agentCapabilities/canvasDelete'
import { SKILL_READ_ALIASES } from '../shared/agentCapabilities/skillRead'
import { SKILL_WRITE_ALIASES } from '../shared/agentCapabilities/skillWrite'
import { assetReadInputOf } from '../shared/agentCapabilities/verbs/verbSemanticInput'
import { cancelJobHostArgs, cancelJobModelSchema, type CancelJobModelArgs } from '../shared/agentCapabilities/verbs/cancelJobProjection'
import { applyDefaultsByFieldMap, projectByFieldMap } from '../shared/agentCapabilities/verbs/verbFieldMap'
import { DRAFT_SHOTS_FIELD_MAP, DRAFT_SHOT_FIELD_MAP, EXPORT_JOB_ROUTES, SIMPLE_VERB_ROUTES } from './verbTransportRoutes'

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
 * 参考素材那一档的补全器（表里 `references` 声明成 `resolved`，落点的形状变化由这里执行）。
 * 只做 assetId → 宿主认的引用外壳；内容哈希与版本由宿主按项目素材库钉——模型拿不到它们。
 */
const DRAFT_SHOT_RESOLVERS = Object.freeze({
  references: (value: unknown): unknown =>
    (Array.isArray(value) ? value.map((assetId) => ({ assetId })) : value),
})

/** 一镜 → 宿主的一镜。字段全部由 `DRAFT_SHOT_FIELD_MAP` 落位，这里不出现任何字段名。 */
function draftShotToPlanShot(shot: Args, target: 'shot' | 'patch' | 'flat'): Args {
  return projectByFieldMap(shot, DRAFT_SHOT_FIELD_MAP, target, DRAFT_SHOT_RESOLVERS)
}

/** 纯对应关系的动词：执行它自己那张表。字段名一个都不出现在这个文件里。 */
function routed(verb: keyof typeof SIMPLE_VERB_ROUTES, args: Args): Args {
  const route = SIMPLE_VERB_ROUTES[verb]!
  return projectByFieldMap(args, route.map, route.target)
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
      // 顶层缺省折进每一镜（哪些字段算缺省、折进哪个数组，由表上的 `defaults` 声明）。
      const shots = (Array.isArray(args.shots) ? args.shots : [])
        .map((shot) => applyDefaultsByFieldMap(args, DRAFT_SHOTS_FIELD_MAP, shot as Args))
      // 分支判断是真逻辑（改草稿 / 单镜摊平 / 多镜），不是字段名单——它留在代码里。
      const operationId = typeof args.operationId === 'string' ? args.operationId : undefined
      if (operationId) {
        // 修改已有草稿：单镜草稿按顶层候选 patch（多镜按 shotId 的 patch 不在本刀，返回值会说清）。
        // 信封字段落不进候选 patch，这一条写在表的 `absentOn.patch` 里，不在这里摘。
        const patch = draftShotToPlanShot(shots[0] ?? {}, 'patch')
        return generationCall(base, GENERATION_METHODS.plan, {
          ...projectByFieldMap(args, DRAFT_SHOTS_FIELD_MAP, 'patch'), operation: 'patch', patch,
        })
      }
      // 草稿建即落画布、带单价角标，但报价卡先藏着（`cardHidden`）——出卡是 `generate` 的事，不是建草稿的副作用。
      if (shots.length === 1 && !shots[0]?.role && !shots[0]?.title) {
        // 单镜：走单镜 create（宿主从 prompt/taskKind 合成候选），与「一句话生成一张图」同一条路。
        // **带 role 或 title 的不走这条**：这两个都是镜头信封上的字段，而顶层没有它们的位置
        // （表的 `absentOn.flat` 就是这句话的机器版）。摊平就只能悄悄丢掉——那正是这一整条链的病根。
        return generationCall(base, GENERATION_METHODS.plan, {
          operation: 'create', ...draftShotToPlanShot(shots[0]!, 'flat'), cardHidden: true,
        })
      }
      return generationCall(base, GENERATION_METHODS.plan, {
        operation: 'create', shots: shots.map((shot) => draftShotToPlanShot(shot, 'shot')), cardHidden: true,
      })
    }
    case 'generate':
      return generationCall(base, GENERATION_METHODS.plan, { operation: 'present', ...routed('generate', args) })
    case 'check_job':
      return generationCall(base, GENERATION_METHODS.status, { operation: 'read', ...routed('check_job', args) })
    case 'cancel_job':
      return generationCall(base, GENERATION_METHODS.status, { operation: 'cancel', ...routed('cancel_job', args) })
    case 'look_at_media': {
      // 五合一读 → 契约五个方法之一（`assetReadInputOf`，与对外 MCP 同一张表）；方法名就是 phase4 读适配器认的别名。
      const { operation, ...methodArgs } = assetReadInputOf(args) as { operation: string } & Args
      return { lane: 'media', call: { ...base, toolName: operation, args: methodArgs } }
    }
    case 'edit_timeline':
      // `planId` 是这一次调用派生的（宿主按它做幂等），不是模型填的——所以它是信封，不是对应关系。
      return { lane: 'timeline', call: { ...base, toolName: TIMELINE_WRITE_ALIASES.applyPlan, args: { planId: `plan-${call.toolCallId}`, ...routed('edit_timeline', args) } } }
    case 'undo':
      return { lane: 'timeline', call: { ...base, toolName: TIMELINE_WRITE_ALIASES.undo, args: routed('undo', args) } }
    case 'delete_from_canvas':
      return { lane: 'canvas', call: { ...base, toolName: CANVAS_DELETE_ALIAS, args: routed('delete_from_canvas', args) } }
    case 'export_video':
      return { lane: 'export', call: { ...base, toolName: EXPORT_WRITE_ALIASES.start, args: routed('export_video', args) } }
    case 'read_skill':
      return { lane: 'skillRead', call: { ...base, toolName: SKILL_READ_ALIASES.load, args: routed('read_skill', args) } }
    case 'save_skill':
      return { lane: 'skillWrite', call: { ...base, toolName: SKILL_WRITE_ALIASES.author, args: routed('save_skill', args) } }
    // `start_model_setup` 不在这里：它是**常驻**动词（没有 `internalGroup`），执行绑在 `laneDesktopTools`，
    // 永远不经延迟组这条路。这里曾经有一条 `modelSetup` 分支——`laneExtendedDesktopPorts` 没有对应的
    // 适配器分支，真走到它只会掉进 direct → 生成适配器 → `generation_surface_unavailable`。
    // 一条永远不会被调用、被调用就一定错的分支不是保险，是并行版（P1），所以删掉。
    default:
      return undefined
  }
}

/**
 * `check_job` / `cancel_job` 的导出那一半：生成域说「不认识这个 id」时再问导出域。
 *
 * 两条走的是两种机制，而这正是 2026-09-18 投影原型要展示的那个分叉：
 *   · `cancel_job` **走投影**——模型面就是宿主面减掉 `operation`，所以这里没有对应关系可执行，
 *     只有「补上宿主自补的那个值、重过同一份宿主 schema」（`cancelJobHostArgs`）。往下仍只递模型
 *     那一半：`operation` 由方法别名承载，`exportWriteInputForAlias` 在跨进程那一侧重新拼回来并
 *     再验一次（那道准入是花钱/不可逆闸，不删）。
 *   · `check_job` 走 `EXPORT_JOB_ROUTES` 那张表——留着当对照。
 */
export function exportJobTransportCall(call: RuntimeToolCall): RuntimeToolCall {
  const args = (call.args && typeof call.args === 'object' ? call.args : {}) as Args
  if (call.toolName === 'cancel_job') {
    const typed: RuntimeToolCall<CancelJobModelArgs> = { ...call, args: cancelJobModelSchema.parse(args) }
    // 补完重过同一份宿主 schema：这一步断言「投影 + 补值确实还原成一份合法的宿主输入」。
    const { operation: _hostFilled, ...modelHalf } = cancelJobHostArgs(typed.args)
    return { toolCallId: typed.toolCallId, toolName: EXPORT_WRITE_ALIASES.cancel, args: modelHalf }
  }
  const route = EXPORT_JOB_ROUTES[call.toolName]
  if (!route) throw new Error(`exportJobTransportCall: ${call.toolName} 没有导出域的对应关系`)
  return {
    toolCallId: call.toolCallId,
    toolName: EXPORT_READ_ALIASES.inspect,
    args: projectByFieldMap(args, route.map, route.target),
  }
}
