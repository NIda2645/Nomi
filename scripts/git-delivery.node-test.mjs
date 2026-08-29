import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import {
  DeliveryError,
  assertMergedState,
  assertPreflightState,
  classifyIdentity,
  inspectDeliveryState,
  preflightDelivery,
  runBoundedCommand,
  verifyMergedDelivery,
} from './git-delivery.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')

function git(cwd, args, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', ...options }).trim()
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, value)
}

function commit(cwd, message, value) {
  write(path.join(cwd, 'tracked.txt'), value)
  git(cwd, ['add', 'tracked.txt'])
  git(cwd, ['commit', '-m', message])
  return git(cwd, ['rev-parse', 'HEAD'])
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-git-delivery-'))
  const remote = path.join(root, 'remote.git')
  const seed = path.join(root, 'seed')
  const work = path.join(root, 'work')
  git(root, ['init', '--bare', remote])
  git(root, ['init', seed])
  git(seed, ['config', 'user.name', 'Nomi Test'])
  git(seed, ['config', 'user.email', 'nomi-test@example.invalid'])
  const baseSha = commit(seed, 'base', 'base\n')
  git(seed, ['branch', '-M', 'main'])
  git(seed, ['remote', 'add', 'origin', remote])
  git(seed, ['push', '-u', 'origin', 'main'])
  git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
  git(root, ['clone', remote, work])
  git(work, ['config', 'user.name', 'Nomi Test'])
  git(work, ['config', 'user.email', 'nomi-test@example.invalid'])
  return {
    root,
    remote,
    seed,
    work,
    baseSha,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  }
}

test('identity classification keeps commit identity separate from tree identity', () => {
  assert.equal(
    classifyIdentity({ headCommit: 'a', headTree: 't1', remoteCommit: 'a', remoteTree: 't1' }),
    'same-commit',
  )
  assert.equal(
    classifyIdentity({ headCommit: 'a', headTree: 't1', remoteCommit: 'b', remoteTree: 't1' }),
    'same-tree-different-commit',
  )
  assert.equal(
    classifyIdentity({ headCommit: 'a', headTree: 't1', remoteCommit: 'b', remoteTree: 't2' }),
    'different-tree',
  )
})

test('bounded transport terminates one hanging process without retrying it', async () => {
  const startedAt = Date.now()
  await assert.rejects(
    runBoundedCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 40 }),
    (error) => error instanceof DeliveryError && error.code === 'transport_timeout',
  )
  assert(Date.now() - startedAt < 2_000)
})

test('preflight refreshes once and accepts a clean task branch containing remote main', async (t) => {
  const f = fixture()
  t.after(f.cleanup)
  git(f.work, ['switch', '-c', 'codex/delivery-test'])
  commit(f.work, 'task', 'task\n')

  let fetchCount = 0
  const result = await preflightDelivery({
    cwd: f.work,
    fetchRemote: async () => {
      fetchCount += 1
    },
  })

  assert.equal(fetchCount, 1)
  assert.equal(result.branch, 'codex/delivery-test')
  assert.equal(result.remoteBaseIsAncestor, true)
  assert.equal(result.relation, 'different-tree')
})

test('preflight fails closed on protected, dirty, and stale task branches', async (t) => {
  const f = fixture()
  t.after(f.cleanup)

  assert.throws(() => assertPreflightState(inspectDeliveryState({ cwd: f.work })), /protected branch/)

  git(f.work, ['switch', '-c', 'codex/stale-task'])
  write(path.join(f.work, 'untracked.txt'), 'dirty\n')
  assert.throws(() => assertPreflightState(inspectDeliveryState({ cwd: f.work })), /worktree is not clean/)
  fs.rmSync(path.join(f.work, 'untracked.txt'))

  commit(f.seed, 'remote advances', 'remote\n')
  git(f.seed, ['push', 'origin', 'main'])
  await preflightDelivery({ cwd: f.work }).then(
    () => assert.fail('stale task branch should fail'),
    (error) => assert.match(error.message, /does not contain the refreshed remote baseline/),
  )
})

test('merged verification accepts only the exact fetched main commit, not an equivalent-tree task commit', async (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const expectedSha = git(f.work, ['rev-parse', 'origin/main'])

  git(f.work, ['switch', '--detach', expectedSha])
  const mergedState = inspectDeliveryState({ cwd: f.work })
  assert.doesNotThrow(() => assertMergedState(mergedState, { expectedSha }))

  git(f.work, ['switch', '-c', 'codex/equivalent-tree'])
  git(f.work, ['commit', '--allow-empty', '-m', 'metadata only'])
  const taskState = inspectDeliveryState({ cwd: f.work })
  assert.equal(taskState.relation, 'same-tree-different-commit')
  assert.throws(() => assertMergedState(taskState, { expectedSha }), /HEAD is not the expected merged commit/)
})

