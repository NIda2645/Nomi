#!/usr/bin/env node
// 包体审计（2026-09-28，发版审计 A，docs/plan/2026-09-28-release-audit.md §3）。
//
// 仓库里一百多道门岗看的都是源码；用户拿到的是安装包。0.22.4 Windows 版装完 1.2GB、app.asar 654MB，
// 其中界面代码只有 30MB——没有任何一道检查看过「包里到底装了什么」。这个脚本看的就是那一份：
//
//   node scripts/audit-package.mjs <产物> [--installer <文件>]... [--report <输出.json>]
//     产物：Windows 的 release/win-unpacked、macOS 的 release/mac-arm64/Nomi.app（或其 Contents/Resources）
//   node scripts/audit-package.mjs <产物> --update-baseline [--installer …] [--allow-growth "<理由>"]
//   node scripts/audit-package.mjs --from-report <报告.json> --update-baseline [--allow-growth "<理由>"]
//   node scripts/audit-package.mjs --check-budget          （contracts：预算文件自身的形状与欠账到期）
//
// 判红（任一条）：
//   · 大小超预算：安装包 / 装完 / app.asar / app.asar.unpacked，按平台各一份；
//   · 身份多出来：包里的 npm 包名单、语言包名单，比基线多一个就红（大小对小库不敏感，名单敏感）；
//   · 禁带文件：source map、测试文件/夹具、.env、别的平台的原生二进制；
//   · 运行时闭包断了：dist-electron 要的包、随包的包声明的依赖与非可选 peer，在包里解析不到——
//     这就是装机版的 `Cannot find module`，在打包作业里当场拦下，不等用户双击；
//   · ffmpeg/ffprobe 平台目标不对（复用 scripts/packaging/audit-packaged-media.cjs）。
// 基线只许人显式改（--update-baseline）；变大必须 --allow-growth 写理由，记进 history。
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveInstalledPackage } from './check-packaged-deps.mjs'
import { externalPackageOf, scanModuleReferences } from './lib/moduleReferences.mjs'
import {
  asarGroupOf, detectArch, openAsar, packagedPackages, platformKey, resolveInArchive, resolvePackageLayout, walkFiles,
} from './lib/packagedApp.mjs'

const require = createRequire(import.meta.url)
const { binaryFormat, isForeignBinary, mayBeNativeBinary, readHead } = require('./packaging/native-binaries.cjs')
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const BUDGET_FILE = 'docs/engineering/package-budget.json'
export const REPORT_SCHEMA = 1
const MB = 1024 * 1024
const TOP_PACKAGES = 30

/**
 * 禁带文件的路径规则（原生二进制另按文件头判）。每条都对应 package.json build.files 里的一条排除，
 * 为什么能排除写在 docs/plan/2026-09-28-release-audit.md §8「查用途的结论」。
 */
export const FORBIDDEN_PATH_RULES = Object.freeze([
  // 运行时没有任何代码读 source map（没有 setSourceMapsEnabled / --enable-source-maps / source-map-support）。
  { id: 'source-map', test: (p) => /\.map$/i.test(p) },
  { id: 'test-file', test: (p) => /(?:^|\/)__tests__\//.test(p) || /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(p) || /\/app\.asar\/dist-electron\/(?:.*\/)?tests\//.test(p) },
  { id: 'fixture', test: (p) => /(?:^|\/)(?:__fixtures__|fixtures)\//.test(p) },
  { id: 'env-file', test: (p) => /(?:^|\/)\.env(?:\.[^/]*)?$/.test(p) },
  // Vite 已把 public/ 原样拷进 dist/，包里再放一份 public/ 就是同一批文件装两遍。
  { id: 'public-duplicate', test: (p) => /\/app\.asar\/public\//.test(p) },
])

function sum(items) {
  return items.reduce((total, item) => total + item.bytes, 0)
}

function groupBytes(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item.path)
    groups.set(key, (groups.get(key) ?? 0) + item.bytes)
  }
  return [...groups.entries()].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
}

/** 安装包按扩展名归类：nsis（Windows .exe）、dmg、zip。 */
export function installerKind(file) {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.exe') return 'nsis'
  if (extension === '.dmg') return 'dmg'
  if (extension === '.zip') return 'zip'
  throw new Error(`认不出安装包类型：${file}（只认 .exe / .dmg / .zip）`)
}

function collectLocales(layout) {
  const locales = new Map()
  for (const dir of layout.localeDirs) {
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.name.endsWith(layout.localeExtension)) continue
      const absolute = path.join(dir, entry.name)
      const bytes = entry.isDirectory() ? sum(walkFiles(absolute)) : fs.statSync(absolute).size
      const name = entry.name.slice(0, -layout.localeExtension.length)
      locales.set(name, (locales.get(name) ?? 0) + bytes)
    }
  }
  const names = [...locales.keys()].sort()
  return { count: names.length, bytes: sum([...locales.values()].map((bytes) => ({ bytes }))), names }
}

