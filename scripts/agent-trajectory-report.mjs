#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ERROR_KINDS = new Set(['arg_rejected', 'domain_failed'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidToolCall(value) {
  return isRecord(value) && typeof value.caseId === 'string' && value.caseId.length > 0 &&
    typeof value.name === 'string' && value.name.length > 0
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function callsPerCaseStats(cases) {
  const counts = cases.map((item) => item.calls.length)
  if (counts.length === 0) return { min: null, median: null, max: null }
  return {
    min: Math.min(...counts),
    median: median(counts),
    max: Math.max(...counts),
  }
}

export function normalizeFailureMessage(resultText) {
  const first160 = String(resultText ?? '').slice(0, 160).replace(/\s+/g, ' ').trim()
  return first160
    .replace(/gen-v\d+-[a-z_]+-[a-z0-9]+-[a-z0-9]+/gi, 'gen-v#-#-#-#')
    .replace(/op-[0-9a-f-]+/gi, 'op-#')
    .replace(/call_[0-9a-f]+/gi, 'call_#')
    .replace(/\d+/g, '#')
}

function sortCalls(calls) {
  return [...calls].sort((a, b) => {
    const aSeq = Number(a.seq)
    const bSeq = Number(b.seq)
    if (Number.isFinite(aSeq) && Number.isFinite(bSeq) && aSeq !== bSeq) return aSeq - bSeq
    return a.lineOrder - b.lineOrder
  })
}

function getTrajectoryFiles(runDir) {
  const trajectoriesDir = path.join(runDir, 'trajectories')
  if (!fs.existsSync(trajectoriesDir) || !fs.statSync(trajectoriesDir).isDirectory()) {
    throw new Error(`Missing trajectories directory: ${trajectoriesDir}`)
  }
  return fs.readdirSync(trajectoriesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => entry.name)
    .sort()
}

export function analyzeRun(runDir, label = path.basename(path.resolve(runDir))) {
  const files = getTrajectoryFiles(runDir)
  const cases = []
  let malformedLines = 0
  let lineOrder = 0

  for (const file of files) {
    const caseId = path.basename(file, '.jsonl')
    const item = { id: caseId, calls: [], malformedLines: 0 }
    const text = fs.readFileSync(path.join(runDir, 'trajectories', file), 'utf8')
    const lines = text.split(/\r?\n/)
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber]
      if (!line.trim()) continue
      let value
      try {
        value = JSON.parse(line)
      } catch {
        malformedLines += 1
        item.malformedLines += 1
        continue
      }
      if (!isValidToolCall(value)) {
        malformedLines += 1
        item.malformedLines += 1
        continue
      }
      item.calls.push({ ...value, lineOrder })
      lineOrder += 1
    }
    cases.push(item)
  }

  const toolMap = new Map()
  const failureMap = new Map()
  let totalCalls = 0
  let argRejected = 0
  let domainFailed = 0
  let retries = 0

  for (const item of cases) {
    for (const call of item.calls) {
      totalCalls += 1
      const tool = call.name
      if (!toolMap.has(tool)) toolMap.set(tool, { tool, calls: 0, arg_rejected: 0, domain_failed: 0, retries: 0 })
      const stats = toolMap.get(tool)
      stats.calls += 1
      if (call.errorKind === 'arg_rejected') {
        argRejected += 1
        stats.arg_rejected += 1
      }
      if (call.errorKind === 'domain_failed') {
        domainFailed += 1
        stats.domain_failed += 1
      }
      if (call.retryOf) {
        retries += 1
        stats.retries += 1
      }
      if (call.isError === true || ERROR_KINDS.has(call.errorKind)) {
        const message = normalizeFailureMessage(call.resultText)
        if (message) {
          const key = `${tool}\u0000${message}`
          const existing = failureMap.get(key)
          if (existing) existing.count += 1
          else failureMap.set(key, { message, count: 1, tool })
        }
      }
    }
  }

  const toolStats = [...toolMap.values()].sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))
  const failures = [...failureMap.values()]
    .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message) || a.tool.localeCompare(b.tool))
  const callsPerCase = callsPerCaseStats(cases)
  const longestRetryChains = cases
    .map((item) => {
      const ordered = sortCalls(item.calls)
      return {
        caseId: item.id,
        retries: ordered.filter((call) => Boolean(call.retryOf)).length,
        toolSequence: ordered.map((call) => call.name),
      }
    })
    .sort((a, b) => b.retries - a.retries || b.toolSequence.length - a.toolSequence.length || a.caseId.localeCompare(b.caseId))
    .slice(0, 3)

  return {
    label,
    runDir: path.resolve(runDir),
    summary: {
      cases: cases.length,
      totalCalls,
      arg_rejected: argRejected,
      domain_failed: domainFailed,
      retries,
      malformedLines,
      callsPerCase,
      zeroToolCallCases: cases.filter((item) => item.calls.length === 0).map((item) => item.id),
    },
    tools: toolStats,
    topFailures: failures,
    longestRetryChains,
  }
}

