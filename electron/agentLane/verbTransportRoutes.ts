// 延迟组动词 → 传输层调用的**对应关系**，作为数据。翻译函数从这里生成（`laneVerbTransport.ts`）。
//
// 用户的原话是「该有两遍，不该有四遍」。该有的两遍是：动词声明（模型看的，`modelKey` / `durationSec`）
// 与契约 schema（宿主收的，`modelId` / `parameters.duration`，且它是跨进程 + 花钱闸那一侧的准入规定，
// 必须继续独立校验）。这个文件是把**第三遍**——手写的翻译——变成前两遍之间的一张对应表。
//
// 名单一个都不许手抄：源字段名单取自动词自己的 schema，目标字段名单取自宿主自己的 schema
// （`objectFieldKeys`）。所以「动词加了字段没加对应关系」「对应关系指向宿主没有的字段」两种漂移
// 在**装配期**就抛，App 起不来——而不是等真模型在下一次付费运行里用一次失败告诉你。
import { z } from 'zod'

import {
  assembleVerbFieldMap, objectFieldKeys, readProvenanceTargets, type VerbFieldMap,
} from '../shared/agentCapabilities/verbs/verbFieldMap'
import { CAPABILITY_CONTRACTS } from '../shared/agentCapabilities/registry'
import { toPublishedJsonSchema } from '../shared/agentCapabilities/modelVisibleJsonSchema'
import { generationPlanInputSchema, generationStatusInputSchema } from '../shared/agentCapabilities/generationPlanSchemas'
import { canvasDeletePiInputSchema } from '../shared/agentCapabilities/canvasDelete'
import { exportReadSemanticInputSchema, exportWriteSemanticInputSchema } from '../shared/agentCapabilities/exportCapabilities'
import { skillReadSemanticInputSchema } from '../shared/agentCapabilities/skillRead'
import { skillWriteSemanticInputSchema } from '../shared/agentCapabilities/skillWrite'
import { timelineWriteSemanticInputSchema } from '../shared/agentCapabilities/timelineWrite'
import { timelineEditPlanSchema } from '../shared/agentCapabilities/timelineRead'
import { VERB_DECLARATIONS } from '../shared/agentCapabilities/verbDeclarations'
import { draftShotSchema } from '../shared/agentCapabilities/verbs/writeVerbs'

/**
 * `from-read:<动词>.<字段>` 这一档的**机器核**：那个动词的返回里真的有这个字段吗。
 *
 * 这条治的是 R1 覆盖不到的那半边：R1 保证「宿主要的，动词告诉过模型」，但保证不了「模型拿得到那个值」。
 * 把宿主要的 `contentHash` 直接加进动词声明，R1 立刻绿——而模型还是拿不到，因为没有任何读动词返回它，
 * 工具照样 100% 不可用，且没有任何东西会红。这条就是那个红。
 */
function outputFieldNames(verb: string): ReadonlySet<string> | undefined {
  const declaration = VERB_DECLARATIONS.find((item) => item.name === verb)
  if (!declaration) throw new Error(`verbTransportRoutes: 来源里写了不存在的动词 "${verb}"`)
  const contract = CAPABILITY_CONTRACTS.find((item) => item.id === declaration.contractId)
  if (!contract) throw new Error(`verbTransportRoutes: ${verb} 落在一个没注册的能力上`)
  const names = new Set<string>()
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.properties && typeof record.properties === 'object') {
      for (const [key, child] of Object.entries(record.properties as Record<string, unknown>)) { names.add(key); walk(child) }
    }
    for (const key of ['items', 'additionalProperties']) walk(record[key])
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      const branches = record[key]
      if (Array.isArray(branches)) for (const branch of branches) walk(branch)
    }
    for (const key of ['definitions', '$defs']) {
      const bucket = record[key]
      if (bucket && typeof bucket === 'object') for (const child of Object.values(bucket as Record<string, unknown>)) walk(child)
    }
  }
  try { walk(toPublishedJsonSchema(contract.outputSchema)) } catch { return undefined }
  // 没有任何属性 = 这个动词的**返回形状根本没声明**（`z.unknown()`）。那不是「字段不在里面」，
  // 是「这里没有可核对的东西」——两种红要分开说，否则人会以为改个字段名就能糊弄过去。
  return names.size > 0 ? names : undefined
}

