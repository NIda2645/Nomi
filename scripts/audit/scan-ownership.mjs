#!/usr/bin/env node
// 所有权 / 寿命普查（R14 周期审计，2026-09-17）。只读，可重跑。
//
// 五维（对应 docs/audit/2026-09-17-ownership-lifetime-census.md 的五张表）：
//   D1 状态 owner：渲染层 zustand store 的数据字段 × 项目会话释放点覆盖；主进程模块级可变单例 × 有没有释放函数
//   D2 身份：identity 比对函数各比了哪些维度
//   D3 写盘到项目外：命中 homedir/userData/宿主客户端配置的写入口（人核触发条件见文档）
//   D4 同一语义多份定义：错误码表副本（含 ≥2 个已知码的字面量集合）
//   D5 模型面 / 用户面：surfacePortFailureAdvice 一族的产出流向 + 渲染层直接渲染 `.message` 的点
//
// 用法：node scripts/audit/scan-ownership.mjs [--json] [--roots=src,electron]
// 判据刻意宁可多数不肯漏数（同 door-map.mjs）：多出来的人一眼划掉，漏掉的正是下一份根因合同。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const asJson = args.includes('--json')
const rootsArg = args.find((a) => a.startsWith('--roots='))
const ROOTS = rootsArg ? rootsArg.slice(8).split(',') : ['src', 'electron']
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts)$/
const SKIP_PATH = /(?:^|\/)(?:node_modules|dist|release|\.tmp|__fixtures__|testSupport|devlab|design)(?:\/|$)/
const TEST_PATH = /\.(?:test|spec|integration\.test)\.[^.]+$|\.node-test\.[cm]?js$|(?:^|\/)(?:tests?|__tests__)(?:\/|$)/

function walk(dir, out = []) {
  const abs = path.join(repoRoot, dir)
  if (!fs.existsSync(abs)) return out
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (SKIP_PATH.test(rel)) continue
    if (entry.isDirectory()) walk(rel, out)
    else if (SOURCE_EXT.test(entry.name) && !TEST_PATH.test(rel)) out.push(rel)
  }
  return out
}
const FILES = ROOTS.flatMap((r) => walk(r))
const srcCache = new Map()
const read = (rel) => {
  if (!srcCache.has(rel)) srcCache.set(rel, fs.readFileSync(path.join(repoRoot, rel), 'utf8'))
  return srcCache.get(rel)
}
const astCache = new Map()
function sourceFile(rel) {
  if (!astCache.has(rel)) {
    const kind = rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    astCache.set(rel, ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, kind))
  }
  return astCache.get(rel)
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

