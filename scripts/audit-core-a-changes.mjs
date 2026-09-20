#!/usr/bin/env node
// Task-local evidence collector. Validation still belongs to the existing system stages.
import fs from 'node:fs'
import process from 'node:process'
import console from 'node:console'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { sourceIdentity } from './package-build-stamp.mjs'
import { parseNameStatusZ } from './run-gates-tests.mjs'
import { STAGES } from '../tests/system/profiles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stageIds = ['matrix', 'contracts', 'unit', 'build', 'e2e', 'canvas-full', 'canvas-performance', 'journeys-ci', 'real-user-journeys']
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const isTest = file => /(?:^|\/)(?:tests|__tests__)\/|\.(?:test|spec|node-test|e2e|walk|paid)\./.test(file)
const isPolicy = file => /(?:^|\/)(?:AGENTS|CLAUDE)\.md$|(?:baseline|budget|validation-policy|playwright\.config|vitest\.config|check-|gates|package\.json|pnpm-lock|\.github\/)/.test(file)
const escapeCell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')

export function captureChanges(cwd, baseRef, outputDir) {
  const identity = sourceIdentity(cwd)
  const base = git(['merge-base', baseRef, identity.head], cwd).trim()
  // --no-renames makes both sides of a rename reviewable and avoids losing the old path.
  const entries = parseNameStatusZ(git(['diff', '--no-renames', '--name-status', '-z', base, identity.tree], cwd))
  const untracked = new Set(git(['ls-files', '--others', '--exclude-standard', '-z'], cwd).split('\0').filter(Boolean))
  fs.mkdirSync(path.join(outputDir, 'patches'), { recursive: true })
  const files = entries.map((entry, index) => {
    const patch = git(['diff', '--no-ext-diff', '--no-renames', '--unified=8', base, identity.tree, '--', entry.path], cwd)
    const patchFile = `patches/${String(index + 1).padStart(4, '0')}.patch`
    fs.writeFileSync(path.join(outputDir, patchFile), patch)
    const hunks = [...patch.matchAll(/^@@ .* @@.*$/gm)].map((match, hunkIndex) => ({
      id: `${index + 1}.${hunkIndex + 1}`, header: match[0], verdict: 'unreviewed',
    }))
    if (!hunks.length) hunks.push({ id: `${index + 1}.file`, header: 'whole-file / binary / mode change', verdict: 'unreviewed' })
    const blob = revision => {
      try { return git(['rev-parse', '--verify', `${revision}:${entry.path}`], cwd).trim() }
      catch { return null }
    }
    return { ...entry, untracked: untracked.has(entry.path), baseBlob: blob(base), currentBlob: blob(identity.tree),
      patchFile, patchSha256: createHash('sha256').update(patch).digest('hex'),
      testChanged: isTest(entry.path), policyChanged: isPolicy(entry.path),
      hunks, semanticReview: 'unreviewed', attribution: 'unclassified' }
  })
  fs.writeFileSync(path.join(outputDir, 'complete.diff'), git(['diff', '--no-ext-diff', '--no-renames', '--binary', base, identity.tree], cwd))
  for (const [name, predicate] of [['existing-tests', file => file.testChanged && file.baseBlob], ['policy-and-baselines', file => file.policyChanged]]) {
    fs.writeFileSync(path.join(outputDir, `${name}.diff`), files.filter(predicate).map(file => fs.readFileSync(path.join(outputDir, file.patchFile), 'utf8')).join('\n'))
  }
  return { baseRef, base, ...identity, branch: git(['branch', '--show-current'], cwd).trim(), files }
}

export function applyReviews(report, reviews) {
  const seen = new Set()
  for (const review of reviews) {
    const file = report.files.find(entry => entry.path === review.path)
    if (!file || file.patchSha256 !== review.patchSha256 || seen.has(review.path)) throw new Error(`Unknown, stale or duplicate review: ${review.path}`)
    seen.add(review.path)
    const reviewedHunks = new Set()
    for (const judgment of review.hunks) {
      const hunk = file.hunks.find(entry => entry.id === judgment.id)
      if (!hunk || reviewedHunks.has(judgment.id)) throw new Error(`Unknown or duplicate hunk: ${judgment.id}`)
      reviewedHunks.add(judgment.id)
      if (!['correct', 'incorrect', 'uncertain'].includes(judgment.verdict)
        || !['existing', 'introduced', 'not-a-defect', 'unknown'].includes(judgment.attribution)
        || !['priorBehavior', 'newBehavior', 'rationale', 'evidence'].every(key => typeof judgment[key] === 'string' && judgment[key].trim())) {
        throw new Error(`Incomplete review evidence: ${review.path} ${judgment.id}`)
      }
      Object.assign(hunk, judgment)
    }
    file.semanticReview = file.hunks.some(hunk => hunk.verdict === 'incorrect') ? 'incorrect'
      : file.hunks.every(hunk => hunk.verdict === 'correct') ? 'correct' : 'unresolved'
    file.attribution = [...new Set(file.hunks.map(hunk => hunk.attribution ?? 'unknown'))].join(', ')
  }
  report.semanticStatus = report.files.length && report.files.every(file => file.semanticReview === 'correct') ? 'reviewed-no-open-findings' : 'unresolved'
}

