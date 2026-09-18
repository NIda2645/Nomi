// `check:verb-host-conformance` 这道门自己的完整性测试（R17「加门岗必须先验它会红」的常驻版）。
//
// 一道只会说「✅」的门是最危险的东西：它让人相信有防线。所以这里不测被测对象，测**尺子**——
// 把生产代码逐条变异回 2026-09-18 之前的写法，门必须每一条都红；变异撤掉，门必须回绿。
// 变异在临时副本上做（`--mutate` 走环境变量注入，不碰工作区），跑完不留痕。
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assertGateIsOnContracts, createGateMutationHarness } from './gate-mutation-harness.mjs'

// 跑门岗 / 改生产文件 / 无论成败都还原 / 被中断时从恢复档复原——四件事的**唯一**一份实现
// （2026-09-18 把它抽出来之前，这里、`check:model-face-frozen` 与
// `check:mcp-operation-constructible` 各有一份抄的，正是 P1 说的并行版）。
const { runGate, withMutation } = createGateMutationHarness({
  gate: 'scripts/check-verb-host-conformance.mjs',
  recoveryFile: '.tmp/verb-host-conformance-mutation-recovery.json',
})

test('门岗在今天的代码上是绿的', () => {
  const outcome = runGate()
  assert.equal(outcome.red, false, `门岗本该绿：\n${outcome.output}`)
})

test('这道门岗进了 contracts 档，不是一个没人跑的脚本', () => {
  assertGateIsOnContracts('check:verb-host-conformance')
})