test('merged full validation writes one common-dir receipt and reuses it for the same SHA', async (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const expectedSha = git(f.work, ['rev-parse', 'origin/main'])
  git(f.work, ['switch', '--detach', expectedSha])

  let runs = 0
  const runFullProfile = () => {
    runs += 1
    return {
      profile: 'full-local',
      summary: { ok: true, passed: 5, selected: 5, failed: 0, skipped: 0, unsupported: 0, discovered: 5 },
      stages: [{ id: 'journeys-ci', status: 'passed', exitCode: 0, durationMs: 1 }],
      runDir: path.join(f.work, 'tests/system/runs/fake-full-local'),
    }
  }

  const first = await verifyMergedDelivery({
    cwd: f.work,
    expectedSha,
    fetchRemote: async () => {},
    runFullProfile,
  })
  const second = await verifyMergedDelivery({
    cwd: f.work,
    expectedSha,
    fetchRemote: async () => {},
    runFullProfile,
  })

  assert.equal(first.reused, false)
  assert.equal(second.reused, true)
  assert.equal(runs, 1)
  assert.equal(first.receipt.commitSha, expectedSha)
  assert.equal(first.receipt.treeSha, git(f.work, ['rev-parse', `${expectedSha}^{tree}`]))
  assert.equal(first.receipt.attempts.length, 1)
  assert.equal(second.receipt.attempts.length, 1)
  assert.match(first.receiptPath, /nomi-delivery.*full-local\.json$/)
})

test('merged validation lock prevents concurrent full runs for the same SHA', async (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const expectedSha = git(f.work, ['rev-parse', 'origin/main'])
  git(f.work, ['switch', '--detach', expectedSha])

  let releaseFirst
  let runs = 0
  const firstRun = new Promise((resolve) => {
    releaseFirst = resolve
  })
  const runFullProfile = async () => {
    runs += 1
    await firstRun
    return {
      summary: { ok: true, passed: 1, selected: 1 },
      stages: [],
      runDir: path.join(f.work, 'tests/system/runs/concurrent'),
    }
  }
  const first = verifyMergedDelivery({ cwd: f.work, expectedSha, fetchRemote: async () => {}, runFullProfile })
  await new Promise((resolve) => setImmediate(resolve))

  await assert.rejects(
    verifyMergedDelivery({ cwd: f.work, expectedSha, fetchRemote: async () => {}, runFullProfile }),
    (error) => error instanceof DeliveryError && error.code === 'validation_in_progress',
  )
  assert.equal(runs, 1)
  releaseFirst()
  await first
})

test('failed merged validation is receipted and never retried implicitly', async (t) => {
  const f = fixture()
  t.after(f.cleanup)
  const expectedSha = git(f.work, ['rev-parse', 'origin/main'])
  git(f.work, ['switch', '--detach', expectedSha])

  let runs = 0
  const runFullProfile = () => {
    runs += 1
    return { summary: { ok: false, passed: 0, selected: 1, failed: 1 }, stages: [], runDir: null }
  }
  await assert.rejects(
    verifyMergedDelivery({ cwd: f.work, expectedSha, fetchRemote: async () => {}, runFullProfile }),
    (error) => error instanceof DeliveryError && error.code === 'full_validation_failed',
  )
  await assert.rejects(
    verifyMergedDelivery({ cwd: f.work, expectedSha, fetchRemote: async () => {}, runFullProfile }),
    (error) => error instanceof DeliveryError && error.code === 'validation_already_failed',
  )
  assert.equal(runs, 1)
})

test('canonical delivery source has no REST object reconstruction escape path', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/git-delivery.mjs'), 'utf8')
  assert.doesNotMatch(source, /api\.github\.com|\/compare\/|hash-object[^\n]*commit|commit-tree/)

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['delivery:preflight'], 'node scripts/git-delivery.mjs preflight')
  assert.equal(pkg.scripts['delivery:verify-merged'], 'node scripts/git-delivery.mjs verify-merged')
  assert.match(pkg.scripts['check:git-delivery'], /git-delivery\.node-test\.mjs/)
  assert.match(pkg.scripts['gates:contracts'], /check:git-delivery/)
})