function runStage(stage, outputDir) {
  return new Promise(resolve => {
    const startedAt = new Date().toISOString()
    const log = path.join(outputDir, `${stage.id}.log`)
    const fd = fs.openSync(log, 'w')
    const command = process.platform === 'win32' && stage.command === 'pnpm' ? 'pnpm.cmd' : stage.command
    const child = spawn(command, stage.args, { cwd: root, env: { ...process.env, ...stage.env },
      stdio: ['ignore', fd, fd], shell: process.platform === 'win32' && command.endsWith('.cmd') })
    let spawnError
    child.on('error', error => { spawnError = error.message })
    child.on('close', (exitCode, signal) => {
      fs.closeSync(fd)
      resolve({ id: stage.id, command: [command, ...stage.args], startedAt, finishedAt: new Date().toISOString(),
        log, exitCode, signal, ...(spawnError ? { error: spawnError } : {}), status: exitCode === 0 && !spawnError ? 'passed' : 'failed' })
    })
  })
}

function writeReport(report, outputDir) {
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const stages = report.stages.map(stage => `| ${stage.id} | ${stage.status} | ${stage.exitCode ?? '—'} | ${stage.log ? `[log](${path.basename(stage.log)})` : '—'} |`)
  fs.writeFileSync(path.join(outputDir, 'report.md'), [
    '# 本轮完整差异与回归证据', '',
    `Base: \`${report.base}\` · HEAD: \`${report.head}\` · working tree: \`${report.tree}\``, '',
    `文件 ${report.files.length} 项（含新增未跟踪文件）；机械验证：${report.validationStatus}。`,
    `逐块语义审查：${report.semanticStatus ?? 'unreviewed'}。`,
    '此报告不证明没有行为回归。所有文件的语义、原行为和测试改动仍须逐项审查；机器绿灯不等于任务完成。', '',
    '[完整差异](complete.diff) · [原有测试改动](existing-tests.diff) · [门禁和基线改动](policy-and-baselines.diff)', '',
    '| 验证阶段 | 状态 | 退出码 | 日志 |', '|---|---|---|---|', ...stages, '',
    '真实付费、候选包、Windows 和外部 AI 审查不由本脚本盖绿，分别引用独立证据。脚本不修改生产代码、测试或预算，不提交、不合并。', '',
    '| 文件 | 差异 | 原 blob | 当前 blob | 测试变动 | 规则变动 | 语义审查 / 归属 |', '|---|---|---|---|---|---|---|',
    ...report.files.map(file => `| ${escapeCell(file.path)} | [${file.status}${file.untracked ? ' untracked' : ''}](${file.patchFile}) | ${file.baseBlob?.slice(0, 10) ?? '—'} | ${file.currentBlob?.slice(0, 10) ?? '—'} | ${file.testChanged} | ${file.policyChanged} | ${file.semanticReview} / ${file.attribution} |`), '',
    ...report.files.flatMap(file => [`## ${file.path}`, '', ...file.hunks.flatMap(hunk => [
      `### ${hunk.id} — ${hunk.verdict}`, '', `位置：\`${escapeCell(hunk.header)}\``, '',
      `原行为：${hunk.priorBehavior ?? '待审'}`, '', `当前行为：${hunk.newBehavior ?? '待审'}`, '',
      `判断：${hunk.rationale ?? '待审'}；归属：${hunk.attribution ?? 'unknown'}`, '', `依据：${hunk.evidence ?? '待审'}`, '',
    ])]),
  ].join('\n'))
}

async function main() {
  const { values } = parseArgs({ options: { run: { type: 'boolean', default: false }, base: { type: 'string', default: 'origin/main' }, out: { type: 'string' }, reviews: { type: 'string', multiple: true } } })
  const outputDir = values.out ? path.resolve(values.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-core-a-audit-'))
  const relative = path.relative(root, outputDir)
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Audit output must be outside the source tree')
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length) throw new Error('Audit output must be empty; preserve previous evidence')
  fs.mkdirSync(outputDir, { recursive: true })
  const report = { ...captureChanges(root, values.base, outputDir), startedAt: new Date().toISOString(),
    validationStatus: 'not-run', stages: stageIds.map(id => ({ id, status: 'not-run' })) }
  if (values.reviews) applyReviews(report, values.reviews.flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8'))))
  writeReport(report, outputDir)
  console.log(`Inventory: ${report.files.length} changed files; ${path.join(outputDir, 'report.md')}`)
  if (!values.run) return
  let buildPassed = false
  for (let index = 0; index < stageIds.length; index++) {
    const id = stageIds[index]
    const current = sourceIdentity(root)
    if (current.head !== report.head || current.tree !== report.tree) {
      report.validationStatus = 'invalid-source-drift'
      writeReport(report, outputDir)
      throw new Error('Source changed during audit; remaining stages were not run. Preserve and restart on a frozen tree.')
    }
    if (index > stageIds.indexOf('build') && !buildPassed) {
      report.stages[index] = { id, status: 'blocked-by-build' }
    } else {
      console.log(`Starting ${id} (serial; output in ${id}.log)`)
      report.stages[index] = await runStage(STAGES[id], outputDir)
      if (id === 'build') buildPassed = report.stages[index].status === 'passed'
      console.log(`${id}: ${report.stages[index].status}`)
    }
    report.validationStatus = 'running'
    writeReport(report, outputDir)
  }
  const current = sourceIdentity(root)
  report.validationStatus = current.head !== report.head || current.tree !== report.tree ? 'invalid-source-drift'
    : report.stages.every(stage => stage.status === 'passed') ? 'passed-checks-only' : 'failed'
  report.finishedAt = new Date().toISOString()
  writeReport(report, outputDir)
  console.log(`${report.validationStatus}: ${path.join(outputDir, 'report.md')}`)
  if (report.validationStatus !== 'passed-checks-only') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
