#!/usr/bin/env node
// 测试等待门岗（2026-08-25）。抓的是一整类**并行跑才炸**的测试写法：私有墙钟等待。
//
// 起因：electron/productionRun 十个测试文件各自复制了一份 waitFor(check, 500ms~5s 硬闹钟)，
// 拿「调过参的墙钟猜测」赛跑「真实文件锁 + fsync 编排链」。单跑几十 ms 绿得发亮；
// vitest 并行满载时 fsync 被放大百倍 → 链路合法地超过闹钟 → 间歇翻红（干净 main 上 5 跑 4 挂）。
// 写的人当场看不出毛病（本机单跑永远绿），靠自觉记不住，只能机器每次拦——P2 通用性判定的又一落地件。
//
// 规矩：测试里等后台编排链，一律 import productionRunTestHelpers 的 waitForProduction
// （60s 安全网、超时抛带标签错误）；不许再手写 waitFor / Date.now() 截止时间轮询。
// 2026-08-25 清零后本门岗硬零：任何新增当场报红，无棘轮基线。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function collectTestFiles() {
  const files = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.test\.(tsx?|mts|cts|mjs)$/.test(entry.name)) files.push(full)
    }
  }
  for (const dir of ['src', 'electron', 'evals', 'scripts', 'tests']) walk(path.join(repoRoot, dir))
  return files
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const RULES = [
  {
    id: 'private-waitfor',
    label: '测试文件里定义私有 waitFor——共享 waitForProduction 之外的第二套等待',
    test: (line) => /\bfunction waitFor\s*\(/.test(line) || /\bconst waitFor\s*=/.test(line),
  },
  {
    id: 'wallclock-deadline-poll',
    label: '测试文件里手写 Date.now() 截止时间轮询——拿墙钟猜测赛跑真实 I/O，并行必翻红',
    test: (line) => /\bDate\.now\(\)/.test(line) && /\bdeadline\b/i.test(line),
  },
]

const hits = []
for (const file of collectTestFiles()) {
  const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.test(line)) hits.push({ rule, file, line: i + 1, text: line.trim().slice(0, 120) })
    }
  })
}

if (hits.length > 0) {
  console.log('✖ 测试等待门岗未通过：测试不许手写墙钟等待（单跑看不出，并行跑必间歇翻红）')
  for (const hit of hits.slice(0, 20)) {
    console.log(`    ${path.relative(repoRoot, hit.file)}:${hit.line}  [${hit.rule.id}]  ${hit.text}`)
  }
  console.log('  → 等后台编排链请 import electron/productionRun/productionRunTestHelpers 的 waitForProduction')
  console.log('    （60s 安全网只拦真死锁/真回归，不给磁盘排队计时；来龙去脉见 docs/plan/2026-08-25-fix-flaky-production-run-tests.md）')
  process.exit(1)
}
console.log('✅ 测试等待门岗通过：0 处私有墙钟等待（硬零，无基线）')