/**
 * dist-electron 要的包、随包的包声明的依赖与非可选 peer，在包里都得解析得到。
 * excluded（package-budget.json 的 excludedModules）只豁免第三方包的声明——我们自己的主进程代码
 * 要是 import 了一个被排除的模块，装机版就是真缺模块，照样红。
 */
export function checkRuntimeClosure(archive, { excluded = new Set() } = {}) {
  const problems = []
  for (const [relative] of archive.entries) {
    if (!relative.startsWith('dist-electron/') || !/\.[cm]?js$/.test(relative)) continue
    const text = archive.readText(relative)
    if (text === null) continue
    const fromDir = relative.slice(0, relative.lastIndexOf('/'))
    for (const reference of scanModuleReferences(relative, text).references) {
      const name = externalPackageOf(reference.specifier)
      if (!name || resolveInArchive(archive, name, fromDir)) continue
      problems.push({ kind: 'import', from: `${relative}:${reference.line}`, package: name })
    }
  }
  for (const pkg of packagedPackages(archive)) {
    let manifest
    try {
      manifest = JSON.parse(archive.readText(`${pkg.dir}/package.json`))
    } catch {
      problems.push({ kind: 'manifest', from: pkg.dir, package: pkg.name })
      continue
    }
    const peerMeta = manifest.peerDependenciesMeta ?? {}
    // @types/* 只有类型声明，运行时永远不会被 require，写在 peer 里也不影响装机版。
    const required = [
      ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, kind: 'dependency' })),
      ...Object.keys(manifest.peerDependencies ?? {})
        .filter((name) => peerMeta[name]?.optional !== true && !name.startsWith('@types/'))
        .map((name) => ({ name, kind: 'peer' })),
    ]
    for (const { name, kind } of required) {
      if (excluded.has(name) || resolveInArchive(archive, name, pkg.dir)) continue
      problems.push({ kind, from: pkg.dir, package: name })
    }
  }
  return problems
}

function findForbidden({ layout, installFiles, archive, platform, arch }) {
  const hits = []
  const resourcesPrefix = path.relative(layout.installRoot, layout.resourcesDir).split(path.sep).join('/')
  const asarPrefix = `${resourcesPrefix}/app.asar/`
  const check = (displayPath, bytes, readHeadFn) => {
    for (const rule of FORBIDDEN_PATH_RULES) {
      if (rule.test(displayPath)) hits.push({ rule: rule.id, path: displayPath, bytes })
    }
    if (bytes >= 8 && mayBeNativeBinary(displayPath)) {
      const detected = binaryFormat(readHeadFn())
      if (isForeignBinary(detected, platform, arch)) hits.push({ rule: 'foreign-binary', path: displayPath, bytes, binary: `${detected.format}/${detected.archs.join('+')}` })
    }
  }
  for (const file of installFiles) {
    if (!file.link) check(file.path, file.bytes, () => readHead(path.join(layout.installRoot, file.path)))
  }
  for (const entry of archive.entries.values()) {
    // unpacked 的那份真文件已经在安装目录的遍历里查过了，这里只查归档里的。
    if (entry.unpacked || entry.link !== undefined) continue
    check(`${asarPrefix}${entry.path}`, entry.bytes, () => archive.readHead(entry.path))
  }
  return hits.sort((a, b) => a.rule.localeCompare(b.rule) || a.path.localeCompare(b.path))
}

