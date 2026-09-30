// 全功能走查的跑法（唯一入口）：node tests/ux/full-walk/run.mjs [--only pb01,pb02] [--locale zh-CN|en]
//
// 按「剧本 × 变体」逐个起子进程（沿用 canvas-real-suite 的 runCanvasScenario：超时、日志、失败摘要同一套，同 core-smoke），
// 每一场的监视器报告落在 tests/ux/shots/full-walk/<这一次>/<剧本>--<变体>--<语言>/，跑完汇总成
// tests/ux/full-walk/reports/<日期>-<版本>.md 与同名 .json：每条铁律几次违反、归到哪个模块、哪个底层设计问题，
// 用户报过的问题这一次有没有复现，以及功能状态表（catalog.mjs）的当前一版。
//
// 规矩：
//   · 付费剧本只在 NOMI_SPEND_OK=1 时跑，否则记「跳过（付费）」，报告里单列；
//   · 退出码：0 = 全部走通且零违反；1 = 有违反（红）；2 = 有剧本没走通（走查故障，比红更要紧：它的「没违反」不作数）；
//   · 目前只跑开发构建（监视器的出网闸要 `-r` 预载进主进程，打包版不接受）；--packaged 明确拒绝，不假装支持。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runCanvasScenario } from '../canvas-real-suite.mjs'
import { FULL_WALK_INVENTORY, FULL_WALK_JOURNEYS, FULL_WALK_PLAYBOOKS } from './catalog.mjs'
import { INVARIANTS, loadLimits } from './invariants.mjs'
import { DESIGN_ROOTS, rootOfRule } from './rules.mjs'
import { USER_REPORTED_ISSUES } from './userReports.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const PLAYBOOK_TIMEOUT_MS = 40 * 60_000

export function parseFullWalkArgv(argv) {
  const options = { only: null, locale: null, reportOnly: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--only') options.only = String(argv[++index] ?? '').split(',').map((value) => value.trim()).filter(Boolean)
    else if (arg === '--locale') options.locale = argv[++index]
    // 不重跑，只拿已有的一次（tests/ux/shots/full-walk/<时间>）重出报告——目录或回归表改了之后用。
    else if (arg === '--report-only') options.reportOnly = argv[++index]
    else if (arg === '--packaged') throw new Error('全功能走查的监视器要在主进程里预载出网闸（`-r`），打包版不接受——现在只跑开发构建（pnpm run build 之后）')
    else throw new Error(`不认识的参数：${arg}（用法：[--only pb01,pb02] [--locale zh-CN|en]）`)
  }
  if (options.locale && !['zh-CN', 'en'].includes(options.locale)) throw new Error(`--locale 只能是 zh-CN 或 en，收到 ${options.locale}`)
  return options
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}

function git(args) {
  try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim() } catch { return 'unknown' }
}

/**
 * 这一次跑的是哪一版代码：走查代码的 HEAD、产品代码（它与 origin/main 的 merge-base）、工作区干不干净。
 * 开跑时落进证据目录；`--report-only` 读回它，而不是拿「出报告那一刻」的 HEAD 给一份旧证据署名。
 */
function captureRunMeta(version) {
  return {
    head: git(['rev-parse', '--short=9', 'HEAD']),
    productBase: git(['merge-base', 'HEAD', 'origin/main']).slice(0, 9),
    dirty: git(['status', '--porcelain', '--untracked-files=no']) !== '',
    version,
    startedAt: new Date().toISOString(),
  }
}

