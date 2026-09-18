#!/usr/bin/env node
/**
 * 「一种身份只有一个比对函数」门岗（C2，2026-09-18）。
 *
 * 为什么要它（审计 `docs/audit/2026-09-17-ownership-lifetime-census.md` §2）：
 * 端口绑定这一种身份，在主进程登记表 / preload / 渲染层各写了一份比对，维度数 13 / **7** / 13。
 * 漏维的那份正好在 **preload**——主进程与渲染层之间那道信任边界，「这条回复是不是发给我的」
 * 靠它答。两份绑定只在 `webContentsId` 上不同（同一个项目、另一个窗口）时它会说「是同一个」。
 * #802「少一个维度」就是这个形状。项目选择身份同理：同一套四维比对在五处逐字抄了五遍。
 *
 * 判据：函数名像比对（`same*` / `matches*` / `is*Same*`）、**函数体里逐字比了 ≥2 个已知身份维度**、
 * 而它不在 owner 模块里 → 红。
 *
 * 出口设计与 C4 一致：**从 owner import 就隐身**。`const sameX = sameOwnerFn` 或
 * `return sameOwnerFn(a, b)` 的函数体里没有维度字面量，扫描器压根看不到它。
 * 想让门岗别红你，办法就是不要再列字段。
 *
 * 用法：node scripts/check-identity-compare.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = path.join(repoRoot, 'scripts', 'identity-compare-baseline.json')
const rel = (file) => path.relative(repoRoot, file).split(path.sep).join('/')

/** 身份 owner 模块：这一族比对**应该**住的地方，它们当然会列字段。 */
const OWNER_MODULES = new Set([
  'electron/shared/surfacePortBinding.ts',
  'electron/shared/projectBinding.ts',
])

/**
 * 已知的身份维度。**不是随便一个字段名**——这些是「认错了就会把另一个项目/窗口/会话
 * 当成自己」的那几个。加维度要连同 owner 的比对函数一起加。
 */
const IDENTITY_DIMENSIONS = new Set([
  'projectId', 'immutableProjectUuid', 'projectGeneration', 'canonicalRootDigest',
  'bindingId', 'surfaceInstanceId', 'portRevision', 'nonce',
  'webContentsId', 'processId', 'frameRoutingId',
])
const COMPARATOR_NAME = /^(same|matches)[A-Z]|^is[A-Z].*Same/

function walk(root, out = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(file, out)
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(file)
  }
  return out
}

const found = []
for (const root of ['src', 'electron']) {
  for (const file of walk(path.join(repoRoot, root))) {
    const name = rel(file)
    if (OWNER_MODULES.has(name)) continue
    const sf = ts.createSourceFile(name, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node) => {
      const fnName = (ts.isFunctionDeclaration(node) && node.name?.text)
        || (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
          && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
          ? node.name.text : null)
      if (fnName && COMPARATOR_NAME.test(fnName)) {
        const dimensions = new Set()
        const scan = (n) => {
          // 只认「逐字比一个身份维度」：`a.projectId === b.projectId` 这种形状。
          if (ts.isBinaryExpression(n)
            && (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
              || n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
            for (const side of [n.left, n.right]) {
              if (ts.isPropertyAccessExpression(side) && IDENTITY_DIMENSIONS.has(side.name.text)) dimensions.add(side.name.text)
              if (ts.isElementAccessExpression(side) && ts.isStringLiteralLike(side.argumentExpression)
                && IDENTITY_DIMENSIONS.has(side.argumentExpression.text)) dimensions.add(side.argumentExpression.text)
            }
          }
          ts.forEachChild(n, scan)
        }
        scan(node)
        if (dimensions.size >= 2) {
          found.push({ site: `${name}::${fnName}`, dimensions: [...dimensions].sort() })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}
found.sort((left, right) => left.site.localeCompare(right.site))

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { registered: [] }
const registered = new Map(baseline.registered.map((entry) => [entry.site, entry]))
const failures = []
for (const entry of found) {
  const known = registered.get(entry.site)
  if (!known) {
    failures.push(`${entry.site}: owner 模块之外又长出一份身份比对（比了 ${entry.dimensions.join(' / ')}）。`
      + `改成 import owner 的那一份；确有独立语义就登记并写明它凭什么是另一种身份。`)
    continue
  }
  if (known.dimensions.join(',') !== entry.dimensions.join(',')) {
    failures.push(`${entry.site}: 登记的维度是 [${known.dimensions.join(' / ')}]，现在比的是 [${entry.dimensions.join(' / ')}]`
      + `——维度漂了就是身份漂了，改回去或重新说明。`)
  }
}
for (const site of registered.keys()) {
  if (!found.some((entry) => entry.site === site)) {
    failures.push(`${site}: 登记在案但已经不存在（收敛掉了就把这条删掉，别让基线替一个不存在的函数背书）`)
  }
}

if (failures.length) {
  console.error('check:identity-compare 失败：\n')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error('\n为什么有这条门岗：docs/audit/2026-09-17-ownership-lifetime-census.md §2 / §6 C2')
  process.exit(1)
}
console.log(`check:identity-compare 通过（owner 之外的身份比对 ${found.length} 处，全部已登记并说明）`)