function auditMediaTargets(installRoot, platform, arch) {
  const { auditPackagedMedia } = require('./packaging/audit-packaged-media.cjs')
  try {
    const result = auditPackagedMedia(installRoot, platform, arch)
    return { ok: true, target: result.target, problems: [] }
  } catch (error) {
    return { ok: false, target: null, problems: [error instanceof Error ? error.message : String(error)] }
  }
}

/** 量一个打包产物，出报告（不和预算比）。 */
export function measurePackage({ input, installers = [], platform: platformOverride, arch: archOverride, excluded = new Set() }) {
  const layout = resolvePackageLayout(input)
  const platform = platformOverride ?? layout.platform
  const arch = archOverride ?? detectArch(layout)
  const installFiles = walkFiles(layout.installRoot)
  const asarPath = path.join(layout.resourcesDir, 'app.asar')
  const archive = openAsar(asarPath)
  try {
    const packed = [...archive.entries.values()].filter((entry) => !entry.unpacked)
    const unpackedRoot = path.join(layout.resourcesDir, 'app.asar.unpacked')
    const unpackedFiles = fs.existsSync(unpackedRoot) ? walkFiles(unpackedRoot) : []
    const packages = packagedPackages(archive)
    const packageGroups = groupBytes(packed.filter((entry) => entry.path.includes('node_modules/')), asarGroupOf)
    return {
      schema: REPORT_SCHEMA,
      platform: platformKey(platform, arch),
      input: path.resolve(input),
      generatedAt: new Date().toISOString(),
      installers: installers.map((file) => ({ kind: installerKind(file), file: path.basename(file), bytes: fs.statSync(file).size })),
      installedBytes: sum(installFiles),
      asar: {
        bytes: fs.statSync(asarPath).size,
        packedBytes: sum(packed),
        byTopLevel: groupBytes(packed, (p) => (p.startsWith('node_modules/') ? 'node_modules' : p.includes('/') ? p.split('/')[0] : '(根目录)')),
        topPackages: packageGroups.slice(0, TOP_PACKAGES),
      },
      unpacked: { bytes: sum(unpackedFiles), byPackage: groupBytes(unpackedFiles, asarGroupOf) },
      locales: collectLocales(layout),
      packages: [...new Set(packages.map((pkg) => pkg.name))].sort(),
      forbidden: findForbidden({ layout, installFiles, archive, platform, arch }),
      runtimeClosure: checkRuntimeClosure(archive, { excluded }),
      media: auditMediaTargets(layout.installRoot, platform, arch),
    }
  } finally {
    archive.close()
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/** 报告和预算比。返回 { violations, warnings, notes }；violations 非空 = 红。 */
export function compareWithBudget(report, budget, { now = today() } = {}) {
  const violations = []
  const warnings = []
  const notes = []
  for (const hit of report.forbidden) violations.push(`禁带文件 [${hit.rule}] ${hit.path}${hit.binary ? `（${hit.binary}）` : ''}`)
  for (const problem of report.runtimeClosure) violations.push(`运行时闭包断了：${problem.from} 要 ${problem.package}（${problem.kind}），包里解析不到`)
  for (const problem of report.media.problems) violations.push(`ffmpeg/ffprobe 平台目标不对：${problem}`)
  const entry = budget.platforms?.[report.platform]
  if (!entry) {
    violations.push(`预算文件里没有 ${report.platform}：先用 --update-baseline 登记这个平台`)
    return { violations, warnings, notes }
  }
  if (entry.unrecorded) {
    const message = `${report.platform} 的基线还没登记（${entry.unrecorded.reason}），到期 ${entry.unrecorded.expires}`
    if (entry.unrecorded.expires < now) violations.push(`${message}——已过期`)
    else warnings.push(`${message}：这次只查禁带文件与运行时闭包，大小与名单不比`)
    return { violations, warnings, notes }
  }
  const measured = { installedBytes: report.installedBytes, asarBytes: report.asar.bytes, unpackedBytes: report.unpacked.bytes }
  for (const installer of report.installers) measured[`installer.${installer.kind}`] = installer.bytes
  for (const [key, limit] of Object.entries(entry.budgets ?? {})) {
    if (!(key in measured)) {
      notes.push(`预算里有 ${key}，这次没量（没传对应的 --installer）`)
      continue
    }
    if (measured[key] > limit) violations.push(`${key} 超预算：${formatMB(measured[key])} > ${formatMB(limit)}（多 ${formatMB(measured[key] - limit)}）`)
  }
  for (const key of Object.keys(measured)) if (!(key in (entry.budgets ?? {}))) warnings.push(`${key} 没有预算（${formatMB(measured[key])}）：用 --update-baseline 登记`)
  const extraPackages = report.packages.filter((name) => !entry.packages.includes(name))
  const gonePackages = entry.packages.filter((name) => !report.packages.includes(name))
  if (extraPackages.length > 0) violations.push(`包里多了 ${extraPackages.length} 个 npm 包（基线里没有）：${extraPackages.join('、')}`)
  if (gonePackages.length > 0) notes.push(`包里少了 ${gonePackages.length} 个 npm 包：${gonePackages.join('、')}——变小了，记得 --update-baseline 收紧`)
  const extraLocales = report.locales.names.filter((name) => !entry.locales.includes(name))
  if (extraLocales.length > 0) violations.push(`语言包多了：${extraLocales.join('、')}（package.json 的 electronLanguages 还在吗？）`)
  return { violations, warnings, notes }
}

export function formatMB(bytes) {
  return `${(bytes / MB).toFixed(1)}MB`
}

export function formatSummary(report, verdict) {
  const lines = [`## 包体审计 ${report.platform}`, '']
  lines.push('| 项 | 大小 |', '|---|---:|')
  for (const installer of report.installers) lines.push(`| 安装包 ${installer.file} | ${formatMB(installer.bytes)} |`)
  lines.push(`| 装完 | ${formatMB(report.installedBytes)} |`, `| app.asar | ${formatMB(report.asar.bytes)} |`, `| app.asar.unpacked | ${formatMB(report.unpacked.bytes)} |`)
  lines.push(`| 语言包（${report.locales.count} 个：${report.locales.names.join(' ')}） | ${formatMB(report.locales.bytes)} |`, '')
  lines.push(`app.asar 按顶层：${report.asar.byTopLevel.map((group) => `${group.name} ${formatMB(group.bytes)}`).join('，')}`, '')
  lines.push(`app.asar 里最大的 ${report.asar.topPackages.length} 个包：`)
  for (const group of report.asar.topPackages) lines.push(`- ${formatMB(group.bytes).padStart(8)} ${group.name}`)
  lines.push('', `app.asar.unpacked：${report.unpacked.byPackage.map((group) => `${group.name} ${formatMB(group.bytes)}`).join('，') || '（空）'}`)
  lines.push('', `随包 npm 包 ${report.packages.length} 个；禁带文件 ${report.forbidden.length} 处；运行时闭包问题 ${report.runtimeClosure.length} 处；ffmpeg/ffprobe 目标 ${report.media.ok ? report.media.target : '有问题'}`)
  if (verdict) {
    lines.push('')
    for (const violation of verdict.violations) lines.push(`- ❌ ${violation}`)
    for (const warning of verdict.warnings) lines.push(`- ⚠️ ${warning}`)
    for (const note of verdict.notes) lines.push(`- ℹ️ ${note}`)
    lines.push('', verdict.violations.length === 0 ? '✅ 没有超预算、没有禁带文件、运行时闭包完整' : `❌ ${verdict.violations.length} 条不通过`)
  }
  return lines.join('\n')
}

/**
 * 用一份报告改基线（只在人显式 --update-baseline 时调用）。
 * 包有毛病不许登记；任何一项预算变大、或名单多出东西，必须带 --allow-growth 理由，记进 history。
 */
export function updateBaseline(budget, report, { allowGrowth = null, now = today() } = {}) {
  const blocking = [
    ...report.forbidden.map((hit) => `禁带文件 ${hit.path}`),
    ...report.runtimeClosure.map((problem) => `运行时闭包 ${problem.from} → ${problem.package}`),
    ...report.media.problems,
  ]
  if (blocking.length > 0) throw new Error(`包本身有问题，不能拿它当基线：\n  ${blocking.slice(0, 20).join('\n  ')}`)
  const headroom = budget.headroomRatio
  if (!(headroom > 0 && headroom <= 0.2)) throw new Error(`headroomRatio 必须在 (0, 0.2]，现在是 ${headroom}`)
  const measured = { installedBytes: report.installedBytes, asarBytes: report.asar.bytes, unpackedBytes: report.unpacked.bytes }
  for (const installer of report.installers) measured[`installer.${installer.kind}`] = installer.bytes
  const next = {
    measuredAt: now,
    baseline: measured,
    budgets: Object.fromEntries(Object.entries(measured).map(([key, bytes]) => [key, Math.ceil(bytes * (1 + headroom))])),
    locales: [...report.locales.names],
    packages: [...report.packages],
  }
  const previous = budget.platforms?.[report.platform]
  const growth = []
  if (previous && !previous.unrecorded) {
    for (const [key, limit] of Object.entries(next.budgets)) {
      if (previous.budgets?.[key] !== undefined && limit > previous.budgets[key]) growth.push(`${key} ${formatMB(previous.budgets[key])} → ${formatMB(limit)}`)
    }
    const added = next.packages.filter((name) => !previous.packages.includes(name))
    if (added.length > 0) growth.push(`新增 npm 包 ${added.join('、')}`)
    const addedLocales = next.locales.filter((name) => !previous.locales.includes(name))
    if (addedLocales.length > 0) growth.push(`新增语言包 ${addedLocales.join('、')}`)
  }
  if (growth.length > 0 && !allowGrowth) {
    throw new Error(`基线只许往小改。这次会变大：\n  ${growth.join('\n  ')}\n确实要放宽，带上 --allow-growth "<为什么>"，理由会记进 history。`)
  }
  const updated = { ...budget, platforms: { ...budget.platforms, [report.platform]: next } }
  if (growth.length > 0) updated.history = [...(budget.history ?? []), { date: now, platform: report.platform, reason: allowGrowth, growth }]
  return { budget: updated, growth }
}

/**
 * 生产依赖闭包里，哪些文件 import 了 moduleName。返回 `<包名>/<包内相对路径>` 列表。
 * 只扫「在 package.json 里声明了它」的包：pnpm 的隔离布局下，没声明的包在开发态就解析不到它，
 * 真 import 了早就在开发态炸了。它自己那个包里的自引用不算。
 */
export function findModuleImporters(moduleName, { rootDir, dependencyNames, resolvePackage = resolveInstalledPackage }) {
  const importers = []
  const visited = new Set()
  const queue = dependencyNames.map((name) => ({ name, from: rootDir }))
  while (queue.length > 0) {
    const { name, from } = queue.shift()
    const installed = resolvePackage(name, from)
    if (!installed || visited.has(installed.dir)) continue
    visited.add(installed.dir)
    const manifest = installed.manifest
    const declared = { ...manifest.peerDependencies, ...manifest.optionalDependencies, ...manifest.dependencies }
    if (moduleName in declared && manifest.name !== moduleName) {
      const stack = ['']
      while (stack.length > 0) {
        const relative = stack.pop()
        for (const entry of fs.readdirSync(path.join(installed.dir, relative), { withFileTypes: true })) {
          const child = relative ? `${relative}/${entry.name}` : entry.name
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules') stack.push(child)
          } else if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) {
            const text = fs.readFileSync(path.join(installed.dir, child), 'utf8')
            if (!text.includes(moduleName)) continue
            const hit = scanModuleReferences(child, text).references.some((reference) => externalPackageOf(reference.specifier) === moduleName)
            if (hit) importers.push(`${manifest.name ?? name}/${child}`)
          }
        }
      }
    }
    for (const child of Object.keys({ ...manifest.optionalDependencies, ...manifest.dependencies })) queue.push({ name: child, from: installed.dir })
  }
  return [...new Set(importers)].sort()
}