/** 把「剧本 × 变体」展开成一次次运行。 */
export function expandFullWalkRuns({ only = null, locale = null, spendOk = false } = {}) {
  return FULL_WALK_PLAYBOOKS
    .filter((playbook) => !only || only.some((prefix) => playbook.id.startsWith(prefix)))
    .flatMap((playbook) => playbook.variants
      .filter((variant) => !locale || variant.locale === locale)
      .map((variant) => ({
        id: `${playbook.id}--${variant.id}--${variant.locale}`, playbookId: playbook.id, variantId: variant.id, locale: variant.locale,
        script: playbook.script, paid: playbook.paid, skip: playbook.paid && !spendOk ? '付费（没设 NOMI_SPEND_OK=1）' : null,
      })))
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

export function runFullWalk({ only = null, locale = null, reportOnly = null, env = process.env } = {}) {
  const runStamp = reportOnly ?? stamp()
  const runDir = path.join(repoRoot, 'tests', 'ux', 'shots', 'full-walk', runStamp)
  if (reportOnly && !fs.existsSync(runDir)) throw new Error(`--report-only：找不到 ${path.relative(repoRoot, runDir)}`)
  fs.mkdirSync(runDir, { recursive: true })
  const metaFile = path.join(runDir, 'run-meta.json')
  const meta = reportOnly ? readJson(metaFile) : captureRunMeta(JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version)
  if (!meta) throw new Error(`--report-only：${path.relative(repoRoot, metaFile)} 不在——不知道这份证据是哪一版代码跑出来的，不出报告`)
  if (!reportOnly) fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  const { version, head } = meta
  const runs = expandFullWalkRuns({ only, locale, spendOk: env.NOMI_SPEND_OK === '1' })
  const results = []
  for (const run of runs) {
    if (run.skip) { results.push({ ...run, status: 'skipped', reason: run.skip }); continue }
    if (reportOnly) {
      const dir = path.join(runDir, run.id)
      const report = readJson(path.join(dir, 'monitor-report.json'))
      const result = readJson(path.join(dir, 'result.json'))
      if (!report) {
        // 有日志没报告 = 跑了、中途没了（被掐 / 崩了）：那是走查故障，不是「没跑」。
        const ran = fs.existsSync(path.join(runDir, `${run.id}.log`))
        results.push(ran ? { ...run, status: 'broken', dir } : { ...run, status: 'skipped', reason: '这一次没跑它' })
        continue
      }
      const exitCode = result?.exitCode ?? 2
      results.push({ ...run, status: exitCode === 0 ? 'clean' : exitCode === 1 ? 'red' : 'broken', exitCode, durationMs: report.durationMs, dir, report })
      continue
    }
    console.log(`\n[full-walk] ▶▶ ${run.id}`)
    const outcome = runCanvasScenario({ id: run.id, script: run.script, timeoutMs: PLAYBOOK_TIMEOUT_MS }, {
      cwd: repoRoot, outputDir: runDir,
      env: { ...env, NOMI_FULL_WALK_VARIANT: run.variantId, NOMI_FULL_WALK_LOCALE: run.locale, NOMI_FULL_WALK_RUN_DIR: runDir },
    })
    const dir = path.join(runDir, run.id)
    const report = readJson(path.join(dir, 'monitor-report.json'))
    // 被跑器按总超时掐掉（那时退出码也是 1）、或者没留下监视器报告：它的「没违反」不作数，一律算走查故障，不能当成「有违反」。
    const status = outcome.timedOut || !report ? 'broken' : outcome.exitCode === 0 ? 'clean' : outcome.exitCode === 1 ? 'red' : 'broken'
    results.push({ ...run, status, exitCode: outcome.exitCode, timedOut: Boolean(outcome.timedOut), durationMs: outcome.durationMs, logPath: outcome.logPath, dir, report, failureSummary: outcome.failureSummary })
  }
  const summary = summarize({ results, meta, runStamp, runDir, reportedBy: git(['rev-parse', '--short=9', 'HEAD']) })
  const reportsDir = path.join(repoRoot, 'tests', 'ux', 'full-walk', 'reports')
  fs.mkdirSync(reportsDir, { recursive: true })
  const base = `${runStamp.slice(0, 8)}-${version}-${head}`
  fs.writeFileSync(path.join(reportsDir, `${base}.json`), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(reportsDir, `${base}.md`), renderMarkdown(summary))
  console.log(`\n[full-walk] 报告：tests/ux/full-walk/reports/${base}.md`)
  return summary
}

const rel = (file) => (file ? path.relative(repoRoot, file).split(path.sep).join('/') : null)

export function summarize({ results, meta, runStamp, runDir, reportedBy = null }) {
  const { version, head, productBase, dirty, note = null } = meta
  const violations = results.flatMap((result) => (result.report?.violations ?? []).map((violation) => {
    // 归类是规则的属性（rules.mjs），不是观测：按当前登记重算——人复核改了登记，重出报告就跟着变，不用重跑。
    const assigned = rootOfRule(violation.rule)
    return {
      ...violation, run: result.id,
      ...(assigned ? { designRoot: assigned.root, designRootText: DESIGN_ROOTS[assigned.root], cluster: assigned.cluster } : {}),
      evidence: { screenshot: rel(violation.evidence?.screenshot), snapshot: rel(violation.evidence?.snapshot) },
    }
  }))
  const rootsOf = (rules) => [...new Set(rules.map((rule) => rootOfRule(rule)?.root).filter(Boolean))].sort()
  const hitRules = (playbookId) => new Set(violations.filter((violation) => violation.playbook === playbookId).map((violation) => violation.rule))
  // 「没复现」只在那条剧本真走通过（有监视器报告）时才算数；只剩走查故障的剧本，它的「没抓到」什么也说明不了。
  const sound = new Set(results.filter((result) => result.status === 'clean' || result.status === 'red').map((result) => result.playbookId))
  const broken = new Set(results.filter((result) => result.status === 'broken').map((result) => result.playbookId))
  const userIssues = USER_REPORTED_ISSUES.map((issue) => {
    const inPlaybook = violations.filter((violation) => violation.playbook === issue.playbook && issue.rules.includes(violation.rule))
    // 它该被抓到的那条剧本没触发、别的剧本触发了同一条规则：如实标「别处复现」，证据指向那条剧本。
    const elsewhere = inPlaybook.length ? [] : violations.filter((violation) => issue.rules.includes(violation.rule))
    const matched = inPlaybook.length ? inPlaybook : elsewhere
    return {
      ...issue,
      status: inPlaybook.length ? 'reproduced' : elsewhere.length ? 'reproduced-elsewhere' : issue.notYet ? 'not-yet'
        : sound.has(issue.playbook) ? 'not-reproduced' : broken.has(issue.playbook) ? 'playbook-broken' : 'not-run',
      evidence: matched.map((violation) => ({ run: violation.run, invariant: violation.invariant, rule: violation.rule, module: violation.module, screenshot: violation.evidence.screenshot, snapshot: violation.evidence.snapshot, message: violation.message })),
      rulesHitInPlaybook: [...hitRules(issue.playbook)],
      // 复现了按真正触发的规则归；没复现按它登记的规则归。
      roots: rootsOf(matched.length ? matched.map((violation) => violation.rule) : issue.rules),
    }
  })
  const limits = loadLimits()
  return {
    generatedAt: new Date().toISOString(), reportedBy, version, head, productBase, dirty, note, runStamp, runDir: rel(runDir), platform: process.platform,
    invariants: INVARIANTS.map((invariant) => ({ id: invariant.id, title: invariant.title['zh-CN'], how: invariant.how,
      product: violations.filter((violation) => violation.invariant === invariant.id && violation.kind !== 'harness').length,
      harness: violations.filter((violation) => violation.invariant === invariant.id && violation.kind === 'harness').length })),
    limits: Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, { source: value.source, ...(typeof value.value === 'number' ? { value: value.value } : {}) }])),
    runs: results.map(({ report, ...result }) => ({
      ...result, dir: rel(result.dir),
      steps: report ? `${report.steps.filter((step) => step.ok).length}/${report.steps.length}` : null,
      failedSteps: report ? report.steps.filter((step) => !step.ok).map((step) => ({ label: step.label, error: String(step.error ?? '').split('\n')[0].slice(0, 200), shot: rel(step.failShot) })) : [],
      violations: report?.violations?.length ?? null,
      tokenTurns: report?.tokenTurns ?? [],
      probeSeen: report?.probeSeen ?? null,
      egress: report?.egress ?? null,
    })),
    violations,
    userIssues,
    designRoots: Object.entries(DESIGN_ROOTS).map(([id, text]) => ({ id, text, count: violations.filter((violation) => violation.designRoot === id && violation.kind !== 'harness').length })),
    journeys: FULL_WALK_JOURNEYS,
    inventory: FULL_WALK_INVENTORY,
  }
}

