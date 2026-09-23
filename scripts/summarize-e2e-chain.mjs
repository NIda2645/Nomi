#!/usr/bin/env node
// CI 的 E2E 链汇总步（2026-09-18）。**这一步才是 desktop-linux job 的结论**：
// 七步各自 continue-on-error 跑完，结果从 steps.<id>.outcome 汇到这里一次判红绿。
//
// 为什么这么改：串行 fail-fast 让每轮 CI 只暴露一条红（PR #804 连着三轮，每轮红的是另一条
// 不同的走查）。发现被串行化之后，排查的墙钟是「红的条数 × 40 分钟」，而不是一轮。
//
// 判据在 scripts/lib/chainSummary.mjs，和本地那条链（pnpm run test:e2e:ci-chain）是同一份：
// 两边各写一份判据，迟早会在「哪种 outcome 算红」上分叉。
import fs from 'node:fs'
import { renderChainMarkdown, renderChainSummary } from './lib/chainSummary.mjs'

const raw = String(process.env.CHAIN ?? '').trim()
if (!raw) {
  console.error('✖ E2E 链汇总：拿不到任何一步的 outcome（CHAIN 为空）——不拿算不出来当通过。')
  process.exit(1)
}

const rows = raw.split(/\s+/).filter(Boolean).map((entry) => {
  const at = entry.lastIndexOf(':')
  return { name: at === -1 ? entry : entry.slice(0, at), outcome: at === -1 ? '' : entry.slice(at + 1) }
})

const summary = renderChainSummary(rows)
const label = String(process.env.CHAIN_LABEL ?? 'E2E 走查链').trim() || 'E2E 走查链'
console.log(`${label}（一次跑完，红了不中断）：`)
console.log(summary.text)

const summaryPath = process.env.GITHUB_STEP_SUMMARY
if (summaryPath) {
  try {
    fs.appendFileSync(summaryPath, `### ${label}\n\n${renderChainMarkdown(rows)}\n`)
  } catch (error) {
    // 汇总写不进去不该改变红绿结论，但要说出来。
    console.error(`⚠️ 写 step summary 失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

if (!summary.ok) {
  console.error(`\n✖ ${label}有红。证据（截图 + output.jsonl）已经上传为 release-critical-evidence 制品，`
    + '本轮已经把**全部**红的条目收齐——一次修完，别一条一轮。')
  console.error('  本机按工作流同序复跑对应命令，先修完这张汇总表里的全部红项。')
  process.exit(1)
}
console.log(`\n✅ 走查链全绿（${rows.length} 步）`)
