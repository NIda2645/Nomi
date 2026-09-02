#!/usr/bin/env node
// 五门戳契约门岗（2026-09-02）。抓的是一类**两边都不报错的**失效：写戳方与读戳方对不上。
//
// 起因：戳的路径和字段名被写死在三个互不相识的地方（gates 的内联写入、pre-push hook 的解析、
// hook 拦人时给的手动补盖命令）。2026-09-02 只升级了读戳方，另外两处没动——
// 结果 `pnpm run gates` 全过仍然推不上去，而且**两边各自看都是"对的"**：
// gates 说盖好了戳、hook 说没有戳，谁都没报错。20+ 棵 worktree 上天天复发。
//
// **为什么是「跑」而不是「读」读戳方**（第一版就是读，栽了）：
// 第一版靠 grep hook 的源码文本（找 `nomi-gates-ok`、`--absolute-git-dir`、`s/^sha=//p`）。
// 两个方向都不成立：
//   · 假绿——这些字符串在 hook 的**注释里也有**。把可执行那行改回 `MARKER="$ROOT/.claude/.gates-ok"`
//     而注释原样保留（merge 时极常见，注释与代码是两个 hunk），门岗照样打勾。实测确认。
//   · 假红——把 sed 换成等价的 awk / read 循环，行为完全正确，门岗却报「漏读 sha 字段」。
//     而 `docs/design/page-design-process.md` 自己写着：会误报的门岗三次之后就被人绕过，等于不存在。
// 所以改成**行为验证**：造一棵临时仓库，用唯一书写者盖出真戳，然后把真的
// `git push` 载荷喂给真的 hook，看它到底放行还是拦。这样任何等价改写都合法，
// 而任何真的行为回退都拦得住——注释是骗不过一次真实执行的。
//
// 规矩（以 `scripts/stamp-gates-ok.mjs` 为准）：
//   ① `gates` 必须调用那个唯一书写者，且不得再内联写任何别的戳；
//   ② 读戳方必须认唯一书写者盖出的戳（放行），且**每一个身份字段被篡改时都必须拦**；
//   ③ 无戳、老格式戳、别棵树的戳，一律拦；
//   ④ 读戳方拦人时推荐的补盖命令，指向的文件必须真的存在。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MARKER_BASENAME, STAMP_KEYED_FIELDS, resolveMarkerPath, writeStamp } from './stamp-gates-ok.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const STAMPER_REL = 'scripts/stamp-gates-ok.mjs'
const HOOK_REL = 'scripts/claude-hooks/pre-push-check.sh'

/** 老的戳文件名。它一旦在 gates 里复活，就又是一个没人读的平行戳（P1）。 */
const LEGACY_MARKER = '.gates-ok'

/**
 * 每个身份字段怎么「篡改」——用来证明读戳方**真的在校验它**。
 *
 * 往 STAMP_KEYED_FIELDS 加字段却不在这里给出篡改方式 → 报红。
 * 这是刻意的：新增一个身份维度，就得证明它真的在把关，否则它只是写进了文件而已。
 */
const FIELD_TAMPERS = {
  // 盖完戳之后又提交了代码：戳记的 sha 落在父提交上。
  sha: (dir) => execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: dir, encoding: 'utf8' }).trim(),
  // 戳是从别棵 worktree 拷来的。
  worktree: () => path.join(os.tmpdir(), 'nomi-some-other-worktree'),
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * 造一棵临时仓库：有 origin/main、有一个**代码**改动的 outgoing commit
 *（doc-only 的改动 hook 会直接放行，验不到戳）。
 */
function makeProbeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-gates-probe-'))
  git(['init', '-q', '-b', 'main'], dir)
  git(['config', 'user.email', 'probe@example.com'], dir)
  git(['config', 'user.name', 'probe'], dir)
  fs.writeFileSync(path.join(dir, 'code.mjs'), 'export const a = 1\n')
  git(['add', '-A'], dir)
  git(['commit', '-q', '--no-verify', '-m', 'base'], dir)
  // 让 origin/main 存在且停在 base，后面那个 commit 就成了「有代码的 outgoing」。
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD'], dir)
  fs.writeFileSync(path.join(dir, 'code.mjs'), 'export const a = 2\n')
  git(['add', '-A'], dir)
  git(['commit', '-q', '--no-verify', '-m', 'outgoing code change'], dir)
  return dir
}

