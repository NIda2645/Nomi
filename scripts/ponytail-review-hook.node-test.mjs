import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import installer from './install-git-hooks.cjs'
import { fileURLToPath } from 'node:url'
import { parsePushInput } from './ponytail-review-hook.mjs'
import { runBranchReview, verifyPushReceipt } from './ponytail-review-branch.mjs'

const repoScriptsDir = path.dirname(fileURLToPath(import.meta.url))
const BASE_REF = 'review-base'

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const ZERO = '0000000000000000000000000000000000000000'

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function makeRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-ponytail-hook-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  git(root, ['init', '--quiet'])
  git(root, ['config', 'user.email', 'ponytail-test@example.invalid'])
  git(root, ['config', 'user.name', 'Ponytail Test'])
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'initial\n')
  git(root, ['add', 'tracked.txt'])
  git(root, ['commit', '--quiet', '-m', 'fixture'])
  git(root, ['branch', BASE_REF])
  return root
}

function reviewHead(root) {
  runBranchReview({
    repoRoot: root,
    env: { PONYTAIL_REVIEW_BASE_REF: BASE_REF, PONYTAIL_REVIEW_CODEX_BIN: 'codex', PONYTAIL_REVIEW_REPORT_DIR: path.join(root, 'reports') },
    spawnSyncImpl: (_command, args) => {
      fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], 'Lean already. Ship.\nnet: -0 lines possible.\nPONYTAIL_REVIEW: PASS\n')
      return { status: 0, stdout: '', stderr: '' }
    },
  })
}

function hook(name) {
  const definition = installer.HOOKS.find((candidate) => candidate.name === name)
  assert.ok(definition, `missing ${name} definition`)
  return definition
}

test('pre-push input validates ref ranges, including create and delete', () => {
  const parsed = parsePushInput(`refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n\nrefs/heads/next ${SHA_B} refs/heads/next ${ZERO}\n`)
  assert.deepEqual(parsed, [
    { localRef: 'refs/heads/main', localSha: SHA_A, remoteRef: 'refs/heads/main', remoteSha: SHA_B },
    { localRef: 'refs/heads/next', localSha: SHA_B, remoteRef: 'refs/heads/next', remoteSha: ZERO },
  ])
  assert.throws(() => parsePushInput('bad line'), /Invalid pre-push line/)
  assert.throws(() => parsePushInput(`refs/heads/x zz refs/heads/x ${SHA_A}`), /Invalid local SHA/)
})

test('pre-commit 只剩敏感数据扫描：提交时刻不再跑模型评审', () => {
  assert.deepEqual(hook('pre-commit').commands.map(({ target }) => target), ['scripts/check-no-secrets.mjs'])
  const preCommit = installer.renderHookContent(hook('pre-commit'))
  assert.match(preCommit, /exec node "\$ROOT\/scripts\/check-no-secrets\.mjs" "\$@"/)
  assert.doesNotMatch(preCommit, /ponytail/i)
})

test('pre-push 只查收据 + 正文门岗本地半场：都不跑模型，缺文件时安全跳过', () => {
  // 2026-09-18 加的第二条命令是**正文门岗**（check-pr-body-gates.mjs）：它也只读判据，
  // 不跑模型。收据那条必须仍是 exec 的最后一条——只有它要吃 git 从 stdin 喂的 ref 列表。
  assert.deepEqual(hook('pre-push').commands.map(({ target }) => target),
    ['scripts/check-pr-body-gates.mjs', 'scripts/ponytail-review-hook.mjs'])
  const prePush = installer.renderHookContent(hook('pre-push'))
  assert.match(prePush, /\[ -f "\$ROOT\/scripts\/check-pr-body-gates\.mjs" \] \|\| exit 0/)
  assert.match(prePush, /\[ -f "\$ROOT\/scripts\/ponytail-review-hook\.mjs" \] \|\| exit 0/)
  assert.match(prePush, /^node "\$ROOT\/scripts\/check-pr-body-gates\.mjs"$/m)
  assert.match(prePush, /exec node "\$ROOT\/scripts\/ponytail-review-hook\.mjs" "\$@"/)
  const commitMsg = installer.renderHookContent(hook('commit-msg'))
  assert.match(commitMsg, /check-progress-update\.cjs/)
  assert.doesNotMatch(commitMsg, /ponytail/i)
})

test('正文门岗本地半场不判死：拿不到 PR 正文就放行，判据仍由 CI fail-closed', () => {
  const script = path.resolve(repoScriptsDir, 'check-pr-body-gates.mjs')
  const run = spawnSync(process.execPath, [script], {
    cwd: path.resolve(repoScriptsDir, '..'),
    encoding: 'utf8',
    // PATH 里挖掉 gh 等于「本机没装 gh」，这正是最常见的那种「今天没查成」。
    env: { ...process.env, PATH: '/nonexistent', GITHUB_EVENT_NAME: '' },
  })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stderr, /跳过/)
})

test('钩子没有任何入口能跑模型评审——评审只在 review:branch 里', () => {
  const hookSource = fs.readFileSync(path.join(repoScriptsDir, 'ponytail-review-hook.mjs'), 'utf8')
  assert.doesNotMatch(hookSource, /spawnSync/, '钩子不许再起子进程跑模型')
  assert.doesNotMatch(hookSource, /nomi-ponytail\.lock|with-gates-lock/, '全机评审锁已删除')
})

