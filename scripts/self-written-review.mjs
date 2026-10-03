#!/usr/bin/env node
// 周期审计（R14）的「自写登记复查」：列出该进替换计划的自写项。
//   · status = to-replace（已确认要换成现成的）
//   · status = under-review（还没结论的评估，到期的标出来）
//   · revisitBy 已到（重新评估的日期到了）
// 只读、零额度；复查结论要改回 docs/engineering/self-written.json，不许只写在审计文档里。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SELF_WRITTEN_FILE, dueForReview } from './self-written-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, SELF_WRITTEN_FILE), 'utf8'))
const today = process.env.SELF_WRITTEN_TODAY || new Date().toISOString().slice(0, 10)
const rows = dueForReview(registry, today)

console.log(`自写登记复查（${today}）：${registry.entries.length} 项登记，${rows.length} 项该进替换计划`)
for (const row of rows) {
  const entry = registry.entries.find((candidate) => candidate.id === row.id)
  console.log(`  · ${row.id}（${entry.status}）：${row.why}`)
  console.log(`      能力：${entry.capability}`)
  console.log(`      重新评估的触发条件：${entry.revisitWhen}`)
}
if (rows.length === 0) console.log('  （没有到期或待替换的项）')
