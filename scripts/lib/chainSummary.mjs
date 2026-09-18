// CI 七步走查链的**汇总表**——本地（scripts/run-ci-e2e-chain.mjs）和 CI
// （scripts/summarize-e2e-chain.mjs）共用同一份渲染与同一条判据。
//
// 为什么共用：两边各写一份表，迟早会在「哪种 outcome 算红」上分叉，
// 而分叉的那一天，本地说绿、CI 说红，人会去怀疑平台差异（我们已经在这上面栽过）。
//
// 判据 fail-closed：认识 success / skipped 两种放行，其余（failure、cancelled、
// 空字符串、没见过的新值）一律算红。门岗的失败方向必须是多报红，不是多报绿。
const PASSING = new Set(['success', 'skipped'])

export function outcomeIsRed(outcome) {
  return !PASSING.has(String(outcome ?? '').trim())
}

const ICON = { success: '✅', skipped: '⏭️' }

function duration(row) {
  if (!Number.isFinite(row.durationMs)) return ''
  const seconds = row.durationMs / 1000
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s` : `${seconds.toFixed(1)}s`
}

/** rows: [{ name, outcome, durationMs?, log? }] → 人看的一张表 + 红绿结论。 */
export function renderChainSummary(rows) {
  const red = rows.filter((row) => outcomeIsRed(row.outcome))
  const width = Math.max(4, ...rows.map((row) => row.name.length))
  const lines = rows.map((row) => {
    const parts = [`${ICON[row.outcome] ?? '✖'} ${row.name.padEnd(width)}`, String(row.outcome ?? 'unknown').padEnd(9)]
    const spent = duration(row)
    if (spent) parts.push(spent.padStart(7))
    if (row.log) parts.push(row.log)
    return `  ${parts.join('  ')}`
  })
  const verdict = red.length === 0
    ? `全部通过（${rows.filter((row) => row.outcome === 'success').length} 跑 / ${rows.filter((row) => row.outcome === 'skipped').length} 跳过）`
    : `${red.length} 条红：${red.map((row) => row.name).join(', ')}`
  return { ok: red.length === 0, red, text: [...lines, '', `结论：${verdict}`].join('\n') }
}

/** 同一张表的 Markdown 版，喂 $GITHUB_STEP_SUMMARY。 */
export function renderChainMarkdown(rows) {
  const header = ['| 步骤 | 结果 | 耗时 |', '| --- | --- | --- |']
  const body = rows.map((row) => `| ${row.name} | ${ICON[row.outcome] ?? '✖'} ${row.outcome ?? 'unknown'} | ${duration(row) || '—'} |`)
  return [...header, ...body].join('\n')
}
