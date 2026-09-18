// `check:model-face-frozen` 这道门自己的完整性测试（R17「加规则必须先验它会红」的常驻版）。
//
// 这道门的全部价值就是「变了会说话」，所以它坏掉的样子恰好是一句「✅ 逐字节相同」。这里不测被测对象，
// 测尺子：把宿主 schema 与投影各变异一次，门必须红在**具名的那个工具**上；变异撤掉，门必须回绿。
//
// 第一条变异就是原型那次**全绿**的那条（`docs/plan/2026-09-18-tool-projection-cancel-job-prototype.md`
// 「两次变异」那张表的 ①：给宿主分支加一个必填字段，投影默认它是模型该填的，当时没有任何东西会红）。
// 这道门存在的理由就是让它从今天起红。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'scripts/check-model-face-frozen.mjs')

function runGate() {
  try {
    execFileSync('pnpm', ['exec', 'tsx', gate], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
    return { red: false, output: '' }
  } catch (error) {
    return { red: true, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const RECOVERY_FILE = path.join(repoRoot, '.tmp/model-face-frozen-mutation-recovery.json')

if (fs.existsSync(RECOVERY_FILE)) {
  for (const [relative, content] of JSON.parse(fs.readFileSync(RECOVERY_FILE, 'utf8'))) {
    fs.writeFileSync(path.join(repoRoot, relative), content)
  }
  fs.rmSync(RECOVERY_FILE, { force: true })
  console.warn('⚠ 上一轮变异测试被中断，已从恢复档还原')
}

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
      const full = path.join(repoRoot, relative)
      const text = fs.readFileSync(full, 'utf8')
      assert.ok(text.includes(find), `变异目标不在 ${relative} 里了，这条变异已经过期：${find.slice(0, 70)}`)
      fs.writeFileSync(full, text.replace(find, replace))
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
  assert.ok(scripts['check:model-face-frozen'], 'package.json 里没有这条 script')
  assert.ok(scripts['gates:contracts'].includes('check:model-face-frozen'),
    'gates:contracts 里没有它 —— 门岗不在常跑档上等于没有门岗')
})

const MUTATIONS = [
  ['宿主分支新长出一个必填字段，顺着投影流到模型脸上（原型那次全绿的那条）', [
    ['electron/shared/agentCapabilities/exportCapabilities.ts',
      'const exportJobPiInputSchema = z.object({ jobId: exportJobIdSchema }).strict();',
      'const exportJobPiInputSchema = z.object({ jobId: exportJobIdSchema, requestedBy: z.string() }).strict();'],
  ], /cancel_job|check_job/],
  ['改一句模型读得到的描述（投影里唯一允许手写的东西，也要有人说一声）', [
    ['electron/shared/agentCapabilities/verbs/verbProjections.ts',
      '.describe("The job to cancel.")', '.describe("The job you want to stop.")'],
  ], /cancel_job/],
  // 目录顺序是合同不是审美：它进系统提示词与 tools/list，是 prompt/KV-cache 的前缀
  // （`verbDeclarations.ts` 文件头）。逐工具比对看不见这一种，所以门岗单独认它——这条变异就是那个洞的
  // 阳性对照（第一版真的漏报过，打印出来的是「0 个工具变了」）。
  ['只换目录顺序，一个字段都不改（KV-cache 前缀变了，逐工具比对看不见）', [
    ['electron/shared/agentCapabilities/verbs/readVerbs.ts',
      'return [lookAtCanvas, readScript, readTimeline, lookAtMedia, listModels, checkJob, readSkill];',
      'return [lookAtCanvas, readScript, readTimeline, lookAtMedia, listModels, readSkill, checkJob];'],
  ], /顺序/],
]

for (const [name, edits, expected] of MUTATIONS) {
  test(`变异验红 · ${name}`, () => {
    const outcome = withMutation(edits, runGate)
    assert.equal(outcome.red, true, `模型面变了而门岗仍然绿 —— 这道门在这一类上是瞎的（${name}）`)
    assert.match(outcome.output, expected, `红了，但没点名是哪个工具变的（${name}）：\n${outcome.output}`)
  })
}

test('变异全部撤掉之后门岗回绿（证明上面的红来自变异，不是仪器坏了）', () => {
  assert.equal(runGate().red, false)
})
