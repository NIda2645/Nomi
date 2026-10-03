import fs from 'node:fs/promises'
import path from 'node:path'

export type JudgeRecord = {
  cardId: string
  scheme: string
  bait?: boolean
  mutation?: string
  score?: number
  judgements?: Record<string, number>
  pairwiseWinner?: string
  crossCheck?: { checked: number; consistent: number; consistency: number | null; disagreements: unknown[] }
  error?: string
  fast?: boolean
}

export async function writeReport(outDir: string, records: JudgeRecord[], meta: Record<string, unknown>): Promise<void> {
  const normal = records.filter((record) => !record.bait)
  const baits = records.filter((record) => record.bait)
  const baitDetected = baits.filter((record) => (record.score ?? 5) <= 2).length
  const baitRate = baits.length ? baitDetected / baits.length : null
  const cross = records.flatMap((record) => record.crossCheck ? [record.crossCheck] : [])
  const checked = cross.reduce((sum, item) => sum + item.checked, 0)
  const consistent = cross.reduce((sum, item) => sum + item.consistent, 0)
  const lines = [
    baitRate !== null && baitRate < 0.9 ? 'INVALID BATCH: bait detection below 90%; visual conclusions are void.' : 'Batch status: provisional (calibration required).',
    '',
    '# Director L5 blind visual judge report',
    '',
    '- Calibration: **uncalibrated**; scores are discovery evidence only and cannot establish scheme superiority.',
    `- Bait detection: ${baitDetected}/${baits.length || 0} (${baitRate === null ? 'unverified' : `${(baitRate * 100).toFixed(1)}%`}).`,
    `- Measurement cross-check: ${checked ? `${consistent}/${checked} (${((consistent / checked) * 100).toFixed(1)}%)` : 'unverified (no measurable claims returned)'}.`,
    `- Calls: ${records.length}; priority-fast receipts: ${records.filter((record) => record.fast).length}/${records.length}.`,
    '',
    '| Card | Scheme | Bait | Score | Pairwise | Cross-check | Status |',
    '|---|---|---:|---:|---|---|---|',
  ]
  for (const record of records) lines.push(`| ${record.cardId} | ${record.scheme} | ${record.bait ? 'yes' : 'no'} | ${record.score ?? 'unverified'} | ${record.pairwiseWinner ?? 'unverified'} | ${record.crossCheck?.consistency == null ? 'unverified' : `${(record.crossCheck.consistency * 100).toFixed(1)}%`} | ${record.error ? `blocked: ${record.error}` : 'ok'} |`)
  lines.push('', '## Raw metadata', '', '```json', JSON.stringify(meta, null, 2), '```', '', '## Reliability notes', '', '- Each normal review is repeated three times with randomized frame order. Large score spread is marked unstable in `results.json`.', '- Contact sheets and the five worst segments are retained beside this report for human eye review.', '- A calibration page is supplied, but no calibration receipt is assumed until a user exports scores and the rank correlation is computed.')
  await fs.writeFile(path.join(outDir, 'report.md'), lines.join('\n') + '\n')
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify({ meta, records, baitRate, crossCheck: { checked, consistent, consistency: checked ? consistent / checked : null } }, null, 2) + '\n')
}