/** 把真实的 PreToolUse `git push` 载荷喂给真实的 hook，返回它的退出码。 */
function runHook(hookPath, cwd) {
  const payload = JSON.stringify({ tool_input: { command: 'git push -u origin HEAD' }, cwd })
  try {
    execFileSync('bash', [hookPath], { input: payload, cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    return 0
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1
  }
}

function setField(dir, field, value) {
  const marker = resolveMarkerPath(dir)
  const body = fs
    .readFileSync(marker, 'utf8')
    .split('\n')
    .map((line) => (line.startsWith(`${field}=`) ? `${field}=${value}` : line))
    .join('\n')
  fs.writeFileSync(marker, body)
}

/** ② ③ 行为验证：真的跑读戳方。 */
function checkReaderBehaviour(root, problems) {
  const hookPath = path.join(root, HOOK_REL)
  if (!fs.existsSync(hookPath)) {
    problems.push(`读戳方 ${HOOK_REL} 不存在——push 闸没有版本化的实现体。`)
    return
  }
  const dir = makeProbeRepo()
  try {
    // ② 唯一书写者盖出的戳，读戳方必须认。
    writeStamp(dir)
    if (runHook(hookPath, dir) !== 0) {
      problems.push(
        `读戳方不认 ${STAMPER_REL} 盖出的戳（本该放行却拦了）——` +
          `这正是「gates 全过也推不上去」那个 bug 的形状。`,
      )
    }

    // ② 每一个身份字段被篡改，都必须拦；没给篡改方式的字段一律报红。
    for (const field of STAMP_KEYED_FIELDS) {
      const tamper = FIELD_TAMPERS[field]
      if (!tamper) {
        problems.push(
          `STAMP_KEYED_FIELDS 里的 \`${field}\` 没有对应的篡改用例（FIELD_TAMPERS 漏了）——` +
            `无法证明读戳方真的在校验它，新增身份维度必须可被证伪。`,
        )
        continue
      }
      writeStamp(dir)
      setField(dir, field, tamper(dir))
      if (runHook(hookPath, dir) === 0) {
        problems.push(`读戳方没有校验戳里的 \`${field}=\`——篡改它之后依然放行，闸门少一维。`)
      }
    }

    // ③ 无戳必须拦。
    fs.rmSync(resolveMarkerPath(dir), { force: true })
    if (runHook(hookPath, dir) === 0) {
      problems.push('读戳方在**没有戳**时依然放行——有代码改动却不需要过五门。')
    }

    // ③ 老格式（只有时间戳）的戳不能当凭据。
    fs.writeFileSync(resolveMarkerPath(dir), `${new Date().toISOString()}\n`)
    if (runHook(hookPath, dir) === 0) {
      problems.push('读戳方把老格式（只有时间戳）的戳当成了有效凭据——那种戳不认树也不认提交。')
    }

    // ③ 一树一戳：别棵 worktree 盖的戳不能给本树背书。
    const sibling = path.join(dir, '..', `${path.basename(dir)}-sibling`)
    git(['worktree', 'add', '-q', '-b', 'sibling', sibling], dir)
    try {
      writeStamp(dir) // 只给主树盖戳
      if (runHook(hookPath, sibling) === 0) {
        problems.push(
          `读戳方让**另一棵 worktree** 的戳给本次推送背书了——戳必须落在各自的 ` +
            `\`git rev-parse --absolute-git-dir\`（即 ${MARKER_BASENAME} 一树一份），否则多 worktree 下既误放也误杀。`,
        )
      }
    } finally {
      git(['worktree', 'remove', '--force', sibling], dir)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

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

  checkReaderBehaviour(root, problems)

  // ④ 拦人时给的补盖命令必须指向真实存在的文件（历史上它指了个不存在的脚本）。
  const hookPath = path.join(root, HOOK_REL)
  if (fs.existsSync(hookPath)) {
    const hook = fs.readFileSync(hookPath, 'utf8')
    for (const match of hook.matchAll(/node\s+\.?\/?(scripts\/[\w./-]+\.(?:mjs|cjs|js))/g)) {
      const suggested = match[1]
      if (!fs.existsSync(path.join(root, suggested))) {
        problems.push(`读戳方 ${HOOK_REL} 让人运行 \`node ${suggested}\`，但该文件不存在。`)
      }
    }
  }

  return problems
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkGatesStamp()
  if (problems.length === 0) {
    console.log(`✓ 五门戳契约一致：gates 写、pre-push hook 读，同一个 ${MARKER_BASENAME}（已实跑读戳方验证）。`)
    process.exit(0)
  }
  console.error('✖ 五门戳契约不一致（写戳方与读戳方对不上 → gates 全过也推不上去，且两边都不报错）:')
  for (const line of problems) console.error(`  - ${line}`)
  console.error(`\n  → 戳的路径与字段名以 ${STAMPER_REL} 为唯一真相源；改契约就把两边一起改。`)
  process.exit(1)
}
