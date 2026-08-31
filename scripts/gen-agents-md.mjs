#!/usr/bin/env node
// AGENTS.md 同步门岗 + 生成器（2026-08-25）。抓的是一整类**当场看不出、几天后才炸**的文档漂移：
// 手工维护的双份规则目录。
//
// 起因：CLAUDE.md（我读）和 AGENTS.md（Codex 读）是同一套纪律的两份副本，只差 `.claude/`→`.Codex/`
// 几处路径。谁改了自己那份就算改完了，看不见另一份 —— 08-15 Codex 把「解决状态必须可交付」只写进
// AGENTS.md，08-20 我把「重活门岗」只写进 CLAUDE.md，两边都以为 R16 是最后一号，于是**双双取名 R17**，
// docs/engineering-rules.md 一度出现两个 `## R17`；查 R17 会静悄悄翻到错的那条。漂了 10 天没人发现。
// 写的人当场看不出毛病（自己那份读起来完全自洽），靠自觉记不住，只能机器每次拦——P2 通用性判定的又一落地件。
//
// 规矩：AGENTS.md 不再手改，改纪律一律改 CLAUDE.md，再 `pnpm run gen:agents`。
// 替换集是封闭的两条（见 SUBSTITUTIONS）；两文件除此之外必须逐字节相同，check 模式硬零。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = 'CLAUDE.md'
const TARGET = 'AGENTS.md'

// 封闭替换集：Codex 侧与 Claude 侧**仅有的**合法差异。
// 加第三条前先问「这真是两侧的固有差异，还是我在拿它掩盖一次漂移」。
const SUBSTITUTIONS = [
  { from: /\.claude\//g, to: '.Codex/', why: 'Codex 侧的 hook / skills 住在 .Codex/，不是 .claude/' },
  // 只改**自引用**（文档提到自己名字的那处），不搞 CLAUDE.md→AGENTS.md 全局替换：
  // 全局替换会把「本文件由 CLAUDE.md 生成」这种**指向上游**的引用也改掉，镜像里就变成自己生成自己。
  { from: /也写进 CLAUDE\.md/g, to: '也写进 AGENTS.md', why: 'D6 的自引用：文档说「也写进<自己>」' },
]

const BANNER = [
  '<!-- 本文件由 scripts/gen-agents-md.mjs 从 CLAUDE.md 自动生成，请勿手改。 -->',
  '<!-- 改纪律请改 CLAUDE.md，再跑 pnpm run gen:agents；check:agents-sync 在 gates 链里拦漂移。 -->',
  '',
].join('\n')

function generate(source) {
  let body = source
  for (const rule of SUBSTITUTIONS) body = body.replace(rule.from, rule.to)
  // banner 一律在替换之后拼：它自己写着「从 CLAUDE.md 生成」，将来若有人往 SUBSTITUTIONS
  // 加了更宽的 CLAUDE.md→AGENTS.md 规则，先拼就会被改成「从 AGENTS.md 生成」（自己生成自己）。
  return BANNER + body
}

const sourcePath = path.join(repoRoot, SOURCE)
const targetPath = path.join(repoRoot, TARGET)
const expected = generate(fs.readFileSync(sourcePath, 'utf8'))

if (!process.argv.includes('--check')) {
  fs.writeFileSync(targetPath, expected)
  console.log(`✅ 已从 ${SOURCE} 生成 ${TARGET}（替换集 ${SUBSTITUTIONS.length} 条）`)
  process.exit(0)
}

const actual = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : ''
if (actual === expected) {
  console.log(`✅ AGENTS.md 同步门岗通过：与 ${SOURCE} 逐字节一致（差异仅封闭替换集 ${SUBSTITUTIONS.length} 条）`)
  process.exit(0)
}

const expectedLines = expected.split('\n')
const actualLines = actual.split('\n')

// 逐行配对会被「开头插一行」整体错位，把全文都报成漂移（没法用）。走 LCS 拿真正的增删行。
function diffLines(want, got) {
  const n = want.length
  const m = got.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = want[i] === got[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (want[i] === got[j]) { i += 1; j += 1 } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'missing', lineNo: i + 1, text: want[i] })
      i += 1
    } else {
      out.push({ kind: 'extra', lineNo: j + 1, text: got[j] })
      j += 1
    }
  }
  while (i < n) { out.push({ kind: 'missing', lineNo: i + 1, text: want[i] }); i += 1 }
  while (j < m) { out.push({ kind: 'extra', lineNo: j + 1, text: got[j] }); j += 1 }
  return out
}

const drifted = diffLines(expectedLines, actualLines)
const missing = drifted.filter((d) => d.kind === 'missing').length
const extra = drifted.length - missing

console.log(`✖ AGENTS.md 同步门岗未通过：${TARGET} 少 ${missing} 行、多 ${extra} 行`)
for (const d of drifted.slice(0, 12)) {
  const tag = d.kind === 'missing' ? `缺（${SOURCE} 有）` : `多（${SOURCE} 没有）`
  console.log(`    ${tag} ${TARGET}:${d.lineNo}  ${d.text.trim().slice(0, 100) || '（空行）'}`)
}
if (drifted.length > 12) console.log(`    …另有 ${drifted.length - 12} 行`)
console.log(`  → 修法：改 ${SOURCE}，然后 pnpm run gen:agents`)
console.log(`  ⚠️ 若你刚在 ${TARGET} 里手写了新纪律：先把它搬进 ${SOURCE} 再生成，直接跑 gen 会把你的改动冲掉`)
console.log('    （这门岗就是为了防 08-15/08-20 那次双边各写一半、双双取名 R17 的事故重演）')
process.exit(1)
