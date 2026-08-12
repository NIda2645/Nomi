#!/usr/bin/env node
// 门岗：模型档案的契约出处必须落成结构化字段（规则 G1/G3，docs/engineering-rules.md）。
//
// 为什么要这个门岗（2026-08-12 真实缺陷）：Seedance 2.5 档案里参考图/视频/音频上限写的是
// 9/3/3、比例默认 16:9，而 kie 与 apimart 官方文档都是 30/10/10、默认 adaptive——四个数
// 没一个来自文档。而文件头注释白纸黑字写着「契约逐项对账自 kie 官方文档」。
// 注释是自由文本，**声称对过和真的对过之间没有任何验证手段**。落成字段才检查得了。
//
// 棘轮：存量未登记的进白名单，只减不增（与 filesize / tokens / i18n 同款纪律）。
// 一刀切会让门岗永远红、进而被习惯性忽略——被忽略的门岗等于不存在。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const archetypeDir = path.join(repoRoot, 'src/config/modelArchetypes')
const baselinePath = path.join(repoRoot, 'scripts/archetype-sources-baseline.json')

/** 未登记出处的存量档案。**只减不增** —— 补一个删一行，新增档案不许进这里。 */
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const allowed = new Set(baseline.unsourced)

const files = fs
  .readdirSync(archetypeDir)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !['index.ts', 'types.ts', 'archetypeMeta.ts'].includes(f))

const problems = []
const unsourced = []

for (const file of files) {
  const src = fs.readFileSync(path.join(archetypeDir, file), 'utf8')
  // 一个文件可能声明多个档案；按 `id: "..."` 逐个认。
  const ids = [...src.matchAll(/^\s{2}id:\s*["']([^"']+)["']/gm)].map((m) => m[1])
  if (ids.length === 0) continue
  const hasSources = /^\s{2}sources:\s*\[/m.test(src)

  if (!hasSources) {
    unsourced.push(file)
    if (!allowed.has(file)) {
      problems.push(`✗ ${file}: 缺 sources —— 新档案必须登记官方文档出处（url + checkedAt）`)
    }
    continue
  }

  // 有 sources 就得是像样的：URL 必须 https，checkedAt 必须 ISO 日期。
  const urls = [...src.matchAll(/url:\s*["']([^"']+)["']/g)].map((m) => m[1])
  const dates = [...src.matchAll(/checkedAt:\s*["']([^"']+)["']/g)].map((m) => m[1])
  if (urls.length === 0) problems.push(`✗ ${file}: sources 里没有 url`)
  if (urls.length !== dates.length) problems.push(`✗ ${file}: url 与 checkedAt 数量不匹配（每条出处都要有对账日期）`)
  for (const url of urls) {
    if (!/^https:\/\//.test(url)) problems.push(`✗ ${file}: 出处必须是 https 官方文档地址，收到 ${url}`)
  }
  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`✗ ${file}: checkedAt 必须是 YYYY-MM-DD，收到 ${date}`)
  }
}

// 棘轮回收：白名单里已经补好出处的，必须同步从白名单删掉，否则它就成了永久豁免。
const stale = [...allowed].filter((f) => !unsourced.includes(f))
for (const file of stale) {
  problems.push(`✗ ${file}: 已补出处但仍留在白名单里 —— 从 ${path.relative(repoRoot, baselinePath)} 删掉这行（棘轮只减不增）`)
}

if (problems.length > 0) {
  console.error('档案出处门岗未通过（规则 G1/G3）：')
  for (const p of problems) console.error(p)
  console.error(`\n为什么有这条：注释可以写「已逐项对账」而实际没对过，没人能反证；结构化出处才检查得了。`)
  console.error(`补法：在档案里加 sources: [{ url: "官方文档地址", checkedAt: "YYYY-MM-DD", vendorKey, covers }]`)
  process.exit(1)
}

console.log(`✓ 档案出处门岗通过：扫 ${files.length} 个档案文件，${files.length - unsourced.length} 个已登记出处，${unsourced.length} 个待补（棘轮基线 ${allowed.size}）。`)