export function buildReportData(runDirs, { labels = [], top = 10 } = {}) {
  const runs = runDirs.map((runDir, index) => analyzeRun(runDir, labels[index] || path.basename(path.resolve(runDir))))
  const comparison = runs.length < 2 ? null : {
    summary: runs.map((run) => ({ label: run.label, ...run.summary })),
    tools: [...new Set(runs.flatMap((run) => run.tools.map((item) => item.tool)))].sort().map((tool) => ({
      tool,
      runs: runs.map((run) => run.tools.find((item) => item.tool === tool) || {
        tool, calls: 0, arg_rejected: 0, domain_failed: 0, retries: 0,
      }),
    })),
  }
  return {
    runs: runs.map((run) => ({ ...run, topFailures: run.topFailures.slice(0, top) })),
    comparison,
    top,
  }
}

function formatNumber(value) {
  return value === null || value === undefined ? 'n/a' : String(value)
}

function markdownTable(headers, rows) {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`]
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`)
  return lines.join('\n')
}

export function renderMarkdown(report) {
  const sections = ['# Agent Trajectory Report']
  for (const run of report.runs) {
    const s = run.summary
    sections.push(`## ${run.label}`)
    sections.push(`Run directory: \`${run.runDir}\``)
    sections.push(markdownTable(
      ['Metric', 'Value'],
      [
        ['Cases', s.cases],
        ['Total calls', s.totalCalls],
        ['Arg rejected', s.arg_rejected],
        ['Domain failed', s.domain_failed],
        ['Retries', s.retries],
        ['Malformed lines', s.malformedLines],
        ['Calls per case (min / median / max)', `${formatNumber(s.callsPerCase.min)} / ${formatNumber(s.callsPerCase.median)} / ${formatNumber(s.callsPerCase.max)}`],
        ['Cases with zero tool calls', s.zeroToolCallCases.length ? s.zeroToolCallCases.join(', ') : 'none'],
      ],
    ))
    sections.push('### Tool × Error')
    sections.push(markdownTable(
      ['Tool', 'Calls', 'Arg rejected', 'Domain failed', 'Retries'],
      run.tools.map((item) => [item.tool, item.calls, item.arg_rejected, item.domain_failed, item.retries]),
    ))
    sections.push(`### Top-${report.top} Normalized Failures`)
    sections.push(run.topFailures.length
      ? markdownTable(['Message', 'Count', 'Tool'], run.topFailures.map((item) => [item.message, item.count, item.tool]))
      : 'None')
    sections.push('### Longest Retry Chains')
    sections.push(markdownTable(
      ['Case', 'Retries', 'Tool sequence'],
      run.longestRetryChains.map((item) => [item.caseId, item.retries, item.toolSequence.length ? item.toolSequence.join(' → ') : 'none']),
    ))
  }

  if (report.comparison) {
    sections.push('## Comparison')
    const summaryHeaders = ['Metric', ...report.comparison.summary.map((item) => item.label)]
    const metrics = [
      ['Cases', 'cases'], ['Total calls', 'totalCalls'], ['Arg rejected', 'arg_rejected'],
      ['Domain failed', 'domain_failed'], ['Retries', 'retries'], ['Malformed lines', 'malformedLines'],
    ]
    sections.push(markdownTable(summaryHeaders, metrics.map(([title, key]) => [title, ...report.comparison.summary.map((item) => item[key])])))
    const toolHeaders = ['Tool']
    for (const item of report.comparison.summary) toolHeaders.push(`${item.label} calls`, `${item.label} arg_rejected`, `${item.label} domain_failed`, `${item.label} retries`)
    sections.push('### Per-tool Comparison')
    sections.push(markdownTable(toolHeaders, report.comparison.tools.map((item) => [item.tool, ...item.runs.flatMap((stats) => [stats.calls, stats.arg_rejected, stats.domain_failed, stats.retries])])))
  }
  return `${sections.join('\n\n')}\n`
}

export function parseCliArgs(argv) {
  const runDirs = []
  let labels = []
  let top = 10
  let json = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') {
      json = true
    } else if (arg === '--label' || arg === '--top') {
      const value = argv[++index]
      if (value === undefined) throw new Error(`${arg} requires a value`)
      if (arg === '--label') labels = value.split(',').map((label) => label.trim())
      else top = Number(value)
    } else if (arg.startsWith('--label=')) {
      labels = arg.slice('--label='.length).split(',').map((label) => label.trim())
    } else if (arg.startsWith('--top=')) {
      top = Number(arg.slice('--top='.length))
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    } else {
      runDirs.push(arg)
    }
  }
  if (runDirs.length === 0) throw new Error('Usage: node scripts/agent-trajectory-report.mjs <runDir> [<runDir> ...] [--label a,b,c] [--json] [--top N]')
  if (!Number.isInteger(top) || top < 0) throw new Error('--top must be a non-negative integer')
  return { runDirs, labels, top, json }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv)
  const report = buildReportData(options.runDirs, options)
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report))
  return report
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
