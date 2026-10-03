#!/usr/bin/env node
// 规则登记表门岗（2026-10-02，取代旧的「编号别名表」解析）。正本是 docs/engineering/rules.json，守五件事：
//   ① 家规面里出现的任何 R# / 旧号都解析得到一条规则（id、aliases 或 reserved）——合并规则的代价是引用悬空，
//      查不到的规则等于不存在；
//   ② 每条规则字段齐全；
//   ③ enforcement 只有 manual 的规则，level 必须是 suggestion（没有执行点的只能算建议）；
//   ④ 加一删二：比 origin/main 新增的规则必须带 replaces，列出至少 2 个已经删掉（不再是规则 id）的旧号；
//   ⑤ 视图 rules.md 和正本一致。
// 不扫 docs/plan、docs/research、docs/audit、docs/lessons、docs/fixes 这些带日期的历史记录：它们写的是当时的编号。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderView, RULES_JSON, RULES_VIEW } from './gen-rules-view.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 家规面：这些文件是「现在照着做」的，不是历史记录。 */
const SCANNED = [
  'CLAUDE.md',
  'AGENTS.md',
  'docs/engineering-rules.md',
  RULES_VIEW,
  'docs/lessons/INDEX.md',
  'docs/engineering/acceptance-walkthrough-doctrine.md',
  'docs/engineering/agent-orchestration-playbook.md',
  'docs/engineering/design-card.md',
  'scripts/claude-hooks/self-check.sh',
  'scripts/claude-hooks/completion-check.sh',
  'scripts/claude-hooks/model-doc-check.sh',
]

const REQUIRED = ['id', 'aliases', 'rule', 'disease', 'enforcement', 'evidence', 'owner', 'review_on', 'delete_when', 'level']
const LEVELS = new Set(['always', 'l2', 'suggestion'])
const ENFORCEMENT_PREFIX = /^(hook|gate|template|skill|coordinator-tool):\S|^manual$/

export function buildIndex(data) {
  const index = new Map()
  const errors = []
  const put = (key, id, kind) => {
    if (index.has(key) && index.get(key) !== id) errors.push(`${kind} ${key} 同时属于 ${index.get(key)} 和 ${id}`)
    index.set(key, id)
  }
  for (const r of data.rules ?? []) {
    put(r.id, r.id, '编号')
    for (const a of r.aliases ?? []) put(a, r.id, '旧号')
  }
  return { index, errors }
}

export function evaluate({ data, baseData = null, viewText = null, references = [], checkExists = null }) {
  const { index, errors } = buildIndex(data)
  const reserved = new Set(Object.keys(data.reserved ?? {}))
  const ids = new Set((data.rules ?? []).map((r) => r.id))

  // ② 字段齐全 + ③ 只有 manual 的必须是建议档
  for (const r of data.rules ?? []) {
    for (const f of REQUIRED) {
      const v = r[f]
      const empty = v === undefined || v === null || v === '' || (f === 'enforcement' && (!Array.isArray(v) || v.length === 0))
      if (empty && f !== 'aliases') errors.push(`规则 ${r.id ?? '(无 id)'} 缺字段 ${f}`)
    }
    if (!Array.isArray(r.aliases)) errors.push(`规则 ${r.id} 的 aliases 必须是数组（可为空）`)
    if (r.level && !LEVELS.has(r.level)) errors.push(`规则 ${r.id} 的 level 只能是 always / l2 / suggestion，现在是 ${r.level}`)
    const enf = Array.isArray(r.enforcement) ? r.enforcement : []
    for (const e of enf) if (!ENFORCEMENT_PREFIX.test(e)) errors.push(`规则 ${r.id} 的执行点 ${e} 不是 hook: / gate: / template: / skill: / coordinator-tool: / manual`)
    if (r.kind !== undefined && r.kind !== 'principle') errors.push(`规则 ${r.id} 的 kind 只能是 principle（或不写），现在是 ${r.kind}`)
    if (r.kind === 'principle' && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.decided_on ?? ''))) {
      errors.push(`规则 ${r.id} 是 principle，必须带 decided_on（用户拍板日期，YYYY-MM-DD）`)
    }
    // 只有 manual 的规则只能是建议档——唯一例外是用户亲自拍板常驻的判断原则（kind: principle），它必须写明拍板日期
    if (enf.length > 0 && enf.every((e) => e === 'manual') && r.level !== 'suggestion' && r.kind !== 'principle') {
      errors.push(`规则 ${r.id} 的执行点只有 manual，level 必须是 suggestion（现在是 ${r.level}）；用户拍板常驻的判断原则要标 kind: principle 并写 decided_on`)
    }
    // 执行点必须真的存在（登记不是防线）
    if (checkExists) for (const e of enf) { const problem = checkExists(e); if (problem) errors.push(`规则 ${r.id} 的执行点 ${e} 不存在：${problem}`) }
  }

  // ④ 加一删二
  if (baseData) {
    const baseIds = new Set((baseData.rules ?? []).map((r) => r.id))
    // origin/main 上真实存在过的号（id 与旧号）：replaces 只能列这里面的，编造的号（从来没存在过）不算删过
    const baseKnown = new Set((baseData.rules ?? []).flatMap((r) => [r.id, ...(r.aliases ?? [])]))
    for (const r of data.rules ?? []) {
      if (baseIds.has(r.id)) continue
      const replaces = Array.isArray(r.replaces) ? r.replaces : []
      const real = [...new Set(replaces)].filter((old) => baseKnown.has(old) && !ids.has(old))
      if (real.length < 2) {
        const fake = replaces.filter((old) => !baseKnown.has(old))
        errors.push(`新增规则 ${r.id}（origin/main 上没有）必须带 replaces，列出至少 2 个 origin/main 上真实存在过、本次已删掉的号，现在只有 ${real.length} 个${fake.length > 0 ? `（${fake.join('、')} 在 origin/main 上从来没存在过）` : ''}`)
      }
    }
  }
  for (const r of data.rules ?? []) {
    for (const old of r.replaces ?? []) {
      if (ids.has(old)) errors.push(`规则 ${r.id} 的 replaces 里 ${old} 仍是规则 id——没删掉就不算替换`)
      else if (index.get(old) !== r.id) errors.push(`规则 ${r.id} 的 replaces 里 ${old} 没写进它的 aliases（删掉的号要能解析到它）`)
    }
  }

  // ⑤ 视图一致
  if (viewText !== null && viewText !== renderView(data)) {
    errors.push(`${RULES_VIEW} 和 ${RULES_JSON} 不一致——跑 node scripts/gen-rules-view.mjs`)
  }

  // ① 引用都解析得到
  for (const { file, line, token } of references) {
    if (!index.has(token) && !reserved.has(token)) {
      errors.push(`${file}:${line} 引用了 ${token}，它不是 ${RULES_JSON} 里任何规则的 id 或旧号（合并规则时漏写 aliases，或写错了号）`)
    }
  }
  return errors
}

