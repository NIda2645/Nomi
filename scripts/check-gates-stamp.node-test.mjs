// 五门戳契约的类级回归测试（2026-09-02）。
//
// 报告到的那一例是「gates 写 .claude/.gates-ok、hook 读 <gitdir>/nomi-gates-ok」，
// 但真正的类是**写戳方与读戳方各自演进、没有任何东西强迫它们一致**。
//
// 这里额外钉住门岗自己的两个方向（第一版两边都栽过，见 check-gates-stamp.mjs 的注释）：
//   · 不许假绿——把 hook 里可执行那行改回老戳、注释原样留着，必须报红；
//   · 不许假红——把 sed 换成等价的 awk，行为没变，必须照样绿。
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkGatesStamp } from './check-gates-stamp.mjs'
import {
  MARKER_BASENAME,
  STAMP_KEYED_FIELDS,
  collectStampFields,
  resolveMarkerPath,
  writeStamp,
} from './stamp-gates-ok.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOOK_REL = 'scripts/claude-hooks/pre-push-check.sh'

/** 造一棵一次性 git 仓库，避免动到真仓库的戳。 */
function makeTempRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-gates-stamp-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const run = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  run('init', '-q')
  run('config', 'user.email', 'test@example.com')
  run('config', 'user.name', 'test')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
  run('add', '-A')
  run('commit', '-q', '--no-verify', '-m', 'init')
  return dir
}

/**
 * 复制一份仓库的契约面到临时目录，供「单边漂移」用例改写。
 * 注意 hook 必须是真文件——门岗会**实际执行**它。
 */
function makeContractFixture(t, { mutateHook } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-gates-contract-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'scripts', 'claude-hooks'), { recursive: true })
  fs.copyFileSync(path.join(repoRoot, 'scripts/stamp-gates-ok.mjs'), path.join(dir, 'scripts/stamp-gates-ok.mjs'))
  const hook = fs.readFileSync(path.join(repoRoot, HOOK_REL), 'utf8')
  fs.writeFileSync(path.join(dir, HOOK_REL), mutateHook ? mutateHook(hook) : hook)
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { gates: pkg.scripts.gates } }, null, 2))
  return dir
}

test('戳的内容由 STAMP_KEYED_FIELDS 逐项驱动，不是另一份硬编码模板', (t) => {
  const dir = makeTempRepo(t)
  const { marker } = writeStamp(dir)
  const written = fs
    .readFileSync(marker, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split('=')[0])
  // 声明的每个身份字段都必须真的写出去；stamped_at 是给人看的附加行。
  assert.deepEqual(
    written.filter((field) => field !== 'stamped_at'),
    [...STAMP_KEYED_FIELDS],
    '写出的身份字段必须与 STAMP_KEYED_FIELDS 逐项一致（此前 writeStamp 用的是硬编码模板，等于第二份真相源）',
  )

  const values = collectStampFields(dir)
  const body = fs.readFileSync(marker, 'utf8')
  for (const field of STAMP_KEYED_FIELDS) {
    assert.equal(body.match(new RegExp(`^${field}=(.*)$`, 'm'))[1], values[field])
  }
})

test('声明了字段却没有取值来源 → 直接抛错，不许写出空字段', (t) => {
  const dir = makeTempRepo(t)
  STAMP_KEYED_FIELDS.push('branch')
  try {
    assert.throws(() => collectStampFields(dir), /branch/)
  } finally {
    STAMP_KEYED_FIELDS.pop()
  }
})

test('戳落在本树自己的 gitdir 下（多 worktree 不互相顶用）', (t) => {
  const dir = makeTempRepo(t)
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: dir, encoding: 'utf8' }).trim()
  assert.equal(resolveMarkerPath(dir), path.join(gitDir, MARKER_BASENAME))
})

test('真仓库当前状态：写戳方与读戳方一致（实跑读戳方）', () => {
  assert.deepEqual(checkGatesStamp(repoRoot), [])
})

test('写戳方漂移（退回老的内联 .gates-ok）→ 门岗报红', (t) => {
  const dir = makeContractFixture(t)
  const pkgPath = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.scripts.gates = 'pnpm run gates:contracts && node -e "require(\'fs\').writeFileSync(\'.claude/.gates-ok\',\'x\')"'
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  const problems = checkGatesStamp(dir)
  assert.ok(problems.some((p) => p.includes('没有调用 scripts/stamp-gates-ok.mjs')), '应指出 gates 不再调用唯一书写者')
  assert.ok(problems.some((p) => p.includes('.gates-ok')), '应指出老戳复活')
})

test('读戳方漂移：可执行那行改回老戳、注释原样保留 → 必须报红（门岗 v1 在这里假绿过）', (t) => {
  const dir = makeContractFixture(t, {
    mutateHook: (hook) => {
      const next = hook.replace('MARKER="$GITDIR/nomi-gates-ok"', 'MARKER="$ROOT/.claude/.gates-ok"')
      assert.notEqual(next, hook, '替换必须真的命中，否则这条测试是空转')
      // 注释里仍然留着 nomi-gates-ok / --absolute-git-dir——v1 的文本匹配正是被它骗过去的。
      assert.ok(next.includes(MARKER_BASENAME), '注释中应仍含旧字符串，才能复现 v1 的假绿条件')
      return next
    },
  })
  const problems = checkGatesStamp(dir)
  assert.ok(problems.length > 0, '注释里有正确字符串不代表 hook 行为正确；必须实跑才拦得住')
  assert.ok(problems.some((p) => p.includes('不认')), '应指出读戳方不认书写者盖出的戳')
})

test('读戳方等价改写（sed → awk）行为不变 → 必须照样绿（不许假红）', (t) => {
  const dir = makeContractFixture(t, {
    mutateHook: (hook) => {
      const next = hook
        .replace(`STAMP_SHA="$(sed -n 's/^sha=//p' "$MARKER" | head -1)"`, `STAMP_SHA="$(awk -F= '/^sha=/{print $2; exit}' "$MARKER")"`)
        .replace(
          `STAMP_WT="$(sed -n 's/^worktree=//p' "$MARKER" | head -1)"`,
          `STAMP_WT="$(awk -F= '/^worktree=/{print $2; exit}' "$MARKER")"`,
        )
      assert.ok(next.includes('awk -F='), '替换必须真的命中，否则这条测试是空转')
      return next
    },
  })
  assert.deepEqual(
    checkGatesStamp(dir),
    [],
    '等价的 shell 写法必须被接受——会误报的门岗三次之后就会被人绕过（见 docs/design/page-design-process.md）',
  )
})

test('读戳方推荐了不存在的补盖脚本 → 门岗报红（报告到的那一例）', (t) => {
  const dir = makeContractFixture(t, {
    mutateHook: (hook) => {
      const next = hook.replace('node ./scripts/stamp-gates-ok.mjs', 'node ./scripts/stamp-gates-ok-typo.mjs')
      assert.notEqual(next, hook, '替换必须真的命中，否则这条测试是空转')
      return next
    },
  })
  const problems = checkGatesStamp(dir)
  assert.ok(
    problems.some((p) => p.includes('stamp-gates-ok-typo.mjs') && p.includes('不存在')),
    '应指出 hook 让人运行一个不存在的脚本',
  )
})