const MUTATIONS = [
  ['A 类 · 拿掉动词那道拦截后，信封字段在改草稿那条路上必须当场被拒（不许静默消失）', [
    ['electron/shared/agentCapabilities/verbs/writeVerbs.ts',
      '        const index = value.operationId === undefined ? -1 : value.shots.findIndex((shot) => shot[field] !== undefined);',
      '        const index = -1;'],
  ]],
  ['B 类 · 宿主重新硬要模型拿不到的 contentHash / version', [
    ['electron/shared/agentCapabilities/generationPlanSchemas.ts',
      '  contentHash: z.string().trim().min(1).optional(),\n  version: z.number().int().min(1).optional(),',
      '  contentHash: z.string().trim().min(1),\n  version: z.number().int().min(1),'],
  ]],
  ['B 类 · 共享默认值搬回单个执行器（只修一个面）', [
    ['electron/shared/agentCapabilities/verbs/readVerbs.ts',
      '    semanticInputOf: (args) => ({ scope: (args as { scope?: DocumentReadInput["scope"] }).scope ?? READ_SCRIPT_SCOPE_DEFAULT }),\n', ''],
  ]],
  ['C 类 · 时长落在一个**存在但语义不对**的宿主字段上（类型看不出来，喂真值才红）', [
    ['electron/shared/agentCapabilities/verbs/draftShotsProjection.ts',
      "      ? { parameters: { ...(parameters ?? {}), ...(durationSec !== undefined ? { duration: durationSec } : {}) } }",
      "      ? { parameters: { ...(parameters ?? {}) }, mode: String(durationSec) }"],
  ]],
  ['D 类 · 目录身份被静默丢掉（形状仍合法，值消失，只有逐字段探针看得见）', [
    ['electron/shared/agentCapabilities/verbs/draftShotsProjection.ts',
      "    ...(candidate?.providerId !== undefined ? { providerId: candidate.providerId } : {}),\n", ''],
  ]],
  ['R4 · 翻出一个没有传输适配器认的 lane', [
    ['electron/agentLane/laneVerbTransport.ts',
      "    case 'save_skill':",
      "    case 'start_model_setup':\n      return { lane: 'modelSetup' as never, call: { ...base, toolName: 'nomi_open_model_setup', args } }\n    case 'save_skill':"],
  ]],
  // ── 「模型从哪拿到这个值」那一层（2026-09-18 投影化之后**仍然留着**的那条轴）──
  //
  // 对照表删掉了，这条轴没有：R1 只保证「宿主要的，动词告诉过模型」，保证不了「模型拿得到那个值」。
  // 三条都打在**真实声明**上：装配期抛 → 门岗导入它就炸 → 红。
  ['来源 · 动词加了字段却没说清模型从哪拿到它', [
    ['electron/shared/agentCapabilities/verbs/writeVerbs.ts',
      'export const draftShotSchema = z.object({\n  shotId:',
      'export const draftShotSchema = z.object({\n  cameraLens: z.string().trim().min(1).optional().describe("Lens note."),\n  shotId:'],
  ]],
  ['来源 · 声明成来自一个不返回这个字段的读动词（模型连拿到的机会都没有）', [
    ['electron/shared/agentCapabilities/verbs/verbFieldProvenance.ts',
      '    "shots.references": ["from-read:look_at_media.assetId", "host-resolved"],',
      '    "shots.references": ["from-read:look_at_canvas.contentHash"],'],
  ]],
  ['来源 · 指向一个返回形状根本没声明的动词，且没具名登记', [
    ['electron/shared/agentCapabilities/verbs/verbFieldProvenance.ts',
      '  list_models: "generation.context.read 的 outputSchema 是 z.unknown()；真形状在 availableModelsSchema.agentModelEntrySchema，但契约上没声明，所以核不动",\n',
      ''],
  ]],
  // 投影新长出来的那条闸——宿主自补的字段被藏起来却没人补它 / 补错了值——是 **tsc** 红，不是门岗红。
  // 编译期的东西这把尺子量不到，它的阳性对照在 PR 正文的 A/B 里（把宿主字段改名，投影前后各跑一次
  // typecheck）。写在这里是为了让下一个人知道它**在哪儿被证明过**，而不是以为没人证过。
  ['R5 · 下游投影重新手抄信封字段表（title 原来就是这么死了五次的）', [
    ['electron/productionRun/productionRunRepository.ts',
      '? { shots: input.shots.map((shot) => ({ ...generationShotEnvelopeOf(shot), candidate: structuredClone(shot.candidate), updatedAt: timestamp })) }',
      '? { shots: input.shots.map((shot) => ({ shotId: shot.shotId, role: shot.role, included: shot.included, candidate: structuredClone(shot.candidate), updatedAt: timestamp })) }'],
    ['electron/productionRun/productionRunRepository.ts',
      'import { generationShotEnvelopeOf } from "../shared/generationShotEnvelope";', ''],
  ]],
  ['R2b · 跨字段约束搬回翻译层，靠替模型编造缺省端点（只有两字段组合能暴露）', [
    ['electron/shared/agentCapabilities/verbs/readVerbs.ts',
      '      rangeRefinement("startFrame", "endFrame")(value as Record<string, unknown>, context);\n', ''],
    ['electron/shared/agentCapabilities/verbs/verbSemanticInput.ts',
      'if (assetId && startFrame !== undefined && endFrame !== undefined) {',
      'if (assetId && (startFrame !== undefined || endFrame !== undefined)) {'],
    ['electron/shared/agentCapabilities/verbs/verbSemanticInput.ts',
      'return { operation: ASSET_READ_ALIASES.inspectRange, assetId, startFrame, endFrame } as AssetReadInput;',
      'return { operation: ASSET_READ_ALIASES.inspectRange, assetId, startFrame: startFrame ?? 0, endFrame: endFrame ?? 0 } as AssetReadInput;'],
  ]],
]

for (const [name, edits] of MUTATIONS) {
  test(`变异验红 · ${name}`, () => {
    const outcome = withMutation(edits, runGate)
    assert.equal(outcome.red, true, `把生产代码改回旧行为后门岗仍然绿 —— 这道门在这一类上是瞎的（${name}）`)
  })
}

test('变异全部撤掉之后门岗回绿（证明上面的红来自变异，不是仪器坏了）', () => {
  assert.equal(runGate().red, false)
})
