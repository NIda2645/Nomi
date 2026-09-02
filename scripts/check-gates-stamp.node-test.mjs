// 五门戳契约的类级回归测试（2026-09-02）。
//
// 报告到的那一例是「gates 写 .claude/.gates-ok、hook 读 <gitdir>/nomi-gates-ok」，
// 但真正的类是**写戳方与读戳方各自演进、没有任何东西强迫它们一致**。
// 所以这里既钉住那一例，也钉住类：书写者真能盖出读戳方认得的戳，
// 且门岗对「任一方单独漂移」都报红。
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkGatesStamp } from './check-gates-stamp.mjs'
import { MARKER_BASENAME, STAMP_KEYED_FIELDS, resolveMarkerPath, writeStamp } from './stamp-gates-ok.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOOK_REL = 'scripts/claude-hooks/pre-push-check.sh'

/** 造一棵一次性 git 仓库，避免动到真仓库的戳。 */
function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-gates-stamp-'))
  const run = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  run('init', '-q')
  run('config', 'user.email', 'test@example.com')
  run('config', 'user.name', 'test')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
  run('add', '-A')
  run('commit', '-q', '-m', 'init')
  return dir
}

test('书写者盖出的戳，读戳方三项判定都认', () => {
  const dir = makeTempRepo()
  try {
    const { marker, sha, worktree } = writeStamp(dir)
    assert.equal(path.basename(marker), MARKER_BASENAME)
    assert.ok(fs.existsSync(marker), '戳文件应真的落盘')

    const body = fs.readFileSync(marker, 'utf8')
    // 逐字段用读戳方那把尺子（`sed -n 's/^field=//p'` 等价的行首精确匹配）解析。
    for (const field of STAMP_KEYED_FIELDS) {
      const parsed = body.split('\n').find((line) => line.startsWith(`${field}=`))
      assert.ok(parsed, `戳里应有 ${field}= 字段`)
    }
    assert.equal(body.match(/^sha=(.*)$/m)[1], sha)
    assert.equal(body.match(/^worktree=(.*)$/m)[1], worktree)

    // 读戳方拿 `git rev-parse --show-toplevel` 与戳里的 worktree 比对，必须逐字相等。
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim()
    assert.equal(worktree, toplevel, 'worktree 字段必须与读戳方算出的树根逐字相同')

    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
    assert.equal(sha, headSha, 'sha 字段必须是盖戳时的 HEAD')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('戳落在本树自己的 gitdir 下（多 worktree 不互相顶用）', () => {
  const dir = makeTempRepo()
  try {
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: dir, encoding: 'utf8' }).trim()
    assert.equal(resolveMarkerPath(dir), path.join(gitDir, MARKER_BASENAME))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('真仓库当前状态：写戳方与读戳方一致', () => {
  assert.deepEqual(checkGatesStamp(repoRoot), [])
})

/** 在临时目录里复制一份仓库的契约面，供"单边漂移"用例改写。 */
function makeContractFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-gates-contract-'))
  fs.mkdirSync(path.join(dir, 'scripts', 'claude-hooks'), { recursive: true })
  fs.copyFileSync(path.join(repoRoot, HOOK_REL), path.join(dir, HOOK_REL))
  fs.copyFileSync(
    path.join(repoRoot, 'scripts/stamp-gates-ok.mjs'),
    path.join(dir, 'scripts/stamp-gates-ok.mjs'),
  )
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ scripts: { gates: pkg.scripts.gates } }, null, 2),
  )
  return dir
}

test('写戳方漂移（退回老的内联 .gates-ok）→ 门岗报红', () => {
  const dir = makeContractFixture()
  try {
    const pkgPath = path.join(dir, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.scripts.gates =
      'pnpm run gates:contracts && node -e "require(\'fs\').writeFileSync(\'.claude/.gates-ok\',\'x\')"'
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

    const problems = checkGatesStamp(dir)
    assert.ok(
      problems.some((p) => p.includes('没有调用 scripts/stamp-gates-ok.mjs')),
      '应指出 gates 不再调用唯一书写者',
    )
    assert.ok(problems.some((p) => p.includes('.gates-ok')), '应指出老戳复活')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('读戳方漂移（改回固定路径的老戳）→ 门岗报红', () => {
  const dir = makeContractFixture()
  try {
    const hookPath = path.join(dir, HOOK_REL)
    const legacyHook = fs
      .readFileSync(hookPath, 'utf8')
      .replaceAll(MARKER_BASENAME, '.gates-ok')
      .replaceAll('--absolute-git-dir', '--show-toplevel')
      .replace(/s\/\^sha=\/\/p/g, 'noop')
      .replace(/s\/\^worktree=\/\/p/g, 'noop')
    fs.writeFileSync(hookPath, legacyHook)

    const problems = checkGatesStamp(dir)
    assert.ok(problems.some((p) => p.includes(`没有读 \`${MARKER_BASENAME}\``)), '应指出戳文件名对不上')
    assert.ok(problems.some((p) => p.includes('--absolute-git-dir')), '应指出丢了一树一戳的定位方式')
    for (const field of STAMP_KEYED_FIELDS) {
      assert.ok(problems.some((p) => p.includes(`\`${field}=\` 字段`)), `应指出漏读 ${field}`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('读戳方推荐了不存在的补盖脚本 → 门岗报红（报告到的那一例）', () => {
  const dir = makeContractFixture()
  try {
    const hookPath = path.join(dir, HOOK_REL)
    fs.writeFileSync(
      hookPath,
      fs.readFileSync(hookPath, 'utf8').replace('stamp-gates-ok.mjs', 'stamp-gates-ok-typo.mjs'),
    )
    const problems = checkGatesStamp(dir)
    assert.ok(
      problems.some((p) => p.includes('stamp-gates-ok-typo.mjs') && p.includes('不存在')),
      '应指出 hook 让人运行一个不存在的脚本',
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