/**
 * 返回形状**没有声明**的动词。指向它们的来源声明今天核不动——这不是豁免，是一份下一轮要查的清单：
 * 把这些动词的 `outputSchema` 从 `z.unknown()` 收成真形状，这里就能删掉一条，核对随之生效。
 * 不许往这份清单里加「字段不在返回里」的那种情况——那一种没有出口，只能改设计。
 */
export const PROVENANCE_UNVERIFIABLE: Readonly<Record<string, string>> = Object.freeze({
  list_models: 'generation.context.read 的 outputSchema 是 z.unknown()；真形状在 availableModelsSchema.agentModelEntrySchema，但契约上没声明，所以核不动',
  draft_shots: 'generation.plan 的 outputSchema 是 z.unknown()；草稿 id（operation.operationId）与每镜的 shotId（operation.shots[].shotId）确实都在它的返回里，契约没声明',
  generate: '同上，同一个 generation.plan 契约',
  edit_timeline: 'timeline.write 的返回形状没声明到字段级',
  export_video: 'export.write 的返回形状没声明到字段级',
})

function assertProvenanceResolvable(map: VerbFieldMap): VerbFieldMap {
  for (const [source, relation] of Object.entries(map.relations)) {
    for (const { verb, field } of readProvenanceTargets(relation)) {
      const names = outputFieldNames(verb)
      if (names === undefined) {
        if (PROVENANCE_UNVERIFIABLE[verb]) continue
        throw new Error(`${map.label}: "${source}" 说它来自 ${verb} 的返回，但 ${verb} 的返回形状没有声明，核不动。`
          + '要么把那个能力的 outputSchema 收成真形状，要么在 PROVENANCE_UNVERIFIABLE 里具名登记并写清为什么。')
      }
      if (!names.has(field)) {
        throw new Error(`${map.label}: "${source}" 说它来自 ${verb} 的返回里的 "${field}"，但 ${verb} **不返回**这个字段。`
          + '模型因此根本拿不到这个值——这不是模型的问题，是设计错了：要么换一个真的会返回它的读动词，'
          + '要么改成 host-resolved（宿主自己解析，不问模型）。')
      }
    }
  }
  return map
}

/** 一个动词的源字段名单——从**它自己的声明**取，不在这里重列一遍。 */
function verbKeys(name: string): readonly string[] {
  const declaration = VERB_DECLARATIONS.find((verb) => verb.name === name)
  if (!declaration) throw new Error(`verbTransportRoutes: 没有名为 ${name} 的动词声明`)
  return objectFieldKeys(declaration.schema, `verb ${name}`)
}

const planCreateKeys = objectFieldKeys(generationPlanInputSchema.options[1], 'generation plan create')
const planPatchKeys = objectFieldKeys(generationPlanInputSchema.options[2], 'generation plan patch')
const planPresentKeys = objectFieldKeys(generationPlanInputSchema.options[4], 'generation plan present')
const planShotKeys = objectFieldKeys(
  (generationPlanInputSchema.options[1] as unknown as { shape: Record<string, z.ZodTypeAny> }).shape.shots!,
  'generation plan shot',
)
const candidatePatchKeys = objectFieldKeys(
  (generationPlanInputSchema.options[2] as unknown as { shape: Record<string, z.ZodTypeAny> }).shape.patch!,
  'generation candidate patch',
)
const statusKeys = objectFieldKeys(generationStatusInputSchema.options[0], 'generation status')
const undoKeys = objectFieldKeys(timelineWriteSemanticInputSchema.options[1], 'timeline undo')
const applyPlanKeys = objectFieldKeys(timelineEditPlanSchema, 'timeline edit plan')
const exportStartKeys = objectFieldKeys(exportWriteSemanticInputSchema.options[0], 'export start')
const exportJobKeys = objectFieldKeys(exportReadSemanticInputSchema.options[0], 'export job')
const canvasDeleteKeys = objectFieldKeys(canvasDeletePiInputSchema, 'canvas delete')
const skillReadKeys = objectFieldKeys(skillReadSemanticInputSchema, 'skill read')
const skillWriteKeys = objectFieldKeys(skillWriteSemanticInputSchema, 'skill write')

