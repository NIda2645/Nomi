// `check:mcp-operation-constructible` 这道门自己的完整性测试（R17「加规则必须先验它会红」的常驻版）。
//
// 这道门 2026-09-18 从「可构造」升级成「可填」。升级的那一半特别容易变成摆设：**它自己会把缺的字段
// 补上**，所以尺子坏了的表现就是一句「✅ 全部可构造」——比没有门更糟。这里不测被测对象，测尺子：
// 把登记表与传输 schema 逐条变异，门必须每一条都红；变异撤掉，门必须回绿。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gate = path.join(repoRoot, 'scripts/check-mcp-operation-constructible.mjs')

function runGate() {
  try {
    execFileSync('pnpm', ['exec', 'tsx', gate], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
    return { red: false, output: '' }
  } catch (error) {
    return { red: true, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

/**
 * 变异真的改生产/门岗文件，所以先把原文落盘成恢复档：被 SIGKILL 打断时下一次启动会自动还原，
 * 而不是把变异静默留在工作区等着被人连着提交上去。
 */
const RECOVERY_FILE = path.join(repoRoot, '.tmp/mcp-fillable-mutation-recovery.json')

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
  assert.ok(scripts['check:mcp-operation-constructible'], 'package.json 里没有这条 script')
  assert.ok(scripts['gates:contracts'].includes('check:mcp-operation-constructible'),
    'gates:contracts 里没有它 —— 门岗不在常跑档上等于没有门岗')
})

const MUTATIONS = [
  ['可填 · 删掉一条来源登记（这个字段外面从哪拿到，没人答得出）', [
    ['scripts/check-mcp-operation-constructible.mjs',
      "  'nomi_canvas_edit :: nodeIds': 'from-tool:nomi_read',\n", ''],
  ], /答不出|从哪拿到/],
  ['可填 · 来源指向一个 tools\\/list 上没有的工具（那个工具后来被删了/改名了）', [
    ['scripts/check-mcp-operation-constructible.mjs',
      "  'nomi_canvas_edit :: nodeIds': 'from-tool:nomi_read',",
      "  'nomi_canvas_edit :: nodeIds': 'from-tool:nomi_read_canvas',"],
  ], /没有这个工具/],
  ['可填 · 过期的登记（那个字段已经不必填了，或者那个 operation 没了）', [
    ['scripts/check-mcp-operation-constructible.mjs',
      "const PROVENANCE_ARCHETYPE =",
      "MCP_INPUT_PROVENANCE['nomi_canvas_edit :: aFieldNobodyNeeds'] = 'caller-authored'\nconst PROVENANCE_ARCHETYPE ="],
  ], /过期的声明/],
  ['可填 · 传输 schema 新长出一个必填字段而没人登记它的来源（真正要拦的那件事）', [
    ['electron/shared/agentCapabilities/canvasDelete.ts',
      '    reason: z.string().trim().max(300).optional(),',
      '    reason: z.string().trim().max(300).optional(),\n    requestedBy: z.string().trim().min(1),'],
  ], /requestedBy/],
]

for (const [name, edits, expected] of MUTATIONS) {
  test(`变异验红 · ${name}`, () => {
    const outcome = withMutation(edits, runGate)
    assert.equal(outcome.red, true, `把登记表或 schema 改坏之后门岗仍然绿 —— 这道门在这一类上是瞎的（${name}）`)
    assert.match(outcome.output, expected, `红了，但红在别的判据上（${name}）：\n${outcome.output}`)
  })
}

test('变异全部撤掉之后门岗回绿（证明上面的红来自变异，不是仪器坏了）', () => {
  assert.equal(runGate().red, false)
})
