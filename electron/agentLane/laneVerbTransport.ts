// Agent lane · 延迟组动词 → 传输层方法调用。**这个文件不再手写任何字段名单。**
//
// **这个文件里没有一条对应关系了。** 19 个动词的模型面是各自宿主契约 schema 的投影
// （`verbs/verbProjections.ts`），字段名两边逐字相同，所以这里只剩下三样真正的逻辑：走哪条 lane /
// 哪个方法、`draft_shots` 那三支的分支判断（改草稿 / 单镜摊平 / 多镜），以及两个**双域**动词在生成域
// 那一半的唯一一条改名（`verbs/verbDualDomain.ts`，理由是两个域各有一份持久化）。
// `draft_shots` 的形状变化住在 `verbs/draftShotsProjection.ts`，那是全链仅剩的有损投影。
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
import type { z } from 'zod'

import type { RuntimeToolCall } from '../shared/agentCapabilities/transportContracts'
import { generationPlanInputSchema, generationStatusInputSchema } from '../shared/agentCapabilities/generationPlanSchemas'
import { GENERATION_METHODS, type GenerationMethodName } from '../shared/agentCapabilities/generation'
import { TIMELINE_WRITE_ALIASES } from '../shared/agentCapabilities/timelineWrite'
import { EXPORT_READ_ALIASES, EXPORT_WRITE_ALIASES } from '../shared/agentCapabilities/exportCapabilities'
import { CANVAS_DELETE_ALIAS, canvasDeletePiInputSchema } from '../shared/agentCapabilities/canvasDelete'
import { SKILL_READ_ALIASES } from '../shared/agentCapabilities/skillRead'
import { SKILL_WRITE_ALIASES } from '../shared/agentCapabilities/skillWrite'
import { assetReadInputOf } from '../shared/agentCapabilities/verbs/verbSemanticInput'
import {
  cancelJobModelSchema, checkJobModelSchema, editTimelineModelSchema, editTimelinePlanId,
  exportVideoModelSchema, generateModelSchema, readSkillModelSchema, saveSkillModelSchema,
  undoModelSchema, type CancelJobModelArgs,
} from '../shared/agentCapabilities/verbs/verbProjections'
import { cancelJobGenerationArgs, checkJobGenerationArgs } from '../shared/agentCapabilities/verbs/verbDualDomain'
import {
  draftShotsPatchEnvelope, draftShotToCandidatePatch, draftShotToFlatCreate, draftShotToPlanShot,
  withDraftShotsDefaults, type DraftShot, type DraftShotsArgs,
} from '../shared/agentCapabilities/verbs/draftShotsProjection'

type Args = Record<string, unknown>

/**
 * **生成 lane 的参数类型就是宿主那份 union 本身。**
 *
 * 2026-09-18 的交接文档把 `RuntimeToolCall.args: unknown` 叫作「整个问题的物理原因」：类型一旦抹平，
 * 两份 schema 就永远不可能在编译期对上账。原型那一刀只在 `cancel_job` 一条路上收窄，理由是当时只有
 * 那一个动词是投影。现在 19 个都是了，所以这里重新判：**生成 lane 值得收，而且收得最狠**——
 * 它是花钱那条路，载荷不是透传而是真被拼出来的（`draft_shots` 三支各拼一份），而「拼出一份宿主 union
 * 里根本没有的形状」正是 2026-09-18 C 类缺陷的定义。收窄之后那件事是 tsc 红，不是一次付费运行的失败。
 *
 * 其余五条 lane **没有一起收**，理由是如实的而不是省事：它们的载荷是投影 `.parse()` 的直接产物
 * （模型面 = 宿主面减 `operation`），中间没有任何拼装，收窄只会把同一份类型换一个名字写两遍；
 * 而 `media` 那条同时装着 `asset.read` 五支与 `export.read` 两支，一个联合类型在这里表达不出
 * 「哪个动词走哪一支」——那条要等 `look_at_media` 也变成投影（今天它是**构造**，见
 * `verbSemanticInput.assetReadInputOf`）。
 */
type GenerationTransportArgs =
  | z.infer<typeof generationPlanInputSchema>
  | z.infer<typeof generationStatusInputSchema>

