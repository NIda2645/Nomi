#!/usr/bin/env node
// 走查质量门岗（2026-08-18）。
//
// 为什么需要它：`eslint.config.js:28` 把 `tests/ux/**` 整个 ignore —— 现有所有门岗**没有一道看得见这片地**。
// 这不是新发现：`scripts/check-e2e-launch.mjs:6` 的注释里前人已经写下这句话，但当时只修了
// 「启动路径」这一个症状。结果是 143 个走查里长出了 80–94% 命中率的假绿模式，无人拦截。
//
// 本门岗抓四类**会让测试骗人**的写法，按棘轮运行（基线只减不增），
// 和仓库既有的 lint:ci --max-warnings / check:filesize 白名单 / check:tokens 棘轮同一套做法。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_FILE = path.join(repoRoot, 'scripts/walkthrough-baseline.json')

/** 只扫「跑得起来的走查/e2e」和「扫源码的结构测试」这两片。 */
function collect() {
  const files = []
  const uxDir = path.join(repoRoot, 'tests/ux')
  if (fs.existsSync(uxDir)) {
    for (const name of fs.readdirSync(uxDir)) {
      if (name.endsWith('.mjs') || name.endsWith('.cjs')) files.push(path.join(uxDir, name))
    }
  }
  const walkSrc = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walkSrc(full)
      } else if (/structure.*\.test\.ts$/i.test(entry.name) || /\.structure\.test\.ts$/.test(entry.name)) {
        files.push(full)
      }
    }
  }
  walkSrc(path.join(repoRoot, 'src'))
  return files
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const RULES = [
  {
    id: 'absence-without-baseline',
    label: '「不存在」断言没有基线（和「探针根本没生效」无法区分）',
    appliesTo: (file) => file.includes(`${path.sep}tests${path.sep}ux${path.sep}`),
    scan(code, file) {
      // 用了共享的 expectAbsent 就天然带基线（它签名上强制 provenBy），整份文件豁免。
      if (code.includes('expectAbsent(')) return []
      const hits = []
      const lines = code.split('\n')
      const OBSERVES = /count\(\)|isVisible|toBeVisible|querySelectorAll|getByText|getByRole|locator\(/
      lines.forEach((line, i) => {
        // 形如：=== 0 / == 0 / toBe(0) / toHaveCount(0) / .length === 0
        const countsToZero = /(===?\s*0\b|toBe\(0\)|toHaveCount\(0\)|length\s*===?\s*0)/.test(line)
        if (!countsToZero) return
        // UI 观测常和归零比较**跨行**（先 const n = await x.count()，再 if (n === 0)）。
        // 只看同一行会漏掉绝大多数真实写法——负向测试首跑就漏了这一类，所以往回看几行。
        const window = lines.slice(Math.max(0, i - 5), i + 1).join('\n')
        if (OBSERVES.test(window)) hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
      })
      return hits
    },
  },
  {
    id: 'whole-page-text',
    label: '全页文本观测（脚本自己 seed 的数据会把断言污染成必然命中）',
    appliesTo: (file) => file.includes(`${path.sep}tests${path.sep}ux${path.sep}`),
    scan(code, file) {
      const hits = []
      code.split('\n').forEach((line, i) => {
        if (/document\.body\.innerText|document\.body\.textContent/.test(line)) {
          hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
        }
      })
      return hits
    },
  },
  {
    id: 'sleep-as-done-signal',
    label: '拿长 sleep 当「操作完成」信号（真实耗时会变，sleep 不够长就读到空 → 假绿）',
    appliesTo: (file) => file.includes(`${path.sep}tests${path.sep}ux${path.sep}`),
    scan(code, file) {
      const hits = []
      const lines = code.split('\n')
      lines.forEach((line, i) => {
        const m = line.match(/waitForTimeout\((\d{4,})\)/)
        if (!m) return
        if (Number(m[1]) < 1500) return
        // 紧随其后 3 行内就做断言 = 把 sleep 当完成信号
        const after = lines.slice(i + 1, i + 4).join('\n')
        // includes/match 也算观测：负向测试首跑漏过 `console.log(txt.includes(...))` 这一类。
        if (/count\(\)|isVisible|innerText|textContent|toBe|expect|record\(|\.includes\(|\.match\(/.test(after)) {
          hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
        }
      })
      return hits
    },
  },
  {
    id: 'source-scan-without-strip',
    label: '扫源码的结构测试没剥注释（会反噬文档：记录该 bug 的注释本身把门岗打红）',
    appliesTo: (file) => file.endsWith('.ts'),
    scan(code, file) {
      if (!/readFileSync\(/.test(code)) return []
      if (/stripComments|stripCommentsAndStrings/.test(code)) return []
      const hits = []
      code.split('\n').forEach((line, i) => {
        if (/readFileSync\(/.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
      })
      return hits
    },
  },
]

const files = collect()
const found = Object.fromEntries(RULES.map((r) => [r.id, []]))
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  const code = stripComments(raw)
  for (const rule of RULES) {
    if (!rule.appliesTo(file)) continue
    found[rule.id].push(...rule.scan(code, file))
  }
}

const counts = Object.fromEntries(RULES.map((r) => [r.id, found[r.id].length]))
const writeBaseline = process.argv.includes('--update-baseline')
if (writeBaseline) {
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`)
  console.log('已写入基线：', JSON.stringify(counts))
  process.exit(0)
}

if (!fs.existsSync(BASELINE_FILE)) {
  console.error(`缺基线文件 ${path.relative(repoRoot, BASELINE_FILE)}，先跑：node scripts/check-walkthroughs.mjs --update-baseline`)
  process.exit(1)
}
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))

let failed = false
const improved = []
for (const rule of RULES) {
  const now = counts[rule.id]
  const was = baseline[rule.id] ?? 0
  if (now > was) {
    failed = true
    console.error(`\n✖ ${rule.label}`)
    console.error(`  基线 ${was} → 现在 ${now}（新增 ${now - was} 处，棘轮只减不增）`)
    // 只列前 8 处，够定位就行
    for (const hit of found[rule.id].slice(0, 8)) {
      console.error(`    ${path.relative(repoRoot, hit.file)}:${hit.line}  ${hit.text}`)
    }
    if (rule.id === 'absence-without-baseline') {
      console.error('  → 改用 tests/ux/_assert.mjs 的 expectAbsent(locator, { provenBy })：')
      console.error('    它在签名上强制你先用 proveProbe() 证明「这个检查测得到东西」。')
    }
  } else if (now < was) {
    improved.push(`${rule.id} ${was}→${now}`)
  }
}

if (failed) {
  console.error('\n走查质量门岗未通过。这些写法会让测试报绿但什么都没验证到。')
  process.exit(1)
}
console.log(`✅ 走查质量门岗通过：${RULES.map((r) => `${r.id}=${counts[r.id]}`).join(' · ')}`)
if (improved.length > 0) {
  console.log(`   有改善：${improved.join('、')} —— 记得跑 --update-baseline 把棘轮拧紧`)
}