export function collectReferences(readFile, files = SCANNED) {
  const refs = []
  for (const file of files) {
    const text = readFile(file)
    if (text === null) continue
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\bR(\d{1,2})(\.\d+)?\b/g)) {
        refs.push({ file, line: i + 1, token: `R${m[1]}${m[2] ?? ''}` })
      }
    })
  }
  return refs
}

/** 执行点是否真的存在。返回 null = 在；否则返回原因。括号里的说明不参与判断。 */
export function makeEnforcementChecker({ scripts, exists }) {
  const hasScript = (name) => Object.hasOwn(scripts, name)
  return (entry) => {
    if (entry === 'manual') return null
    const m = /^(hook|gate|template|skill|coordinator-tool):([^(（]+)/.exec(entry)
    if (!m) return null
    const kind = m[1]
    const target = m[2].trim()
    const isPath = target.includes('/') || /\.(?:mjs|cjs|js|ts|sh|md|json)$/.test(target)
    if (kind === 'hook') return exists(`scripts/claude-hooks/${target}.sh`) ? null : `没有 scripts/claude-hooks/${target}.sh`
    if (kind === 'skill') return ['.agents/skills', 'agent-skills', 'skills'].some((dir) => exists(`${dir}/${target}/SKILL.md`)) ? null : '没有这个技能（.agents/skills、agent-skills、skills 下都没有 SKILL.md）'
    if (kind === 'template') return exists(target) ? null : `没有文件 ${target}`
    // gate / coordinator-tool：文件路径，或 package.json 里的脚本名
    if (isPath) return exists(target) ? null : `没有文件 ${target}`
    return hasScript(target) ? null : `package.json 里没有脚本 ${target}`
  }
}

/** origin/main 上的 rules.json；读不到（浅克隆、首次引入）就返回 null，④ 跳过。 */
export function readBaseRules(cwd = repoRoot) {
  for (const ref of ['origin/main', 'main']) {
    try {
      const text = execFileSync('git', ['show', `${ref}:${RULES_JSON}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      return JSON.parse(text)
    } catch {
      /* 试下一个 */
    }
  }
  return null
}

function main() {
  const read = (file) => {
    const full = path.join(repoRoot, file)
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null
  }
  const raw = read(RULES_JSON)
  if (raw === null) {
    console.error(`✖ 读不到 ${RULES_JSON}`)
    process.exit(1)
  }
  const data = JSON.parse(raw)
  const references = collectReferences(read)
  const baseData = readBaseRules()
  const pkg = JSON.parse(read('package.json') ?? '{}')
  const checkExists = makeEnforcementChecker({ scripts: pkg.scripts ?? {}, exists: (p) => fs.existsSync(path.join(repoRoot, p)) })
  const errors = evaluate({ data, baseData, viewText: read(RULES_VIEW) ?? '', references, checkExists })
  if (errors.length > 0) {
    console.error(`\n✖ check:rule-aliases 红了（${errors.length} 条）：`)
    for (const e of [...new Set(errors)]) console.error(`  - ${e}`)
    console.error(`\n合并规则时的规矩：旧号写进新规则的 aliases；新增规则要 replaces 至少 2 个已删的号；改完跑 node scripts/gen-rules-view.mjs。`)
    process.exit(1)
  }
  const aliasCount = [...buildIndex(data).index.keys()].length - data.rules.length
  console.log(
    `✔ check:rule-aliases：${data.rules.length} 条规则、${aliasCount} 个旧号，${references.length} 处引用全部解析得到${baseData ? '' : '（origin/main 上还没有 rules.json，加一删二跳过）'}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
