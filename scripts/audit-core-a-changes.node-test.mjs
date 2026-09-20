import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { applyReviews, captureChanges } from './audit-core-a-changes.mjs'

test('captures committed, staged, unstaged, removed and untracked changes without changing the real index', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-audit-coverage-'))
  try {
    const repo = path.join(scratch, 'repo')
    fs.mkdirSync(repo)
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('init', '-b', 'main')
    git('config', 'user.name', 'audit fixture')
    git('config', 'user.email', 'audit@example.invalid')
    for (const name of ['committed.ts', 'staged.ts', 'unstaged.ts', 'removed.ts', 'old.test.ts']) fs.writeFileSync(path.join(repo, name), 'original\n')
    git('add', '.')
    git('commit', '-m', 'fixture base')
    const base = git('rev-parse', 'HEAD')
    git('switch', '-c', 'audit-task')
    fs.writeFileSync(path.join(repo, 'committed.ts'), 'committed\n')
    git('add', 'committed.ts')
    git('commit', '-m', 'fixture task')
    fs.writeFileSync(path.join(repo, 'staged.ts'), 'staged\n')
    git('add', 'staged.ts')
    fs.writeFileSync(path.join(repo, 'unstaged.ts'), 'unstaged\n')
    fs.writeFileSync(path.join(repo, 'old.test.ts'), 'changed assertion\n')
    fs.unlinkSync(path.join(repo, 'removed.ts'))
    fs.writeFileSync(path.join(repo, 'new file.ts'), 'new untracked\n')
    const indexBefore = fs.readFileSync(path.join(repo, '.git/index'))
    const outputDir = path.join(scratch, 'report')
    const report = captureChanges(repo, base, outputDir)
    assert.deepEqual(report.files.map(file => file.path).sort(), ['committed.ts', 'staged.ts', 'unstaged.ts', 'removed.ts', 'old.test.ts', 'new file.ts'].sort())
    assert.equal(report.files.find(file => file.path === 'removed.ts').currentBlob, null)
    assert.equal(report.files.find(file => file.path === 'new file.ts').untracked, true)
    assert.match(fs.readFileSync(path.join(outputDir, 'existing-tests.diff'), 'utf8'), /changed assertion/)
    for (const file of report.files) {
      assert.ok(file.patchSha256 && file.hunks.length)
      assert.equal(file.semanticReview, 'unreviewed')
      assert.ok(fs.existsSync(path.join(outputDir, file.patchFile)))
    }
    assert.deepEqual(fs.readFileSync(path.join(repo, '.git/index')), indexBefore)
    assert.equal(git('rev-parse', 'HEAD'), report.head)
    assert.throws(() => captureChanges(repo, 'nonexistent-base', path.join(scratch, 'bad')))
  } finally { fs.rmSync(scratch, { recursive: true, force: true }) }
})

test('omitted hunks cannot pass; stale evidence and duplicate judgments are rejected', () => {
  const makeReport = () => ({ files: [{ path: 'file.ts', patchSha256: 'hash', hunks: [{ id: '1.1', verdict: 'unreviewed' }, { id: '1.2', verdict: 'unreviewed' }] }] })
  const hunk = { id: '1.1', verdict: 'correct', attribution: 'not-a-defect', priorBehavior: 'old', newBehavior: 'new', rationale: 'reason', evidence: 'file:line and actual check' }
  const review = { path: 'file.ts', patchSha256: 'hash', hunks: [hunk] }
  const report = makeReport()
  applyReviews(report, [review])
  assert.equal(report.semanticStatus, 'unresolved')
  assert.throws(() => applyReviews(makeReport(), [{ ...review, patchSha256: 'old-hash' }]))
  assert.throws(() => applyReviews(makeReport(), [{ ...review, hunks: [hunk, hunk] }]))
  assert.throws(() => applyReviews(makeReport(), [{ ...review, hunks: [{ ...hunk, evidence: '' }] }]))
  applyReviews(report, [{ ...review, hunks: [hunk, { ...hunk, id: '1.2' }] }])
  assert.equal(report.semanticStatus, 'reviewed-no-open-findings')
})
