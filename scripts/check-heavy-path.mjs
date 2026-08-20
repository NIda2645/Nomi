#!/usr/bin/env node
// 重活门岗（2026-08-20）。抓的是一整类**用户体感「卡死」**的写法。
//
// 起因：用户报「切图九宫格直接卡死，卡了半小时」。挖到底发现不是一个 bug，是**一族**：
//   ① 同步 PNG 编码（canvas.toDataURL）在主线程上跑，9 张 4K 切片就冻 700ms；
//   ② 产物是 base64，塞进 store → 每次写入被 emitCanvasGesture 做一遍 JSON 深拷贝、
//      压进撤销日志、IPC 发去事件日志，主进程再同步 redact/sha256/writeFileSync 一份全文；
//   ③ 于是渲染层冻 1.6s、主进程冻到分钟级——用户看到的就是「点完就死」。
// 同族的其他入口当时还活着：全景截图把 8K base64 永久留在 store、联系表同款先塞后换。
//
// 这三条规则各自都能单独 grep，所以能做成门岗；按棘轮跑（基线只减不增），
// 和 check:tokens / check:i18n / check:walkthroughs 同一套做法。
//
// 为什么值得一道门岗而不是写进文档：这类写法**当场看不出问题**——小图上跑得飞快，
// 大图上才冻死；写的人手里多半是小图。靠自觉记不住，只能靠机器每次拦。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_FILE = path.join(repoRoot, 'scripts/heavy-path-baseline.json')

function collect() {
  const files = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(tsx?|mts|cts)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full)
    }
  }
  walk(path.join(repoRoot, 'src'))
  walk(path.join(repoRoot, 'electron'))
  return files
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const RULES = [
  {
    id: 'sync-image-encode',
    label: '同步图像编码（canvas.toDataURL）——编码期间整个界面冻住',
    hint: '改用 canvas.convertToBlob() / toBlob()（异步，编码不占主线程），拿到 Blob 再落盘。',
    scan(code, file) {
      const hits = []
      code.split('\n').forEach((line, i) => {
        if (/\.toDataURL\s*\(/.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
      })
      return hits
    },
  },
  {
    id: 'base64-into-store',
    label: 'base64 写进画布 store——每次写入都被整段 JSON 深拷贝 + 随每次保存全量序列化',
    hint: '先 persistNodeImageBlob() 落盘换 nomi-local:// 门牌号，store 只存门牌号、只写一次。',
    scan(code, file) {
      // 形状：同一个 updateNode/addNode 调用里，url/result 直接吃了 dataUrl/base64 变量。
      // 只认「变量名像 base64」这一类明显写法——宁可漏报，不要噪音（噪音会让整条规则被无视）。
      const hits = []
      const lines = code.split('\n')
      lines.forEach((line, i) => {
        if (!/\b(url|src)\s*:\s*(data[Uu]rl|base64|pngBase64|b64)\b/.test(line)) return
        const window = lines.slice(Math.max(0, i - 12), i + 1).join('\n')
        if (/updateNode\s*\(|addNode\s*\(|result\s*:/.test(window)) {
          hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
        }
      })
      return hits
    },
  },
  {
    id: 'duplicate-node-size-bounds',
    label: '在 nodeSizing 之外复刻节点尺寸上下界——布局和渲染各算各的，必然错位',
    hint: '尺寸只有一个真相源：从 nodeSizing 导入常量，卡片实际渲染多大问 resolveNodeVisualSize()。',
    scan(code, file) {
      if (file.endsWith(path.join('nodes', 'nodeSizing.ts'))) return []
      const hits = []
      code.split('\n').forEach((line, i) => {
        if (/\b(const|let)\s+(MIN|MAX)_NODE_(WIDTH|HEIGHT)\s*=/.test(line)) {
          hits.push({ line: i + 1, text: line.trim().slice(0, 120), file })
        }
      })
      return hits
    },
  },
]

const files = collect()
const found = new Map(RULES.map((rule) => [rule.id, []]))
for (const file of files) {
  const code = stripComments(fs.readFileSync(file, 'utf8'))
  for (const rule of RULES) {
    for (const hit of rule.scan(code, file)) found.get(rule.id).push(hit)
  }
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {}
if (process.argv.includes('--update-baseline')) {
  const next = Object.fromEntries(RULES.map((rule) => [rule.id, found.get(rule.id).length]))
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`✅ 已写入基线：${JSON.stringify(next)}`)
  process.exit(0)
}

let failed = false
const summary = []
for (const rule of RULES) {
  const hits = found.get(rule.id)
  const allowed = Number.isFinite(baseline[rule.id]) ? baseline[rule.id] : 0
  summary.push(`${rule.id}=${hits.length}`)
  if (hits.length <= allowed) continue
  failed = true
  console.log(`\n✖ ${rule.label}`)
  console.log(`  基线 ${allowed} → 现在 ${hits.length}（新增 ${hits.length - allowed} 处，棘轮只减不增）`)
  for (const hit of hits.slice(0, 12)) {
    console.log(`    ${path.relative(repoRoot, hit.file)}:${hit.line}  ${hit.text}`)
  }
  console.log(`  → ${rule.hint}`)
}

if (failed) {
  console.log('\n重活门岗未通过。这些写法在小图上看不出问题，大图上会把界面/主进程冻死。')
  process.exit(1)
}
console.log(`✅ 重活门岗通过：${summary.join(' · ')}（棘轮只减不增）`)