/** 一次翻译的结果：走哪条传输、方法名与方法参数。生成 lane 的方法名与**参数形状**都按宿主收窄。 */
export type VerbTransportCall =
  | Readonly<{ lane: 'generation'; call: RuntimeToolCall<GenerationTransportArgs> & { toolName: GenerationMethodName } }>
  | Readonly<{ lane: 'timeline' | 'canvas' | 'export' | 'media' | 'skillRead' | 'skillWrite'; call: RuntimeToolCall }>

/** 生成 lane 的一次调用：`toolName` 只能是 `GENERATION_METHODS` 里的名字，`args` 只能是宿主认的那几支。 */
function generationCall(base: { toolCallId: string }, toolName: GenerationMethodName, args: GenerationTransportArgs): VerbTransportCall {
  return { lane: 'generation', call: { ...base, toolName, args } }
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
      // 唯一**结构有损**的那个动词：三处形状真的变了（嵌套层级 / 拍平 / 参考素材的身份由宿主补），
      // 投影里故意没有「改形状」这个动作，所以它有自己的显式变换（`draftShotsProjection.ts`）。
      const draft = { ...args, shots: Array.isArray(args.shots) ? args.shots : [] } as unknown as DraftShotsArgs
      // 顶层缺省折进每一镜；逐镜自己写的优先。
      const shots = draft.shots.map((shot) => withDraftShotsDefaults(draft, shot))
      // 分支判断是真逻辑（改草稿 / 单镜摊平 / 多镜），不是字段名单——它留在这里。
      if (draft.operationId !== undefined) {
        // 修改已有草稿：单镜草稿按顶层候选 patch（多镜按 shotId 的 patch 不在本刀，返回值会说清）。
        // 信封字段落不进候选 patch，`draftShotToCandidatePatch` 当场拒绝，不在这里摘。
        const patch = draftShotToCandidatePatch(shots[0] ?? ({} as DraftShot))
        return generationCall(base, GENERATION_METHODS.plan, {
          ...draftShotsPatchEnvelope(draft), operation: 'patch', patch,
        })
      }
      // 草稿建即落画布、带单价角标，但报价卡先藏着（`cardHidden`）——出卡是 `generate` 的事，不是建草稿的副作用。
      if (shots.length === 1 && !shots[0]?.role && !shots[0]?.title) {
        // 单镜：走单镜 create（宿主从 prompt/taskKind 合成候选），与「一句话生成一张图」同一条路。
        // **带 role 或 title 的不走这条**：这两个都是镜头信封上的字段，而顶层没有它们的位置。
        // 摊平就只能悄悄丢掉——那正是这一整条链的病根。
        return generationCall(base, GENERATION_METHODS.plan, {
          operation: 'create', ...draftShotToFlatCreate(shots[0]!), cardHidden: true,
        })
      }
      return generationCall(base, GENERATION_METHODS.plan, {
        operation: 'create', shots: shots.map(draftShotToPlanShot), cardHidden: true,
      })
    }
    case 'generate':
      // 投影：模型面就是 `present` 分支减掉 `operation`，字段名逐字相同。
      return generationCall(base, GENERATION_METHODS.plan, { operation: 'present', ...generateModelSchema.parse(args) })
    // 两个**双域**动词的生成域那一半：模型面的 `jobId` 在这边落到 `operationId` 上。这是整条链上仅剩的
    // 一条改名，理由是领域约束（两个域各有一份持久化，各用各的目录名），写在 `verbDualDomain.ts`。
    case 'check_job':
      return generationCall(base, GENERATION_METHODS.status, { operation: 'read', ...checkJobGenerationArgs(checkJobModelSchema.parse(args)) })
    case 'cancel_job':
      return generationCall(base, GENERATION_METHODS.status, { operation: 'cancel', ...cancelJobGenerationArgs(cancelJobModelSchema.parse(args)) })
    case 'look_at_media': {
      // 五合一读 → 契约五个方法之一（`assetReadInputOf`，与对外 MCP 同一张表）；方法名就是 phase4 读适配器认的别名。
      const { operation, ...methodArgs } = assetReadInputOf(args) as { operation: string } & Args
      return { lane: 'media', call: { ...base, toolName: operation, args: methodArgs } }
    }
    case 'edit_timeline':
      // `planId` 是这一次调用派生的幂等键（宿主按它做幂等），模型给不出——它和 `operation` 一起是这条
      // 投影的 fill；算法只有 `editTimelinePlanId` 一处。
      return { lane: 'timeline', call: { ...base, toolName: TIMELINE_WRITE_ALIASES.applyPlan, args: { planId: editTimelinePlanId(call.toolCallId), ...editTimelineModelSchema.parse(args) } } }
    case 'undo':
      return { lane: 'timeline', call: { ...base, toolName: TIMELINE_WRITE_ALIASES.undo, args: undoModelSchema.parse(args) } }
    // 下面三条都是投影：模型面就是各自宿主面减掉 `operation`，字段名逐字相同，没有可执行的对应关系。
    case 'delete_from_canvas':
      return { lane: 'canvas', call: { ...base, toolName: CANVAS_DELETE_ALIAS, args: canvasDeletePiInputSchema.parse(args) } }
    case 'export_video':
      return { lane: 'export', call: { ...base, toolName: EXPORT_WRITE_ALIASES.start, args: exportVideoModelSchema.parse(args) } }
    case 'read_skill':
      // 投影：模型面就是 `skill.read` 宿主面减掉 `operation` 与 `expectedContentHash`，字段名逐字相同，
      // 没有可执行的对应关系。只剩「按派生出来的那份 schema 把参数收成有类型的」。
      return { lane: 'skillRead', call: { ...base, toolName: SKILL_READ_ALIASES.load, args: readSkillModelSchema.parse(args) } }
    case 'save_skill':
      return { lane: 'skillWrite', call: { ...base, toolName: SKILL_WRITE_ALIASES.author, args: saveSkillModelSchema.parse(args) } }
    // `start_model_setup` 不在这里：它是**常驻**动词（没有 `internalGroup`），执行绑在 `laneDesktopTools`，
    // 永远不经延迟组这条路。这里曾经有一条 `modelSetup` 分支——`laneExtendedDesktopPorts` 没有对应的
    // 适配器分支，真走到它只会掉进 direct → 生成适配器 → `generation_surface_unavailable`。
    // 一条永远不会被调用、被调用就一定错的分支不是保险，是并行版（P1），所以删掉。
    default:
      return undefined
  }
}

