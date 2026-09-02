#!/usr/bin/env node
// 五门通过戳的**唯一书写者**（2026-09-02）。
//
// 起因：这枚戳的「格式」以前没有主人，它被三处各自независ地写死过一遍——
//   ① `package.json` 的 `gates` 里一段内联 node（写 `.claude/.gates-ok`，只有一个时间戳）；
//   ② `scripts/claude-hooks/pre-push-check.sh`（读戳的那一方）；
//   ③ 读戳方拦人时让你手动补盖的那行提示（`node ./scripts/stamp-gates-ok.mjs`）。
// 没有任何机制强迫这三处一致。2026-09-02 读戳方升级成「认树 + 认提交」的三维戳之后，
// 写戳方原地不动、③ 指的文件压根不存在 —— 于是 `pnpm run gates` 全过也照样被拦，
// 每棵 worktree 都得手写一次戳才能推。20+ 棵并行的机器上这是天天复发的摩擦。
//
// 形状：戳的路径与字段名只在这里定义一次，写戳方（gates）与读戳方（pre-push hook）
// 都以它为准；`scripts/check-gates-stamp.mjs` 是把「两方仍然一致」钉死的静态门岗。
//
// 为什么戳落在 `git rev-parse --absolute-git-dir` 而不是工作区里的固定路径：
// git worktree 的 gitdir 一树一份（主仓 `.git/`，worktree 是 `.git/worktrees/<name>/`），
// 物理上不可能互相顶用——这正是读戳方要的「一棵树一枚戳」。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 戳的文件名。改这里 = 改契约，`check:gates-stamp` 会逼读戳方同步。 */
export const MARKER_BASENAME = 'nomi-gates-ok'

/**
 * 读戳方**逐字段解析**的键（`sha=` / `worktree=`）。
 * 这两个键是戳的身份维度：盖戳时的 HEAD、盖戳的那棵树。
 * `stamped_at` 不在此列——新鲜度读戳方是看文件 mtime，不解析内容。
 */
export const STAMP_KEYED_FIELDS = ['sha', 'worktree']

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/** 本棵 worktree 的戳该落在哪。 */
export function resolveMarkerPath(cwd = process.cwd()) {
  return path.join(git(['rev-parse', '--absolute-git-dir'], cwd), MARKER_BASENAME)
}

/** 盖戳：写入本树身份（HEAD sha + 树根），mtime 天然就是盖戳时刻。 */
export function writeStamp(cwd = process.cwd()) {
  const marker = resolveMarkerPath(cwd)
  const sha = git(['rev-parse', 'HEAD'], cwd)
  const worktree = git(['rev-parse', '--show-toplevel'], cwd)
  fs.mkdirSync(path.dirname(marker), { recursive: true })
  fs.writeFileSync(marker, `sha=${sha}\nworktree=${worktree}\nstamped_at=${new Date().toISOString()}\n`)
  return { marker, sha, worktree }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { marker, sha, worktree } = writeStamp()
    console.log(`✅ 五门戳已盖：${marker}`)
    console.log(`   sha=${sha.slice(0, 12)}  worktree=${worktree}`)
  } catch (error) {
    // 盖不上戳就得让调用者知道——静默失败会让 gates「假绿」，push 时才在闸门前发现。
    console.error(`✖ 盖戳失败（不在 git 工作区？）：${error.message}`)
    process.exit(1)
  }
}