/**
 * 信封字段在这两个形状上没有位置。**处置必须逐条写明**，因为「送不到」与「可以丢」长得一模一样：
 *   · `title` / `role` → `refuse`：模型填了它就是想让它生效，这条路送不到就当场说，别让它无声消失；
 *   · `shotId` → `lift`：带 draftId 时模型用它指哪一镜。它不是候选字段，是 plan patch **信封**上的寻址字段
 *     （宿主按它只改那一镜的候选，revision +1，已落的节点按它重绑定；缺省 = 单镜草稿的顶层候选）。
 *     2026-09-18 之前这里写的是 `drop`（「多镜逐镜 patch 还没做」）——于是「改第 2 镜」永远改的是顶层候选，
 *     用户在画布上什么都看不到；单一账本那一刀把这扇门开通，处置随之改成 lift。
 */
const REFUSE_ON_PATCH = '改草稿递给宿主的是候选 patch（提示词/模型/参数/参考），信封不在那份形状里'
const REFUSE_ON_FLAT = '单镜 create 把这一镜摊成顶层参数，顶层没有信封的位置'
const ENVELOPE_REFUSED = Object.freeze({
  patch: Object.freeze({ disposition: 'refuse' as const, why: REFUSE_ON_PATCH }),
  flat: Object.freeze({ disposition: 'refuse' as const, why: REFUSE_ON_FLAT }),
})
const SHOT_ID_ABSENT = Object.freeze({
  patch: Object.freeze({ disposition: 'lift' as const, to: 'shotId', why: '它是寻址不是候选：指哪一镜，落在 plan patch 的信封上；宿主据它只改那一镜的候选' }),
  flat: Object.freeze({ disposition: 'refuse' as const, why: REFUSE_ON_FLAT }),
})

/**
 * `draft_shots` 的一镜 → 宿主的一镜。今天挖到的每一处缺陷都在这张表里有一行：
 *   · `durationSec → parameters.duration`（曾被改名成宿主没有的顶层 `durationSeconds`，整条拒收）
 *   · `modelKey → modelId` 与 `candidate.modelId → modelId`（两条抢同一个落点，优先级是**声明**出来的）
 *   · `candidate` 的两个子字段（曾整只不在解构里 = 静默丢，模型点名的模型被换成用户默认的那个）
 *   · `references` 是**有损**那一档：形状变了，身份由宿主补，显式标成 `resolved` 而不是同名透传
 */