/**
 * `cancel_job` 的导出那一支（2026-09-18 投影原型）。**这里没有对应关系可执行**：模型面就是宿主面
 * 减掉 `operation`，字段名两边逐字相同。所以只剩一件事——把模型那一份按**派生出来的**那份 schema
 * 收成有类型的参数。宿主自补的 `operation` 由方法别名承载，`exportWriteInputForAlias` 在跨进程那一侧
 * 补上它并重过同一份宿主 schema（那道准入是花钱/不可逆闸，不删；也不在这边再做一遍——同一件事两份
 * 实现就是 P1 说的并行版）。返回类型带上推断出来的参数类型，`RuntimeToolCall<TArgs>` 的收窄从这里起步。
 */
function cancelJobExportCall(call: RuntimeToolCall): RuntimeToolCall<CancelJobModelArgs> {
  return { toolCallId: call.toolCallId, toolName: EXPORT_WRITE_ALIASES.cancel, args: cancelJobModelSchema.parse(call.args) }
}

/**
 * `check_job` / `cancel_job` 的导出那一半：生成域说「不认识这个 id」时再问导出域。
 *
 * 两条都是投影，所以这里没有任何对应关系可执行——只剩「按派生出来的那份 schema 把参数收成有类型的」。
 * 宿主自补的 `operation` 由方法别名承载，`export*InputForAlias` 在跨进程那一侧补上它并重过同一份宿主
 * schema（那道准入是花钱/不可逆闸，不删；也不在这边再做一遍——同一件事两份实现就是 P1 说的并行版）。
 */
export function exportJobTransportCall(call: RuntimeToolCall): RuntimeToolCall {
  if (call.toolName === 'cancel_job') return cancelJobExportCall(call)
  if (call.toolName !== 'check_job') throw new Error(`exportJobTransportCall: ${call.toolName} 不是双域动词`)
  return {
    toolCallId: call.toolCallId,
    toolName: EXPORT_READ_ALIASES.inspect,
    args: checkJobModelSchema.parse(call.args),
  }
}
