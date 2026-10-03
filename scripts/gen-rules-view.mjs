#!/usr/bin/env node
// 规则登记表 → 可读视图。正本是 docs/engineering/rules.json，视图 docs/engineering/rules.md 只读、由本脚本生成；
// check:rule-aliases 会比对两者是否一致。用法：`node scripts/gen-rules-view.mjs`（写盘）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const RULES_JSON = 'docs/engineering/rules.json'
export const RULES_VIEW = 'docs/engineering/rules.md'

const LEVEL_TITLE = {
  always: '常驻（CLAUDE.md 里就有）',
  l2: '触发才查',
  suggestion: '建议档（可以只有人工执行点）',
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function renderView(data) {
  const out = [
    '<!-- 本文件由 scripts/gen-rules-view.mjs 从 docs/engineering/rules.json 生成，请勿手改。 -->',
    '',
    '# 规则登记表（视图）',
    '',
    '> 正本是 `rules.json`，这里只是好读的版本。改规则改 `rules.json`，再跑 `node scripts/gen-rules-view.mjs`。',
    '> 旧编号（R# / D# / PB# 等）写在每条的「旧号」列，`check:rule-aliases` 保证任何引用都解析得到。',
    '',
  ]
  for (const level of ['always', 'l2', 'suggestion']) {
    const rules = data.rules.filter((r) => r.level === level)
    out.push(`## ${LEVEL_TITLE[level]}（${rules.length} 条）`, '')
    out.push('| 编号 | 旧号 | 规则 | 防的病 | 执行点 | 证据 | 负责 | 复查 | 删除条件 |')
    out.push('|---|---|---|---|---|---|---|---|---|')
    for (const r of rules) {
      out.push(
        `| ${cell(r.id)} | ${cell((r.aliases ?? []).join(' '))} | ${cell(r.rule)} | ${cell(r.disease)} | ${cell(
          (r.enforcement ?? []).join('；'),
        )} | ${cell(r.evidence)} | ${cell(r.owner)} | ${cell(r.review_on)} | ${cell(r.delete_when)} |`,
      )
    }
    out.push('')
  }
  const reserved = Object.entries(data.reserved ?? {})
  if (reserved.length > 0) {
    out.push('## 保留号', '')
    for (const [id, why] of reserved) out.push(`- ${id}：${why}`)
    out.push('')
  }
  return out.join('\n')
}

function main() {
  const data = JSON.parse(fs.readFileSync(path.join(repoRoot, RULES_JSON), 'utf8'))
  fs.writeFileSync(path.join(repoRoot, RULES_VIEW), renderView(data))
  console.log(`✅ 已生成 ${RULES_VIEW}（${data.rules.length} 条规则）`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