// ---------------------------------------------------------------------------
// D1a 渲染层 zustand store：数据字段 × 释放点覆盖
// ---------------------------------------------------------------------------
const RELEASE_FILE = 'src/workbench/project/releaseWorkbenchProjectSession.ts'
function setStateKeysIn(rel) {
  // 收集 `useXStore.setState({ a, b })` 与 `useXStore.getState().clear()` 两种释放形态
  const sf = sourceFile(rel)
  const byStore = new Map()
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const target = node.expression.expression.getText(sf)
      if (method === 'setState' && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const keys = node.arguments[0].properties.map((p) => p.name?.getText(sf)).filter(Boolean)
        const cur = byStore.get(target) ?? { keys: new Set(), wholeReset: false }
        keys.forEach((k) => cur.keys.add(k))
        byStore.set(target, cur)
      }
      if (/^(clear|reset)[A-Za-z]*$/.test(method) && ts.isCallExpression(node.expression.expression)) {
        const inner = node.expression.expression
        if (ts.isPropertyAccessExpression(inner.expression) && inner.expression.name.text === 'getState') {
          const store = inner.expression.expression.getText(sf)
          const cur = byStore.get(store) ?? { keys: new Set(), wholeReset: false }
          cur.wholeReset = true
          byStore.set(store, cur)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return byStore
}
const releaseKeys = fs.existsSync(path.join(repoRoot, RELEASE_FILE)) ? setStateKeysIn(RELEASE_FILE) : new Map()

function zustandStores() {
  const out = []
  for (const rel of FILES.filter((f) => /from ['"]zustand/.test(read(f)))) {
    const sf = sourceFile(rel)
    const visit = (node) => {
      // `export const useX = create<T>()((set, get) => ({...}))` / `create((set) => ({...}))` / `createStore(...)`
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const text = node.initializer.getText(sf)
        if (/^create(Store)?\b/.test(text.replace(/\s+/g, ' '))) {
          const name = node.name.getText(sf)
          // 找初始化对象字面量：第一个 ObjectLiteral 直接子孙于 arrow body
          let initObj = null
          const findObj = (n) => {
            if (initObj) return
            if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
              const body = n.body
              // 剥掉 `(...)`、`withX({...})` 这类包装，拿到真正的初始化对象
              let inner = body
              while (inner && !ts.isObjectLiteralExpression(inner)) {
                if (ts.isParenthesizedExpression(inner)) inner = inner.expression
                else if (ts.isCallExpression(inner) && inner.arguments[0]) inner = inner.arguments[0]
                else break
              }
              if (inner && ts.isObjectLiteralExpression(inner)) initObj = inner
              else if (ts.isBlock(body)) {
                for (const st of body.statements) if (ts.isReturnStatement(st) && st.expression && ts.isObjectLiteralExpression(st.expression)) initObj = st.expression
              }
              if (initObj) return
            }
            ts.forEachChild(n, findObj)
          }
          findObj(node.initializer)
          const dataFields = []
          const actionFields = []
          const spreads = []
          if (initObj) {
            for (const p of initObj.properties) {
              if (ts.isSpreadAssignment(p)) { spreads.push(p.expression.getText(sf).slice(0, 40)); continue }
              const key = p.name?.getText(sf)
              if (!key) continue
              const init = ts.isPropertyAssignment(p) ? p.initializer : null
              const isFn = ts.isMethodDeclaration(p) || (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)))
              ;(isFn ? actionFields : dataFields).push(key)
            }
          }
          const own = /\b(clear|reset)[A-Za-z]*\s*:\s*\(/.test(read(rel)) || /\b(clear|reset)[A-Za-z]*\(\)\s*\{/.test(read(rel))
          const rk = releaseKeys.get(name)
          const covered = rk ? dataFields.filter((f) => rk.keys.has(f)) : []
          const uncovered = rk ? dataFields.filter((f) => !rk.keys.has(f)) : dataFields
          out.push({
            store: name, file: `${rel}:${lineOf(sf, node)}`, middleware: /persist\(/.test(text) ? 'persist' : /subscribeWithSelector/.test(text) ? 'subscribeWithSelector' : '-',
            dataFields, actions: actionFields.length, spreads,
            releasedAtProjectRelease: rk ? (rk.wholeReset ? 'whole(clear)' : `${covered.length}/${dataFields.length}`) : 'none',
            uncovered: rk?.wholeReset ? [] : uncovered, ownReset: own,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

// ---------------------------------------------------------------------------
// D1b 主进程模块级可变单例
// ---------------------------------------------------------------------------
const CONTAINER_INIT = /^(?:new (?:Map|Set|WeakMap|WeakSet)\b|\[\]$|\{\}$|new Map<|new Set<)/
function moduleSingletons() {
  const out = []
  for (const rel of FILES.filter((f) => f.startsWith('electron/') || /^src\/(desktop|workbench)\//.test(f))) {
    const sf = sourceFile(rel)
    const text = read(rel)
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue
      const isLet = (st.declarationList.flags & ts.NodeFlags.Let) !== 0 || (st.declarationList.flags & ts.NodeFlags.Const) === 0
      for (const d of st.declarationList.declarations) {
        const name = d.name.getText(sf)
        const init = d.initializer ? d.initializer.getText(sf).replace(/\s+/g, ' ') : ''
        const isContainer = CONTAINER_INIT.test(init)
        if (!isLet && !isContainer) continue
        // 跳过 zustand（D1a 已算）与纯常量表
        if (/^create(Store)?\b/.test(init)) continue
        if (!isLet && isContainer && /^(\[\]|\{\})$/.test(init) && /^[A-Z_]+$/.test(name)) continue
        const escaped = name.replace(/[$]/g, '\\$')
        // 写 = 声明之外的重新赋值 / 容器变异调用；声明行本身不算
        const writes = (text.match(new RegExp(`(?<![.\\w])(?<!(?:let|const|var)\\s+)${escaped}\\s*(?:=[^=]|\\.(?:set|add|push|delete|clear|splice|unshift|pop|shift)\\()`, 'g')) || []).length
        if (writes === 0) continue // 没人变异 = 常量表，不是状态
        const exportedResetter = (text.match(/export (?:async )?function (?:reset|dispose|clear|teardown|stop|release|unregister|uninstall)[A-Za-z]*/g) || []).map((m) => m.replace(/export (?:async )?function /, ''))
        const inHandler = /ipcMain\.(?:handle|on)\(|app\.on\(|app\.whenReady/.test(text)
        out.push({ file: `${rel}:${lineOf(sf, d)}`, name, kind: isLet ? 'let' : 'const-container', init: init.slice(0, 40), writes, resetters: exportedResetter, exported: /export/.test(st.getText(sf).slice(0, 12)), ipcFile: inHandler })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// D1c 发布点：exported register*/install*/set*Tools/bind*
// ---------------------------------------------------------------------------
function publishPoints() {
  const out = []
  const NAME = /^(?:register|install|bind|attach|set)[A-Z][A-Za-z]*(?:Surface|Handler|Tools|Port|Registry|Coordinator|Adapter|Factory|Bridge|Listener|Provider)s?$/
  for (const rel of FILES) {
    const sf = sourceFile(rel)
    for (const st of sf.statements) {
      let name = null
      if (ts.isFunctionDeclaration(st) && st.name && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) name = st.name.text
      if (!name || !NAME.test(name)) continue
      const callers = []
      for (const other of FILES) {
        if (other === rel) continue
        const t = read(other)
        const re = new RegExp(`\\b${name}\\s*\\(`, 'g')
        let m
        while ((m = re.exec(t))) callers.push(`${other}:${t.slice(0, m.index).split('\n').length}`)
      }
      // 调用者是否在 React 组件的 useEffect 里（view-scoped 发布）
      const viewScoped = callers.filter((c) => {
        const [f, l] = c.split(':')
        if (!f.endsWith('.tsx')) return false
        const lines = read(f).split('\n')
        for (let j = Number(l) - 1; j >= Math.max(0, Number(l) - 60); j--) if (/useEffect\(|useLayoutEffect\(/.test(lines[j])) return true
        return false
      })
      out.push({ fn: name, file: `${rel}:${lineOf(sf, st)}`, callers: callers.length, viewScopedCallers: viewScoped })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// D2 身份比对函数各比了哪些维度
// ---------------------------------------------------------------------------
const IDENTITY_DIMS = ['bindingId', 'projectId', 'generation', 'webContentsId', 'frameRoutingId', 'portRevision', 'nonce', 'sessionId', 'grantId', 'runId', 'documentId', 'revision', 'windowId', 'launcher', 'command', 'settingsDir', 'invocationId', 'requestId', 'token', 'evidence']
function identityComparators() {
  const out = []
  for (const rel of FILES) {
    const text = read(rel)
    if (!/\b(?:same|isSame|matches|equals|sameAs)[A-Z]/.test(text)) continue
    const sf = sourceFile(rel)
    const visit = (node) => {
      let name = null; let body = null
      if (ts.isFunctionDeclaration(node) && node.name) { name = node.name.text; body = node.body }
      else if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) { name = node.name.getText(sf); body = node.initializer.body }
      if (name && /^(?:same|isSame|matches|equals)[A-Z]/.test(name) && body) {
        const bt = body.getText(sf)
        const dims = IDENTITY_DIMS.filter((d) => new RegExp(`\\b${d}\\b`).test(bt))
        out.push({ fn: name, file: `${rel}:${lineOf(sf, node)}`, dims })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

// ---------------------------------------------------------------------------
// D3 写盘到项目外：候选入口（触发条件的分类在文档里人核）
// ---------------------------------------------------------------------------
// 根：直接 API + 仓库自己的根 helper（getSettingsRoot / capabilityCoreDir 这类都落在 ~/ 或 userData 下）
const OUTSIDE_ROOT = /os\.homedir\(\)|process\.env\.HOME\b|app\.getPath\(['"](?:home|userData|appData|sessionData|logs|temp)['"]\)|safeStorage\.|getSettingsRoot\(|settingsRoot\(\)|resolveSettingsRoot\(|capabilityCoreDir\(|NOMI_SETTINGS_DIR|\.claude\.json|config\.toml|mcp\.json/
const WRITE_CALL = /\b(?:writeFile|writeFileSync|atomicWrite|writeJson|writeJsonFile|writeJsonFileAtomic|writeSettings|rename|renameSync|unlink|unlinkSync|rm|rmSync|mkdir|mkdirSync|appendFile|appendFileSync|copyFile|copyFileSync|encryptString)\s*\(/
function outsideProjectWrites() {
  const out = []
  for (const rel of FILES.filter((f) => f.startsWith('electron/'))) {
    const text = read(rel)
    if (!OUTSIDE_ROOT.test(text)) continue
    const lines = text.split('\n')
    lines.forEach((l, i) => {
      if (WRITE_CALL.test(l) && !/^\s*(\/\/|\*)/.test(l)) out.push({ file: `${rel}:${i + 1}`, call: l.trim().slice(0, 100) })
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// D4 错误码表副本
// ---------------------------------------------------------------------------
const KNOWN_CODES = ['surface_port_stale', 'surface_port_unavailable', 'surface_port_unbound', 'capability_unsupported', 'capability_target_stale', 'capability_input_invalid', 'capability_output_invalid', 'generation_input_invalid', 'generation_execution_failed', 'generation_not_started', 'document_target_stale', 'spend_confirm_surface_unavailable']
function errorCodeTables() {
  const out = []
  for (const rel of FILES) {
    const text = read(rel)
    const hits = KNOWN_CODES.filter((c) => text.includes(`'${c}'`) || text.includes(`"${c}"`))
    if (hits.length < 2) continue
    const sf = sourceFile(rel)
    // 找包含 ≥2 个已知码字面量的「集合」节点：数组字面量 / 联合类型 / new Set / switch
    const visit = (node) => {
      const isSet = ts.isArrayLiteralExpression(node) || ts.isUnionTypeNode(node) || ts.isCaseBlock(node) || ts.isObjectLiteralExpression(node)
      if (isSet) {
        const t = node.getText(sf)
        const members = KNOWN_CODES.filter((c) => t.includes(`'${c}'`) || t.includes(`"${c}"`))
        if (members.length >= 2) {
          out.push({ file: `${rel}:${lineOf(sf, node)}`, shape: ts.SyntaxKind[node.kind], members })
          return // 不再往里数子集合
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

// ---------------------------------------------------------------------------
// D5 模型面 / 用户面
// ---------------------------------------------------------------------------
function modelUserBoundary() {
  const adviceProducers = []
  const rawMessageRenders = []
  for (const rel of FILES) {
    const text = read(rel)
    const lines = text.split('\n')
    lines.forEach((l, i) => {
      if (/surfacePortFailureAdvice\s*\(|Next:\s*\$\{|`Next: /.test(l)) adviceProducers.push(`${rel}:${i + 1}`)
      // 渲染层 JSX 里直接吐 error.message / result.message / detail 文本（不走 t()）
      if (rel.endsWith('.tsx') && /\{[^}]*\b(?:error|err|failure|result|outcome|detail|tool)\w*\.(?:message|advice|text|detail)\b[^}]*\}/.test(l) && !/\bt\(/.test(l)) rawMessageRenders.push(`${rel}:${i + 1}`)
    })
  }
  return { adviceProducers, rawMessageRenders }
}

// ---------------------------------------------------------------------------
const result = {
  base: (() => { try { return fs.readFileSync(path.join(repoRoot, '.git', 'HEAD'), 'utf8').trim() } catch { return '?' } })(),
  filesScanned: FILES.length,
  d1a: zustandStores(),
  d1b: moduleSingletons(),
  d1c: publishPoints(),
  d2: identityComparators(),
  d3: outsideProjectWrites(),
  d4: errorCodeTables(),
  d5: modelUserBoundary(),
}

if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(0) }

const p = (s) => console.log(s)
p(`# scan-ownership · files=${result.filesScanned} roots=${ROOTS.join(',')}`)
p(`\n## D1a zustand stores (${result.d1a.length})  释放点=${RELEASE_FILE}`)
p('| store | file | mw | data | actions | released@project-release | uncovered data fields | own clear/reset |')
p('|---|---|---|---:|---:|---|---|---|')
for (const s of result.d1a) p(`| ${s.store} | ${s.file} | ${s.middleware} | ${s.dataFields.length} | ${s.actions} | ${s.releasedAtProjectRelease} | ${s.uncovered.join(', ') || '—'} | ${s.ownReset ? 'yes' : 'no'} |`)
const single = result.d1b
p(`\n## D1b module-level mutable singletons (${single.length}; let=${single.filter((s) => s.kind === 'let').length}, containers=${single.filter((s) => s.kind !== 'let').length}; with in-file resetter=${single.filter((s) => s.resetters.length).length}; without=${single.filter((s) => !s.resetters.length).length})`)
const byDir = {}
for (const s of single) { const parts = s.file.split(':')[0].split('/'); const d = parts.length > 2 ? parts.slice(0, 2).join('/') : `${parts[0]}/(root)`; byDir[d] = byDir[d] || { n: 0, noReset: 0, mutated: 0 }; byDir[d].n++; if (s.writes > 0) byDir[d].mutated++; if (!s.resetters.length) byDir[d].noReset++ }
p('| dir | singletons | mutated in-file | without resetter |'); p('|---|---:|---:|---:|')
for (const [d, v] of Object.entries(byDir).sort((a, b) => b[1].n - a[1].n)) p(`| ${d} | ${v.n} | ${v.mutated} | ${v.noReset} |`)
p(`\n## D1c publish points (${result.d1c.length}; view-scoped callers=${result.d1c.filter((x) => x.viewScopedCallers.length).length})`)
p('| fn | file | callers | view-scoped callers |'); p('|---|---|---:|---|')
for (const x of result.d1c) p(`| ${x.fn} | ${x.file} | ${x.callers} | ${x.viewScopedCallers.join(', ') || '—'} |`)
p(`\n## D2 identity comparators (${result.d2.length})`)
p('| fn | file | dims compared |'); p('|---|---|---|')
for (const x of result.d2) p(`| ${x.fn} | ${x.file} | ${x.dims.join(', ') || '(none of the known dims)'} |`)
p(`\n## D3 out-of-project write candidates (${result.d3.length} sites in ${new Set(result.d3.map((x) => x.file.split(':')[0])).size} files)`)
for (const x of result.d3) p(`- ${x.file}  ${x.call}`)
p(`\n## D4 error-code set literals (${result.d4.length} sets in ${new Set(result.d4.map((x) => x.file.split(':')[0])).size} files)`)
p('| file | shape | members |'); p('|---|---|---|')
for (const x of result.d4) p(`| ${x.file} | ${x.shape} | ${x.members.join(', ')} |`)
p(`\n## D5 model/user boundary: advice producers=${result.d5.adviceProducers.length}, raw message renders in .tsx=${result.d5.rawMessageRenders.length}`)
for (const x of result.d5.adviceProducers) p(`- advice: ${x}`)
for (const x of result.d5.rawMessageRenders) p(`- raw-render: ${x}`)
