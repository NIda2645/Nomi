#!/usr/bin/env node
// 五门戳契约门岗（2026-09-02）。抓的是一类**两边都不报错的**失效：写戳方与读戳方对不上。
//
// 起因：戳的路径和字段名被写死在三个互不相识的地方（gates 的内联写入、pre-push hook 的解析、
// hook 拦人时给的手动补盖命令）。2026-09-02 只升级了读戳方，另外两处没动——
// 结果 `pnpm run gates` 全过仍然推不上去，而且**两边各自看都是"对的"**：
// gates 说盖好了戳、hook 说没有戳，谁都没报错。20+ 棵 worktree 上天天复发。
//
// 规矩（三条，全部以 `scripts/stamp-gates-ok.mjs` 为准）：
//   ① `gates` 必须调用那个唯一书写者，且不得再内联写任何别的戳；
//   ② 读戳方（版本化的 `scripts/claude-hooks/pre-push-check.sh`）读的文件名、
//      解析的字段名必须与书写者一致；
//   ③ 读戳方拦人时推荐的补盖命令，指向的文件必须真的存在。
//
// 失败方向刻意选「宁可假红」：认不出的写法一律报红。假红看得见、有人会来修；
// 假绿看不见，而这门岗防的就是假绿。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MARKER_BASENAME, STAMP_KEYED_FIELDS } from './stamp-gates-ok.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const STAMPER_REL = 'scripts/stamp-gates-ok.mjs'
const HOOK_REL = 'scripts/claude-hooks/pre-push-check.sh'

/** 老的戳文件名。它一旦在 gates 里复活，就又是一个没人读的平行戳（P1）。 */
const LEGACY_MARKER = '.gates-ok'

export function checkGatesStamp(root = repoRoot) {
  const problems = []
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const gates = pkg.scripts?.gates ?? ''

  // ① 写戳方：gates 必须走唯一书写者，且不得内联复活老戳。
  if (!gates.includes(STAMPER_REL)) {
    problems.push(`package.json 的 \`gates\` 没有调用 ${STAMPER_REL}——五门过了却不盖戳，push 必被拦。`)
  }
  if (gates.includes(LEGACY_MARKER)) {
    problems.push(
      `package.json 的 \`gates\` 仍在写老戳 \`${LEGACY_MARKER}\`——没有任何读戳方读它，` +
        `留着就是第二个平行戳（P1：加新必删旧）。`,
    )
  }

  // ② 读戳方：文件名与字段名必须与书写者一致。
  const hookPath = path.join(root, HOOK_REL)
  if (!fs.existsSync(hookPath)) {
    problems.push(`读戳方 ${HOOK_REL} 不存在——push 闸没有版本化的实现体。`)
    return problems
  }
  const hook = fs.readFileSync(hookPath, 'utf8')

  if (!hook.includes(MARKER_BASENAME)) {
    problems.push(
      `读戳方 ${HOOK_REL} 没有读 \`${MARKER_BASENAME}\`——与 ${STAMPER_REL} 写的戳不是同一个文件。`,
    )
  }
  if (!hook.includes('--absolute-git-dir')) {
    problems.push(
      `读戳方 ${HOOK_REL} 没有用 \`git rev-parse --absolute-git-dir\` 定位戳——` +
        `戳会退回「一个固定路径」，多 worktree 下会互相顶用（既误放也误杀）。`,
    )
  }
  for (const field of STAMP_KEYED_FIELDS) {
    // 书写者写 `field=value`；读戳方必须真的把它解析出来，而不只是恰好提到这个词。
    if (!hook.includes(`s/^${field}=//p`)) {
      problems.push(
        `读戳方 ${HOOK_REL} 没有解析戳里的 \`${field}=\` 字段——` +
          `${STAMPER_REL} 写了它，说明它是身份维度，读戳方漏读 = 闸门少一维。`,
      )
    }
  }

  // ③ 拦人时给的补盖命令必须指向真实存在的文件（历史上它指了个不存在的脚本）。
  for (const match of hook.matchAll(/node\s+\.\/(scripts\/[\w./-]+\.(?:mjs|cjs|js))/g)) {
    const suggested = match[1]
    if (!fs.existsSync(path.join(root, suggested))) {
      problems.push(`读戳方 ${HOOK_REL} 让人运行 \`node ./${suggested}\`，但该文件不存在。`)
    }
  }

  return problems
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkGatesStamp()
  if (problems.length === 0) {
    console.log(`✓ 五门戳契约一致：gates 写、pre-push hook 读，同一个 ${MARKER_BASENAME}。`)
    process.exit(0)
  }
  console.error('✖ 五门戳契约不一致（写戳方与读戳方对不上 → gates 全过也推不上去，且两边都不报错）:')
  for (const line of problems) console.error(`  - ${line}`)
  console.error(`\n  → 戳的路径与字段名以 ${STAMPER_REL} 为唯一真相源；改契约就把两边一起改。`)
  process.exit(1)
}