const md = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function renderMarkdown(summary) {
  const lines = []
  lines.push(`# 全功能走查报告 · ${summary.runStamp} · v${summary.version}（${summary.head}）`, '')
  lines.push(`产品代码 = origin/main \`${summary.productBase}\` · 走查代码 \`${summary.head}\`${summary.dirty ? '（**跑的时候工作区有未提交改动**）' : ''}${summary.reportedBy && summary.reportedBy !== summary.head ? ` · 报告由 \`${summary.reportedBy}\` 重出（归类按那一版的 rules.mjs）` : ''} · 开发构建 · ${summary.platform} · 证据目录 \`${summary.runDir}\`（不进 git，截图与快照在那里）`, '')
  if (summary.note) lines.push(`> ${summary.note}`, '')
  lines.push('## 剧本', '', '| 剧本 × 变体 | 结果 | 步骤走通 | 违反 | 观察者看见（转圈 / 面变化 / 真实输入） | 说明 |', '|---|---|---|---|---|---|')
  for (const run of summary.runs) {
    const note = run.status === 'skipped' ? run.reason
      : run.timedOut ? `跑器总超时（${Math.round(PLAYBOOK_TIMEOUT_MS / 60_000)} 分钟）掐掉，没有监视器报告`
        : run.steps === null ? '没有监视器报告（进程中途没了）'
          : run.failedSteps.map((step) => `没走通：${step.label}`).join('；')
    const seen = run.probeSeen ? `${run.probeSeen.spinners.length} / ${run.probeSeen.surfaceChanges} / ${run.probeSeen.trustedInputs}` : '—'
    lines.push(`| ${run.id} | ${{ clean: '✓ 零违反', red: '✖ 有违反', broken: '⚠ 走查故障', skipped: '跳过' }[run.status]} | ${run.steps ?? '—'} | ${run.violations ?? '—'} | ${seen} | ${md(note)} |`)
  }
  lines.push('', '## 九条铁律', '', '| # | 铁律 | 产品违反 | 隔离漏网 | 监视器怎么核对 |', '|---|---|---|---|---|')
  for (const invariant of summary.invariants) lines.push(`| ${invariant.id} | ${invariant.title} | ${invariant.product} | ${invariant.harness} | ${md(invariant.how)} |`)
  lines.push('', '上限 / 时限全部读自登记处：', '')
  for (const [key, value] of Object.entries(summary.limits)) lines.push(`- \`${key}\`${value.value !== undefined ? ` = ${value.value}` : ''} ← ${value.source}`)
  lines.push('', '## 用户报的问题 → 这一次复现了没有', '', '| # | 问题 | 结果 | 铁律 · 规则 | 模块 | 证据 | 底层设计问题 |', '|---|---|---|---|---|---|---|')
  for (const issue of summary.userIssues) {
    const status = { reproduced: '✖ 复现', 'reproduced-elsewhere': `✖ 别处复现（${[...new Set(issue.evidence.map((item) => item.run))].join('、')}）`, 'not-reproduced': '○ 没复现', 'playbook-broken': '⚠ 剧本没走通，不作数', 'not-yet': '… 下一批', 'not-run': '— 没跑' }[issue.status]
    const first = issue.evidence[0]
    lines.push(`| ${issue.id} | ${md(issue.text)} | ${status} | ${first ? issue.evidence.map((item) => `${item.invariant} · ${item.rule}`).filter((value, index, all) => all.indexOf(value) === index).join('；') : md(issue.notYet ?? '')} | ${md(first?.module ?? '')} | ${first ? `\`${first.screenshot}\`` : ''} | ${issue.roots.map((root) => `${root} ${DESIGN_ROOTS[root]}`).join('；')} |`)
  }
  lines.push('', '## 归到底层设计问题（监视器初判，人再复核）', '', '| 底层设计问题 | 产品违反条数 | 涉及的规则 |', '|---|---|---|')
  for (const root of summary.designRoots) {
    const rules = [...new Set(summary.violations.filter((violation) => violation.designRoot === root.id && violation.kind !== 'harness').map((violation) => `${violation.invariant} · ${violation.rule}`))]
    lines.push(`| ${root.id} ${root.text} | ${root.count} | ${md(rules.join('；'))} |`)
  }
  lines.push('', '## 全部违反（按铁律）', '')
  for (const invariant of summary.invariants) {
    const list = summary.violations.filter((violation) => violation.invariant === invariant.id)
    if (!list.length) continue
    lines.push(`### 铁律 ${invariant.id} · ${invariant.title}（${list.length}）`, '', '| 剧本 · 步骤 | 规则 | 说了什么 | 模块 | 底层设计问题 | 证据 |', '|---|---|---|---|---|---|')
    for (const violation of list) {
      lines.push(`| ${md(violation.run)} · ${md(violation.step)} | ${violation.kind === 'harness' ? '（隔离）' : ''}${violation.rule} | ${md(violation.message)} | ${md(violation.module)} | ${violation.designRoot ?? ''} ${violation.cluster ?? ''} | \`${violation.evidence.screenshot}\` · \`${violation.evidence.snapshot}\` |`)
    }
    lines.push('')
  }
  const tokenRuns = summary.runs.filter((run) => run.tokenTurns?.length)
  if (tokenRuns.length) {
    lines.push('## Agent 每回合输入 token（从 Agent 转录的用量记录读）', '', '| 剧本 | 回合（用户那句话开头） | 模型请求次数 | 输入合计 | 单次最大 |', '|---|---|---|---|---|')
    for (const run of tokenRuns) for (const turn of run.tokenTurns) lines.push(`| ${run.id} | ${md(turn.prompt)} | ${turn.requests} | ${turn.inputSum} | ${turn.maxInput} |`)
    lines.push('')
  }
  lines.push('## 功能状态表（第一版 · 十条旅程）', '', '每行一个状态：用户看到的字（i18n key）· 这时能做的动作 · 代码里谁决定它 · 非终态最长等多久（登记处 / 等用户 / gap）。', '')
  for (const journey of summary.journeys) {
    const metric = journey.metric.gap ? `gap：${journey.metric.gap}` : `${journey.metric.success} / ${journey.metric.failure}`
    lines.push(`### ${journey.id} · ${journey.title['zh-CN']}`, '', `剧本：${journey.scripts.map((script) => `\`${script}\``).join('、')} · 铁律 ${journey.invariants.join(', ')} · 上报：${md(metric)}`, '',
      '| 状态 | 种类 | 用户看到的字 | 能做的动作 | owner | 最长等多久 |', '|---|---|---|---|---|---|')
    for (const state of journey.states) {
      const deadline = state.kind === 'terminal' ? '（终态）' : state.deadline?.waitsFor ? '等用户' : state.deadline?.gap ? `**gap**：${state.deadline.gap}` : `${state.deadline?.ref}${state.deadline?.key ? ` · ${state.deadline.key}` : ''}`
      lines.push(`| ${state.id} | ${state.kind} | ${md(state.visibleText.map((key) => `\`${key}\``).join(' '))} | ${md(state.actions.join('、'))} | \`${state.owner}\` | ${md(deadline)} |`)
    }
    lines.push('')
  }
  lines.push('## 功能清单里还没长成旅程的条目', '', '| # | 功能 | 挂在哪 / 缺什么 |', '|---|---|---|')
  for (const item of summary.inventory) lines.push(`| ${item.id} | ${md(item.title)} | ${item.journey ? `→ ${item.journey}` : `gap：${md(item.gap)}`} |`)
  lines.push('')
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseFullWalkArgv(process.argv.slice(2))
    const summary = runFullWalk(options)
    const broken = summary.runs.some((run) => run.status === 'broken')
    const red = summary.violations.length > 0
    console.log(`\nfull-walk：${summary.runs.length} 场 · ${summary.violations.length} 条违反${broken ? ' · 有剧本没走通' : ''}`)
    process.exit(broken ? 2 : red ? 1 : 0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(2)
  }
}