/** contracts 里跑：预算文件自身的形状、未登记平台的欠账到期、排除名单与 build.files 对得上。 */
export function checkBudgetFile(budget, packageJson, { now = today(), importersOf = null } = {}) {
  const problems = []
  if (!(budget.headroomRatio > 0 && budget.headroomRatio <= 0.2)) problems.push(`headroomRatio 必须在 (0, 0.2]，现在是 ${budget.headroomRatio}`)
  const platforms = Object.entries(budget.platforms ?? {})
  if (platforms.length === 0) problems.push('platforms 是空的：一个平台都没登记，审计无从比起')
  for (const [key, entry] of platforms) {
    if (entry.unrecorded) {
      if (typeof entry.unrecorded.reason !== 'string' || !entry.unrecorded.reason.trim()) problems.push(`${key}：unrecorded 缺 reason`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.unrecorded.expires ?? '')) problems.push(`${key}：unrecorded.expires 要写 YYYY-MM-DD`)
      else if (entry.unrecorded.expires < now) problems.push(`${key}：基线欠账 ${entry.unrecorded.expires} 到期了——从 desktop-rc 的审计报告登记：node scripts/audit-package.mjs --from-report <报告> --update-baseline`)
      continue
    }
    for (const field of ['installedBytes', 'asarBytes', 'unpackedBytes']) {
      if (!(entry.budgets?.[field] > 0)) problems.push(`${key}：budgets.${field} 缺失或不是正数`)
    }
    for (const field of ['packages', 'locales']) {
      const list = entry[field]
      if (!Array.isArray(list) || list.length === 0) problems.push(`${key}：${field} 必须是非空名单`)
      else if (list.some((item, index) => index > 0 && list[index - 1] >= item)) problems.push(`${key}：${field} 要排序且不重复（人手改的？用 --update-baseline 生成）`)
    }
  }
  const filePatterns = packageJson.build?.files ?? []
  for (const [name, entry] of Object.entries(budget.excludedModules ?? {})) {
    if (typeof entry?.reason !== 'string' || !entry.reason.trim()) problems.push(`excludedModules.${name}：缺 reason`)
    if (!Array.isArray(entry?.evidence) || entry.evidence.length === 0) problems.push(`excludedModules.${name}：缺 evidence`)
    if (!filePatterns.includes(`!**/node_modules/${name}/**`)) problems.push(`excludedModules.${name}：package.json build.files 里没有对应的 "!**/node_modules/${name}/**"——登记与真实排除必须同一份`)
    if (!Array.isArray(entry?.importers)) {
      problems.push(`excludedModules.${name}：缺 importers（生产依赖里 import 它的文件名单，[] 也要写）`)
    } else if (importersOf) {
      // 排除的前提是「谁 import 它、为什么我们走不到」；上游多一处 import，这个前提就得重判。
      const found = importersOf(name)
      const recorded = [...entry.importers].sort()
      if (JSON.stringify(found) !== JSON.stringify(recorded)) {
        problems.push(`excludedModules.${name}：生产依赖里 import 它的文件变了——登记 [${recorded.join('、')}]，现在 [${found.join('、')}]。重看它在我们的运行路径上是否可达，再更新 importers`)
      }
    }
  }
  for (const pattern of filePatterns) {
    const match = /^!\*\*\/node_modules\/(.+)\/\*\*$/.exec(pattern)
    if (match && !budget.excludedModules?.[match[1]]) problems.push(`build.files 排除了 ${match[1]}，但 excludedModules 没登记理由`)
  }
  return problems
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function parseArgs(argv) {
  const options = { input: null, installers: [], report: null, budget: null, updateBaseline: false, allowGrowth: null, fromReport: null, checkBudget: false, platform: null, arch: null, root: DEFAULT_ROOT }
  const value = (index, flag) => {
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} 后面要跟值`)
    return next
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--installer') options.installers.push(path.resolve(value(index++, arg)))
    else if (arg === '--report') options.report = path.resolve(value(index++, arg))
    else if (arg === '--budget') options.budget = path.resolve(value(index++, arg))
    else if (arg === '--from-report') options.fromReport = path.resolve(value(index++, arg))
    else if (arg === '--allow-growth') options.allowGrowth = value(index++, arg)
    else if (arg === '--platform') options.platform = value(index++, arg)
    else if (arg === '--arch') options.arch = value(index++, arg)
    else if (arg === '--root') options.root = path.resolve(value(index++, arg))
    else if (arg === '--update-baseline') options.updateBaseline = true
    else if (arg === '--check-budget') options.checkBudget = true
    else if (arg.startsWith('--')) throw new Error(`不认识的参数：${arg}`)
    else if (options.input === null) options.input = path.resolve(arg)
    else throw new Error(`多给了一个产物路径：${arg}`)
  }
  if (!options.checkBudget && !options.input && !options.fromReport) throw new Error('要给打包产物目录（或 --from-report / --check-budget）')
  if (options.fromReport && !options.updateBaseline) throw new Error('--from-report 只和 --update-baseline 一起用')
  if (options.allowGrowth !== null && !options.updateBaseline) throw new Error('--allow-growth 只和 --update-baseline 一起用')
  return options
}

export function main(argv = process.argv.slice(2), { env = process.env } = {}) {
  const options = parseArgs(argv)
  const budgetPath = options.budget ?? path.join(options.root, BUDGET_FILE)
  const budget = readJson(budgetPath)
  if (options.checkBudget) {
    const packageJson = readJson(path.join(options.root, 'package.json'))
    const dependencyNames = Object.keys(packageJson.dependencies ?? {})
    const problems = checkBudgetFile(budget, packageJson, {
      importersOf: (name) => findModuleImporters(name, { rootDir: options.root, dependencyNames }),
    })
    for (const problem of problems) console.error(`❌ ${problem}`)
    if (problems.length === 0) console.log(`✅ ${BUDGET_FILE} 形状完整，欠账都没到期`)
    return problems.length === 0 ? 0 : 1
  }
  const excluded = new Set(Object.keys(budget.excludedModules ?? {}))
  const report = options.fromReport
    ? readJson(options.fromReport)
    : measurePackage({ input: options.input, installers: options.installers, platform: options.platform ?? undefined, arch: options.arch ?? undefined, excluded })
  if (report.schema !== REPORT_SCHEMA) throw new Error(`报告 schema ${report.schema} 不是 ${REPORT_SCHEMA}`)
  if (options.updateBaseline) {
    const { budget: next, growth } = updateBaseline(budget, report, { allowGrowth: options.allowGrowth })
    writeJson(budgetPath, next)
    console.log(`✅ 已按 ${report.platform} 的实测改写 ${path.relative(options.root, budgetPath)}${growth.length ? `（放宽：${growth.join('；')}）` : ''}`)
    return 0
  }
  const verdict = compareWithBudget(report, budget)
  const summary = formatSummary(report, verdict)
  if (options.report) writeJson(options.report, { ...report, verdict })
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n\n`)
  console.log(summary)
  return verdict.violations.length === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(`❌ audit-package 跑不起来：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
