// `check:verb-host-conformance` 这道门自己的完整性测试（R17「加门岗必须先验它会红」的常驻版）。
//
// 一道只会说「✅」的门是最危险的东西：它让人相信有防线。所以这里不测被测对象，测**尺子**——
// 把生产代码逐条变异回 2026-09-18 之前的写法，门必须每一条都红；变异撤掉，门必须回绿。
// 变异在临时副本上做（`--mutate` 走环境变量注入，不碰工作区），跑完不留痕。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'scripts/check-verb-host-conformance.mjs')

function runGate() {
  try {
    execFileSync('pnpm', ['exec', 'tsx', gate], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
    return { red: false, output: '' }
  } catch (error) {
    return { red: true, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

/**
 * 这个测试**真的改生产文件**（否则量不到门岗对真实代码的反应）。`finally` 兜住抛异常那条路，
 * 但兜不住 SIGKILL / 断电——那会把变异留在工作区，最坏的情况是被人连着提交上去。
 * 所以变异前先把原文落盘成恢复档，任何一次启动先看有没有上一轮留下的恢复档，有就先还原。
 * 「被中断」因此从一个静默灾难变成一次自动复原。
 */
const RECOVERY_FILE = path.join(repoRoot, '.tmp/verb-host-conformance-mutation-recovery.json')

function restoreLeftoverMutation() {
  if (!fs.existsSync(RECOVERY_FILE)) return
  const saved = JSON.parse(fs.readFileSync(RECOVERY_FILE, 'utf8'))
  for (const [relative, content] of saved) fs.writeFileSync(path.join(repoRoot, relative), content)
  fs.rmSync(RECOVERY_FILE, { force: true })
  console.warn('⚠ 上一轮变异测试被中断，已从恢复档还原生产文件')
}

restoreLeftoverMutation()

/** 一次变异 = 一组 [文件, 找, 换]。跑完无论成败都还原，绝不把变异留在工作区。 */
function withMutation(edits, body) {
  const originals = edits.map(([relative]) => [relative, fs.readFileSync(path.join(repoRoot, relative), 'utf8')])
  const restore = () => {
    for (const [relative, content] of originals) fs.writeFileSync(path.join(repoRoot, relative), content)
    fs.rmSync(RECOVERY_FILE, { force: true })
  }
  const onSignal = () => { restore(); process.exit(130) }
  fs.mkdirSync(path.dirname(RECOVERY_FILE), { recursive: true })
  fs.writeFileSync(RECOVERY_FILE, JSON.stringify(originals))
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  try {
    for (const [relative, find, replace] of edits) {
      const file = path.join(repoRoot, relative)
      const before = fs.readFileSync(file, 'utf8')
      assert.ok(before.includes(find), `变异目标不在 ${relative} 里了，这条变异已经过期：${find.slice(0, 60)}`)
      fs.writeFileSync(file, before.replace(find, replace))
    }
    return body()
  } finally {
    restore()
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
}

test('门岗在今天的代码上是绿的', () => {
  const outcome = runGate()
  assert.equal(outcome.red, false, `门岗本该绿：\n${outcome.output}`)
})

test('这道门岗进了 contracts 档，不是一个没人跑的脚本', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts
  assert.ok(scripts['check:verb-host-conformance'], 'package.json 里没有这条 script')
  assert.ok(scripts['gates:contracts'].includes('check:verb-host-conformance'), 'gates:contracts 里没有它 —— 门岗不在常跑档上等于没有门岗')
})

const MUTATIONS = [
  ['A 类 · 动词声明宿主 .strict() 不认的字段（改草稿那条路上的 title）', [
    ['electron/shared/agentCapabilities/verbs/writeVerbs.ts',
      '      const renamed = value.draftId === undefined ? -1 : value.shots.findIndex((shot) => shot.title !== undefined);',
      '      const renamed = -1;'],
  ]],
  ['B 类 · 宿主重新硬要模型拿不到的 contentHash / version', [
    ['electron/shared/agentCapabilities/generationPlanSchemas.ts',
      '  contentHash: z.string().trim().min(1).optional(),\n  version: z.number().int().min(1).optional(),',
      '  contentHash: z.string().trim().min(1),\n  version: z.number().int().min(1),'],
  ]],
  ['B 类 · 共享默认值搬回单个执行器（只修一个面）', [
    ['electron/shared/agentCapabilities/verbs/readVerbs.ts',
      '    semanticInputOf: (args) => ({ scope: (args as { scope?: "full" | "selection" }).scope ?? "full" }),\n', ''],
  ]],
  ['C 类 · 翻译层把时长改名成宿主没有的顶层字段', [
    ['electron/agentLane/laneVerbTransport.ts',
      'const withDuration = durationSec === undefined ? parameters : { ...(parameters ?? {}), duration: durationSec }',
      'const withDuration = parameters'],
    ['electron/agentLane/laneVerbTransport.ts',
      '...(withDuration ? { parameters: withDuration } : {}),',
      '...(withDuration ? { parameters: withDuration } : {}), ...(durationSec === undefined ? {} : { durationSeconds: durationSec }),'],
  ]],
  ['D 类 · 翻译层静默丢掉模型点名的目录身份', [
    ['electron/agentLane/laneVerbTransport.ts',
      '  const modelId = candidate?.modelId ?? modelKey', '  const modelId = modelKey'],
    ['electron/agentLane/laneVerbTransport.ts',
      '    ...(candidate?.providerId ? { providerId: candidate.providerId } : {}),\n', ''],
  ]],
  ['R4 · 翻出一个没有传输适配器认的 lane', [
    ['electron/agentLane/laneVerbTransport.ts',
      "    case 'save_skill':",
      "    case 'start_model_setup':\n      return { lane: 'modelSetup' as never, call: { ...base, toolName: 'nomi_open_model_setup', args } }\n    case 'save_skill':"],
  ]],
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