export const DRAFT_SHOT_FIELD_MAP: VerbFieldMap = assertProvenanceResolvable(assembleVerbFieldMap({
  label: 'draft_shots.shots[] → generation plan shot',
  sourceKeys: objectFieldKeys(draftShotSchema, 'draftShotSchema'),
  targets: { shot: planShotKeys, patch: candidatePatchKeys, flat: planCreateKeys },
  relations: {
    prompt: { kind: 'same', from: ['model-authored'] },
    taskKind: { kind: 'same', from: ['model-authored'] },
    parameters: { kind: 'same', from: ['from-read:list_models.params'] },
    modeId: { kind: 'same', from: ['from-read:list_models.modeId'] },
    // 来源是 `draft_shots` 自己的返回（operation.shots[].shotId），**不是** look_at_canvas 的节点 id——
    // 宿主按 shot.shotId 找镜，节点 id 递进去只会得到 "Generation shot not found"。
    shotId: { kind: 'same', from: ['from-read:draft_shots.shotId'], absentOn: SHOT_ID_ABSENT },
    role: { kind: 'same', from: ['model-authored'], absentOn: ENVELOPE_REFUSED },
    title: { kind: 'same', from: ['model-authored'], absentOn: ENVELOPE_REFUSED },
    durationSec: {
      kind: 'rename', to: 'parameters.duration', from: ['model-authored'],
      why: '宿主读时长只有一处（mcpGenerationVideoResolve.shotDurationSeconds 认 parameters.duration），顶层没有时长字段',
    },
    modelKey: { kind: 'rename', to: 'modelId', from: ['from-read:list_models.modelKey'], why: '模型面叫 modelKey，宿主面叫 modelId', priority: 1 },
    candidate: {
      kind: 'expanded', into: ['candidate.providerId', 'candidate.modelId'],
      why: '宿主的逐镜 candidate 是完整的内部候选（candidateId/revision/传输接线），模型给不出；它给的两件按目录身份分别落位',
    },
    'candidate.providerId': { kind: 'rename', to: 'providerId', from: ['from-read:list_models.vendor'], why: '模型按目录点名的供应商' },
    'candidate.modelId': { kind: 'rename', to: 'modelId', from: ['from-read:list_models.modelKey'], why: '模型按目录点名的模型，优先于 modelKey', priority: 2 },
    references: {
      kind: 'resolved', to: 'references',
      // 两档都真：assetId 是模型从 look_at_media 拿的，内容哈希与版本由宿主补。
      // 把它写成 from-read:<某个读动词>.contentHash 会当场红——没有任何读动词返回那个字段。
      from: ['from-read:look_at_media.assetId', 'host-resolved'],
      by: 'assetId 串 → {assetId}；contentHash 与 version 由宿主按项目素材库补（resolveProjectAssetReferenceIdentity）',
      why: '两个读动词都不返回内容哈希与版本，模型根本拿不到它们——当年正是硬要它给，才让带参考图的分镜 100% 失败',
    },
  },
}))

/** `draft_shots` 顶层：两个缺省折进每一镜，`draftId` 选分支并翻成 `operationId`。 */
export const DRAFT_SHOTS_FIELD_MAP: VerbFieldMap = assertProvenanceResolvable(assembleVerbFieldMap({
  label: 'draft_shots → generation plan',
  sourceKeys: verbKeys('draft_shots'),
  targets: { patch: planPatchKeys, create: planCreateKeys },
  relations: {
    draftId: {
      kind: 'rename', to: 'operationId', from: ['from-read:draft_shots.operationId'],
      why: '草稿 id 是宿主发的 operationId；在场即改草稿，缺省即新建',
      absentOn: { create: { disposition: 'drop', why: '新建时还没有草稿，operationId 由宿主发——走到 create 分支就说明模型没给 draftId' } },
    },
    taskKind: { kind: 'defaults', into: 'shots', from: ['model-authored'], why: '这一批镜头的缺省任务类型；逐镜自己写的优先' },
    candidate: { kind: 'defaults', into: 'shots', from: ['from-read:list_models.modelKey'], why: '这一批镜头的缺省目录身份；逐镜自己写的优先' },
    shots: { kind: 'elements', map: DRAFT_SHOT_FIELD_MAP, why: '逐镜按上面那张表翻' },
  },
}))

/** 一条纯对应关系的路线：目标形状固定，字段全由表生成。 */
export type SimpleVerbRoute = Readonly<{ map: VerbFieldMap; target: string }>

const simple = (label: string, verb: string, target: string, targetKeys: readonly string[],
  relations: Parameters<typeof assembleVerbFieldMap>[0]['relations']): SimpleVerbRoute => ({
  map: assertProvenanceResolvable(assembleVerbFieldMap({ label, sourceKeys: verbKeys(verb), targets: { [target]: targetKeys }, relations })),
  target,
})

/**
 * 其余延迟组动词。它们的翻译**本来就只是对应关系**，所以一条不落地全放进表里——
 * 一个只覆盖 `draft_shots` 的机制会在下一个动词上原样复发。
 */
