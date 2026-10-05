// 方向检查计数器 + commit-msg 校验的测试：全部走真 git 仓库（临时目录），不 mock 提交历史。
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { decideDirectionTrailer, docLooksReal, subjectOf } from './check-direction-trailer.mjs'
import { churnFor, findHotspots, isFixSubject, isRevertOfFix, namespaceLines, parseDirectionTrailer, parseHunks, PRIOR_FIX_THRESHOLD, ROOT_NS, stagedNamespaces, touchedNamespaces } from './fix-churn.mjs'

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))

function repo(subjects, { dir = 'src/feature', files = ['a.ts'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-churn-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  fs.mkdirSync(path.join(root, dir), { recursive: true })
  subjects.forEach((subject, i) => {
    const f = files[i % files.length]
    fs.writeFileSync(path.join(root, dir, f), `export const v = ${i}\n`)
    git('add', '-A'); git('commit', '-q', '-m', subject)
  })
  return { root, git, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

describe('fix-churn 计数', () => {
  test('标题判据：fix / hotfix 算，revert fix 单算，feat / 合并不算', () => {
    assert.ok(isFixSubject('fix(x): a') && isFixSubject('Hotfix: b'))
    assert.ok(!isFixSubject('feat: a') && !isFixSubject('chore(fix): a') && !isFixSubject('Merge pull request #1'))
    assert.ok(isRevertOfFix('Revert "fix(director): 上一刀"'))
    assert.ok(!isRevertOfFix('Revert "feat: x"'))
    assert.equal(PRIOR_FIX_THRESHOLD, 2)
  })

  test('同一文件已有 2 个 fix 则命中（这一刀是第 3 个）；只有 1 个则不命中', () => {
    const r = repo(['feat: add', 'fix: one', 'fix: two'])
    try {
      const hot = churnFor(r.root, 'src/feature/a.ts')
      assert.equal(hot.hot, true)
      assert.match(hot.reasons[0], /第 3 个/)
    } finally { r.cleanup() }
    const r2 = repo(['feat: add', 'fix: one'])
    try { assert.equal(churnFor(r2.root, 'src/feature/a.ts').hot, false) } finally { r2.cleanup() }
  })

  test('分散在同目录不同文件的 fix 也算同一概念：目录命中、文件不命中', () => {
    const r = repo(['feat: add', 'fix: one', 'fix: two'], { files: ['a.ts', 'b.ts'] })
    try {
      fs.writeFileSync(path.join(r.root, 'src/feature/c.ts'), 'export const c = 1\n')
      r.git('add', '-A'); r.git('commit', '-q', '-m', 'feat: c')
      const entry = churnFor(r.root, 'src/feature/c.ts')
      assert.equal(entry.file.fixes, 0)
      assert.equal(entry.hot, true)
      assert.match(entry.reasons.join(), /目录 src\/feature\//)
    } finally { r.cleanup() }
  })

  test('近期出现 revert fix 则不看数量直接命中', () => {
    const r = repo(['feat: add', 'fix: one', 'Revert "fix: one"'])
    try {
      const entry = churnFor(r.root, 'src/feature/a.ts')
      assert.equal(entry.hot, true)
      assert.match(entry.reasons.join(), /revert fix/)
    } finally { r.cleanup() }
  })

  test('findHotspots 只看 src/ electron/ 下的源码：测试文件、文档不算', () => {
    const r = repo(['feat: add', 'fix: one', 'fix: two'])
    try {
      assert.equal(findHotspots(r.root, ['src/feature/a.ts']).length, 1)
      assert.equal(findHotspots(r.root, ['src/feature/a.test.ts', 'docs/x.md', 'scripts/a.mjs']).length, 0)
    } finally { r.cleanup() }
  })

  test('git 失败则不命中（fail-open）', () => {
    const git = () => { throw new Error('boom') }
    assert.equal(churnFor('/x', 'src/a.ts', { git }).hot, false)
  })
})

describe('trailer 解析与决策', () => {
  const hit = [{ path: 'src/a.ts', reasons: ['x'] }]
  const deps = (over = {}) => ({ stagedFiles: () => ['src/a.ts'], hotspots: () => hit, docOk: () => true, ...over })

  test('标题与 trailer 解析（忽略注释行）', () => {
    assert.equal(subjectOf('# c\n\nfix: a\n\nbody'), 'fix: a')
    assert.equal(parseDirectionTrailer('fix: a\n\nDirection-Check: docs/plan/x.md\n'), 'docs/plan/x.md')
    assert.equal(parseDirectionTrailer('fix: a\n# Direction-Check: docs/x.md\n'), null)
  })
  test('非 fix（含 merge / revert）直接放行，连热点都不查', () => {
    for (const m of ['feat: a', 'Merge branch x', 'Revert "fix: a"']) {
      assert.equal(decideDirectionTrailer(m, deps({ hotspots: () => { throw new Error('不该查') } })).ok, true)
    }
  })
  test('fix 未命中热点放行；命中且无 trailer 拦下；有 trailer 但文档不成立拦下；成立放行', () => {
    assert.equal(decideDirectionTrailer('fix: a', deps({ hotspots: () => [] })).ok, true)
    assert.equal(decideDirectionTrailer('fix: a', deps()).ok, false)
    assert.equal(decideDirectionTrailer('fix: a\n\nDirection-Check: docs/x.md', deps({ docOk: () => false })).ok, false)
    assert.equal(decideDirectionTrailer('fix: a\n\nDirection-Check: docs/x.md', deps()).ok, true)
  })
  test('环境变量不能绕过（判据只看内容）', () => {
    const prev = process.env.NOMI_SKIP_DIRECTION_CHECK
    process.env.NOMI_SKIP_DIRECTION_CHECK = '1'
    try { assert.equal(decideDirectionTrailer('fix: a', deps()).ok, false) } finally { if (prev === undefined) delete process.env.NOMI_SKIP_DIRECTION_CHECK; else process.env.NOMI_SKIP_DIRECTION_CHECK = prev }
  })
  test('docLooksReal：必须在 docs/ 下、.md、够长、不许越界', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-doc-'))
    try {
      fs.mkdirSync(path.join(dir, 'docs'))
      fs.writeFileSync(path.join(dir, 'docs', 'ok.md'), 'x'.repeat(500))
      fs.writeFileSync(path.join(dir, 'docs', 'short.md'), 'x')
      assert.ok(docLooksReal(dir, 'docs/ok.md'))
      assert.ok(!docLooksReal(dir, 'docs/short.md'))
      assert.ok(!docLooksReal(dir, 'docs/missing.md'))
      assert.ok(!docLooksReal(dir, '../docs/ok.md'))
      assert.ok(!docLooksReal(dir, 'README.md'))
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('真 git commit-msg 端到端', () => {
  test('热点 fix 无 trailer 被拦、带有效 trailer 通过；revert 与 merge 不被拦', () => {
    const r = repo(['feat: add', 'fix: one', 'fix: two'])
    try {
      const msgPath = path.join(r.root, 'MSG')
      const run = (msg) => {
        fs.writeFileSync(msgPath, msg)
        return spawnSync('node', [path.join(SCRIPTS, 'check-direction-trailer.mjs'), msgPath], { cwd: r.root, encoding: 'utf8' })
      }
      fs.writeFileSync(path.join(r.root, 'src/feature/a.ts'), 'export const v = 99\n')
      r.git('add', '-A')
      const blocked = run('fix: three')
      assert.equal(blocked.status, 1)
      assert.match(blocked.stderr, /缺 Direction-Check/)
      fs.mkdirSync(path.join(r.root, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(r.root, 'docs', 'review.md'), '复盘'.repeat(300))
      assert.equal(run('fix: three\n\nDirection-Check: docs/review.md\n').status, 0)
      assert.equal(run('fix: three\n\nDirection-Check: docs/nope.md\n').status, 1)
      assert.equal(run('Revert "fix: two"').status, 0)
      assert.equal(run('Merge branch main').status, 0)
      assert.equal(run('feat: other').status, 0)
    } finally { r.cleanup() }
  })
})

describe('词典按功能键（命名空间）计数', () => {
  const FILE = 'src/i18n/locales/dict.ts'
  const body = (a, b, c) => [
    'export const zhDict = {',
    '  title: \'顶层单句\',',
    '  alpha: {', `    one: '${a}',`, '  },',
    '  beta: {', `    two: '${b}',`, `    three: '${c}',`, '  },',
    '}', '',
    'export const enDict = {',
    '  alpha: {', `    one: '${a}-en',`, '  },',
    '  beta: {', `    two: '${b}-en',`, '  },',
    '}', '',
  ].join('\n')
  const dictRepo = (steps) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-churn-ns-'))
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
    fs.mkdirSync(path.join(root, 'src/i18n/locales'), { recursive: true })
    const state = { a: 'a0', b: 'b0', c: 'c0' }
    steps.forEach(([subject, patch], i) => {
      Object.assign(state, patch)
      fs.writeFileSync(path.join(root, FILE), body(state.a, state.b, state.c))
      git('add', '-A'); git('commit', '-q', '-m', subject || `c${i}`)
    })
    return { root, git, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
  }

  test('namespaceLines：缩进 2 格、值是 { 的键是功能键；中英两段同名；其余归 (根)', () => {
    const map = namespaceLines(body('a', 'b', 'c'))
    assert.equal(map[1], ROOT_NS) // export 行
    assert.equal(map[2], ROOT_NS) // 顶层单句
    assert.equal(map[3], 'alpha')
    assert.equal(map[4], 'alpha')
    assert.equal(map[5], 'alpha') // 闭合行
    assert.equal(map[7], 'beta')
    assert.equal(map[10], ROOT_NS) // 文件末 }
    assert.equal(map[14], 'alpha') // 英文段同名
  })

  test('touchedNamespaces：改动行按旧 / 新源码归属；一个提交改到几个键各计一次', () => {
    const oldSrc = body('a0', 'b0', 'c0')
    const newSrc = body('a1', 'b1', 'c0')
    const hunks = parseHunks('@@ -4 +4 @@\n-x\n+y\n@@ -7 +7 @@\n-x\n+y\n@@ -2 +2 @@\n+z\n')
    assert.deepEqual([...touchedNamespaces(hunks, oldSrc, newSrc)].sort(), [ROOT_NS, 'alpha', 'beta'].sort())
  })

  test('同一功能键 2 个 fix 后第 3 刀命中，并写出「文件#键」；别的键不受牵连', () => {
    const r = dictRepo([['feat: add', {}], ['fix: a1', { a: 'a1' }], ['fix: a2', { a: 'a2' }], ['fix: b1', { b: 'b1' }]])
    try {
      const mk = (patch) => {
        const state = { a: 'a2', b: 'b1', c: 'c0', ...patch }
        fs.writeFileSync(path.join(r.root, FILE), body(state.a, state.b, state.c))
        r.git('add', '-A')
        return findHotspots(r.root, [FILE], { touched: stagedNamespaces(r.root, [FILE]) })
      }
      const hotA = mk({ a: 'a3' })
      assert.equal(hotA.length, 1)
      assert.match(hotA[0].reasons[0], /dict\.ts#alpha 近 14 天已有 2 个 fix，这一刀是第 3 个/)
      r.git('reset', '-q', '--hard')
      assert.equal(mk({ b: 'b2' }).length, 0) // beta 只有 1 个 fix
      r.git('reset', '-q', '--hard')
      assert.equal(findHotspots(r.root, [FILE]).length, 1) // 没给改动范围：报文件里已达标的键
    } finally { r.cleanup() }
  })

  test('文件级不再响：同一词典文件散在 3 个不同功能键的 fix 不命中', () => {
    const r = dictRepo([['feat: add', {}], ['fix: a', { a: 'a1' }], ['fix: b', { b: 'b1' }], ['fix: bb', { b: 'b2' }]])
    try {
      fs.writeFileSync(path.join(r.root, FILE), body('a2', 'b2', 'c0'))
      r.git('add', '-A')
      assert.equal(findHotspots(r.root, [FILE], { touched: stagedNamespaces(r.root, [FILE]) }).length, 0)
    } finally { r.cleanup() }
  })

  test('一个提交改到两个键，两个键各计一次', () => {
    const r = dictRepo([['feat: add', {}], ['fix: both1', { a: 'a1', b: 'b1' }], ['fix: both2', { a: 'a2', b: 'b2' }]])
    try {
      const hits = findHotspots(r.root, [FILE])
      assert.deepEqual(hits[0].reasons.map((x) => x.match(/#(\S+)/)[1]).sort(), ['alpha', 'beta'])
    } finally { r.cleanup() }
  })

  test('真 git commit-msg：词典第 3 个同键 fix 无 trailer 被拦，换一个键放行', () => {
    const r = dictRepo([['feat: add', {}], ['fix: a1', { a: 'a1' }], ['fix: a2', { a: 'a2' }]])
    try {
      const msgPath = path.join(r.root, 'MSG')
      const run = (msg) => { fs.writeFileSync(msgPath, msg); return spawnSync('node', [path.join(SCRIPTS, 'check-direction-trailer.mjs'), msgPath], { cwd: r.root, encoding: 'utf8' }) }
      fs.writeFileSync(path.join(r.root, FILE), body('a3', 'b0', 'c0')); r.git('add', '-A')
      const blocked = run('fix: a3')
      assert.equal(blocked.status, 1)
      assert.match(blocked.stderr, /dict\.ts#alpha/)
      r.git('reset', '-q', '--hard')
      fs.writeFileSync(path.join(r.root, FILE), body('a2', 'b9', 'c0')); r.git('add', '-A')
      assert.equal(run('fix: b').status, 0)
    } finally { r.cleanup() }
  })
})
