// Ponytail 评审的「模式」：enforce（阻断）/ hint（只提示）。
// 2026-10-01 用户按门岗账本拍板降级：窗口里 47 个 PR 写了 Ponytail 节、约 33 个是 --defer（runner 不可用），
// check:ponytail-review 在 CI 里 49/49 绿——要求每个 PR 交一份「已延后」的收据，没有信息量。
// 降级是**一个文件里的一个值**，Codex 恢复以后改回 enforce 就重新开起来。缺文件 / 读不懂 = enforce（fail-closed）。
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { PONYTAIL_MODE_FILE, readPonytailMode } from './ponytail-mode.mjs'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsDir, '..')
const SHA = 'a'.repeat(40)
const ZERO = '0'.repeat(40)

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-mode-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
const writeMode = (root, value) => {
  fs.mkdirSync(path.join(root, path.dirname(PONYTAIL_MODE_FILE)), { recursive: true })
  fs.writeFileSync(path.join(root, PONYTAIL_MODE_FILE), typeof value === 'string' ? value : JSON.stringify(value))
}

test('没有模式文件 / 文件读不懂 / 值不认识 = enforce（fail-closed）；写了 hint 才是 hint', (t) => {
  const root = tempRoot(t)
  assert.equal(readPonytailMode(root, {}), 'enforce')
  writeMode(root, '{not json')
  assert.equal(readPonytailMode(root, {}), 'enforce')
  writeMode(root, { mode: 'maybe' })
  assert.equal(readPonytailMode(root, {}), 'enforce')
  writeMode(root, { mode: 'hint' })
  assert.equal(readPonytailMode(root, {}), 'hint')
  writeMode(root, { mode: 'enforce' })
  assert.equal(readPonytailMode(root, {}), 'enforce')
})

test('环境变量 NOMI_PONYTAIL_MODE 优先（临时开关 / 测试注入），不认识的值忽略', (t) => {
  const root = tempRoot(t)
  writeMode(root, { mode: 'hint' })
  assert.equal(readPonytailMode(root, { NOMI_PONYTAIL_MODE: 'enforce' }), 'enforce')
  writeMode(root, { mode: 'enforce' })
  assert.equal(readPonytailMode(root, { NOMI_PONYTAIL_MODE: 'hint' }), 'hint')
  assert.equal(readPonytailMode(root, { NOMI_PONYTAIL_MODE: 'whatever' }), 'enforce')
})

test('仓库里的模式文件：当前是 hint，并写明了 Codex 恢复以后怎么重新开起来', () => {
  const real = JSON.parse(fs.readFileSync(path.join(repoRoot, PONYTAIL_MODE_FILE), 'utf8'))
  assert.equal(real.mode, 'hint')
  assert.match(real.reenable, /enforce/)
  assert.match(real.reenable, /review:branch/)
  assert.match(real.reason, /47/)
})

function makeRepo(t) {
  const root = tempRoot(t)
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  git('config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(root, 'a.txt'), 'x')
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  fs.writeFileSync(path.join(root, 'b.txt'), 'y')
  git('add', '-A')
  git('commit', '-q', '-m', 'new content, no receipt')
  return { root, head: git('rev-parse', 'HEAD') }
}

test('pre-push：没有收据时，enforce 拦（退出 1），hint 只提示（退出 0）并写明怎么补', (t) => {
  const { root, head } = makeRepo(t)
  const input = `refs/heads/x ${head} refs/heads/x ${ZERO}\n`
  const run = (mode) => spawnSync(process.execPath, [path.join(scriptsDir, 'ponytail-review-hook.mjs')], {
    cwd: root, encoding: 'utf8', input, env: { ...process.env, NOMI_PONYTAIL_MODE: mode },
  })
  const hard = run('enforce')
  assert.equal(hard.status, 1, hard.stderr)
  assert.match(hard.stderr, /BLOCKED/)
  const soft = run('hint')
  assert.equal(soft.status, 0, soft.stderr)
  assert.match(soft.stderr, /提示（不阻断）/)
  assert.match(soft.stderr, /review:branch/)
  assert.doesNotMatch(soft.stderr, /BLOCKED/)
})

test('check:ponytail-review：有未补审的延后记录时，enforce 红，hint 只打印提示', (t) => {
  const root = tempRoot(t)
  const ledger = path.join(root, 'ponytail-deferred.log')
  fs.writeFileSync(ledger, `2026-10-01T00:00:00.000Z|deferred|branch=x|sha=${SHA}|worktree=/w|reason=runner unavailable|reviewed=no\n`)
  const run = (mode) => spawnSync(process.execPath, [path.join(scriptsDir, 'check-ponytail-deferred.mjs')], {
    encoding: 'utf8', env: { ...process.env, NOMI_PONYTAIL_DEFERRED_LOG_OVERRIDE: ledger, NOMI_PONYTAIL_MODE: mode },
  })
  assert.equal(run('enforce').status, 1)
  const soft = run('hint')
  assert.equal(soft.status, 0, soft.stderr + soft.stdout)
  assert.match(`${soft.stdout}${soft.stderr}`, /提示（不阻断）/)
  assert.match(`${soft.stdout}${soft.stderr}`, new RegExp(SHA.slice(0, 7)))
})