export const SIMPLE_VERB_ROUTES: Readonly<Record<string, SimpleVerbRoute>> = Object.freeze({
  generate: simple('generate → generation plan present', 'generate', 'present', planPresentKeys, {
    draftId: { kind: 'rename', to: 'operationId', from: ['from-read:draft_shots.operationId'], why: '草稿 id 在宿主面是 operationId' },
    shotIds: { kind: 'same', from: ['from-read:look_at_canvas.id'] },
  }),
  check_job: simple('check_job → generation status read', 'check_job', 'status', statusKeys, {
    jobId: { kind: 'rename', to: 'operationId', from: ['from-read:generate.jobId'], why: '模型面叫 jobId，生成域的同一件东西叫 operationId' },
  }),
  cancel_job: simple('cancel_job → generation status cancel', 'cancel_job', 'status', statusKeys, {
    jobId: { kind: 'rename', to: 'operationId', from: ['from-read:generate.jobId'], why: '同 check_job' },
  }),
  undo: simple('undo → timeline undo', 'undo', 'undo', undoKeys, {
    // 契约声明的返回字段叫 `undoToken`；模型看到的是 `changeId`，因为 lane 在
    // `laneExtendedTools.ts` 的 nextAction 投影里把它改了名。来源要指向**契约声明的那个字段**，
    // 否则这条核不动——第一次写成 changeId 时门岗当场红，那正是它该红的地方。
    changeId: { kind: 'rename', to: 'undoToken', from: ['from-read:edit_timeline.undoToken'], why: '模型拿到的是 changeId，时间轴域用它换 undoToken' },
    expectedRevision: { kind: 'same', from: ['from-read:read_timeline.revision'] },
  }),
  edit_timeline: simple('edit_timeline → timeline edit plan', 'edit_timeline', 'applyPlan', applyPlanKeys, {
    revision: { kind: 'rename', to: 'baseRevision', from: ['from-read:read_timeline.revision'], why: '模型从 read_timeline 拿到的 revision，就是这次编辑的 baseRevision' },
    summary: { kind: 'same', from: ['model-authored'] },
    operations: { kind: 'same', from: ['model-authored', 'from-read:read_timeline.clips'] },
  }),
  export_video: simple('export_video → export start', 'export_video', 'start', exportStartKeys, {
    expectedRevision: { kind: 'same', from: ['from-read:read_timeline.revision'] },
    outputName: { kind: 'same', from: ['model-authored'] },
    aspectRatio: { kind: 'same', from: ['model-authored'] },
    resolution: { kind: 'same', from: ['model-authored'] },
    quality: { kind: 'same', from: ['model-authored'] },
  }),
  delete_from_canvas: simple('delete_from_canvas → canvas delete', 'delete_from_canvas', 'delete', canvasDeleteKeys, {
    nodeIds: { kind: 'same', from: ['from-read:look_at_canvas.id'] },
    reason: { kind: 'same', from: ['model-authored'] },
  }),
  read_skill: simple('read_skill → skill read', 'read_skill', 'read', skillReadKeys, {
    // 技能名不来自任何读动词：可选技能就列在系统提示词里，模型是照着那份名单挑的。
    name: { kind: 'same', from: ['model-authored'] },
  }),
  save_skill: simple('save_skill → skill write', 'save_skill', 'write', skillWriteKeys, {
    dirName: { kind: 'same', from: ['model-authored'] },
    skillMarkdown: { kind: 'same', from: ['model-authored'] },
  }),
})

/**
 * `check_job` / `cancel_job` 的**导出那一半**：生成域说「不认识这个 id」时再问导出域。
 * 同一个动词对两个域各有一张表——这不是重复，是两个域各自的词表，而且两张都被各自的 schema 核过。
 */
export const EXPORT_JOB_ROUTES: Readonly<Record<string, SimpleVerbRoute>> = Object.freeze({
  check_job: simple('check_job → export job inspect', 'check_job', 'job', exportJobKeys, { jobId: { kind: 'same', from: ['from-read:export_video.jobId'] } }),
  cancel_job: simple('cancel_job → export job cancel', 'cancel_job', 'job', exportJobKeys, { jobId: { kind: 'same', from: ['from-read:export_video.jobId'] } }),
})