test('真跑一次生成的 pre-push：无收据被拦，评审过后放行', (t) => {
  const root = makeRepository(t)
  fs.writeFileSync(path.join(root, 'change.txt'), 'pushed\n')
  git(root, ['add', 'change.txt'])
  git(root, ['commit', '--quiet', '-m', 'work'])
  const head = git(root, ['rev-parse', 'HEAD'])
  const script = path.resolve(repoScriptsDir, 'ponytail-review-hook.mjs')
  const pushInput = `refs/heads/task ${head} refs/heads/task ${ZERO}\n`
  const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', input: pushInput })

  const blocked = run()
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /review:branch/)

  reviewHead(root)

  const allowed = run()
  assert.equal(allowed.status, 0, allowed.stderr)
  assert.match(allowed.stderr, /ponytail-receipt\] ok/)
})

test('空 push 输入不拦：没有 ref 更新就没有要评审的树', (t) => {
  const root = makeRepository(t)
  assert.equal(verifyPushReceipt({ repoRoot: root, ranges: parsePushInput('') }).ok, true)
})


// v0.22.2 发布：CI 里 pnpm install 装上了这个钩子，给已合入 main 的 RC 提交推版本标签时被拦（runner 上没有收据）。
test('已在远端历史里的附注标签不要收据：推它没有新内容离开本机', (t) => {
  const root = makeRepository(t)
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  git(root, ['tag', '-a', 'v9.9.9', '-m', 'release'])
  const tagObject = git(root, ['rev-parse', 'refs/tags/v9.9.9'])
  const result = verifyPushReceipt({ repoRoot: root, ranges: parsePushInput(`refs/tags/v9.9.9 ${tagObject} refs/tags/v9.9.9 ${ZERO}\n`) })
  assert.equal(result.ok, true, result.reason)
  assert.match(result.reason, /已在远端历史中/)
})

test('指向本机新提交的标签照样要收据：豁免判据是内容在不在远端，不是 ref 是不是 tag', (t) => {
  const root = makeRepository(t)
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  fs.writeFileSync(path.join(root, 'fresh.txt'), 'fresh\n')
  git(root, ['add', 'fresh.txt'])
  git(root, ['commit', '--quiet', '-m', 'fresh'])
  git(root, ['tag', '-a', 'v9.9.10', '-m', 'unreviewed'])
  const tagObject = git(root, ['rev-parse', 'refs/tags/v9.9.10'])
  const result = verifyPushReceipt({ repoRoot: root, ranges: parsePushInput(`refs/tags/v9.9.10 ${tagObject} refs/tags/v9.9.10 ${ZERO}\n`) })
  assert.equal(result.ok, false)
  assert.match(result.reason, /没有可读的分支评审收据/)
})

test('混合推送：已发布的 ref 豁免，新内容仍按收据的树校验', (t) => {
  const root = makeRepository(t)
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  const published = git(root, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(root, 'fresh.txt'), 'fresh\n')
  git(root, ['add', 'fresh.txt'])
  git(root, ['commit', '--quiet', '-m', 'fresh'])
  const head = git(root, ['rev-parse', 'HEAD'])
  const input = `refs/tags/v9.9.11 ${published} refs/tags/v9.9.11 ${ZERO}\nrefs/heads/task ${head} refs/heads/task ${ZERO}\n`
  assert.equal(verifyPushReceipt({ repoRoot: root, ranges: parsePushInput(input) }).ok, false)
  reviewHead(root)
  const reviewed = verifyPushReceipt({ repoRoot: root, ranges: parsePushInput(input) })
  assert.equal(reviewed.ok, true, reviewed.reason)
  fs.writeFileSync(path.join(root, 'fresh.txt'), 'changed after review\n')
  git(root, ['commit', '--quiet', '-am', 'drift'])
  const drifted = git(root, ['rev-parse', 'HEAD'])
  const stale = verifyPushReceipt({ repoRoot: root, ranges: parsePushInput(`refs/tags/v9.9.11 ${published} refs/tags/v9.9.11 ${ZERO}\nrefs/heads/task ${drifted} refs/heads/task ${ZERO}\n`) })
  assert.equal(stale.ok, false)
  assert.match(stale.reason, /不符/)
})

test('linked worktrees get isolated hook paths without touching the base worktree', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-ponytail-linked-'))
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, 'repo')
  const linked = path.join(base, 'linked')
  git(base, ['init', '--quiet', root])
  git(root, ['config', 'user.email', 'ponytail-test@example.invalid'])
  git(root, ['config', 'user.name', 'Ponytail Test'])
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'initial\n')
  git(root, ['add', 'tracked.txt'])
  git(root, ['commit', '--quiet', '-m', 'fixture'])
  git(root, ['config', 'extensions.worktreeConfig', 'true'])
  git(root, ['worktree', 'add', '--quiet', '-b', 'linked-branch', linked])

  const installed = installer.installHooks({ repoRoot: linked, logger: { log() {}, warn() {} } })
  assert.equal(installed.skipped, false)
  assert.notEqual(path.resolve(installed.hookDir), path.resolve(root, '.git', 'hooks'))
  assert.equal(fs.existsSync(path.join(installed.hookDir, 'pre-push')), true)
  assert.equal(fs.existsSync(path.join(root, '.git', 'hooks', 'pre-push')), false)
})
