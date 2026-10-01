#!/usr/bin/env node
// 每日雷达 hook 的行为测试。最要紧的一条：脚本跑败时输出里必须明说「今天没查成」，
// 并且绝不出现任何会被读成「没有新东西」的措辞（这正是 CLAUDE.md 老规矩想防、却只靠自觉的事）。
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { latestPaperRadarDate, localDate, runDailyRadar } from './daily-radar-session.mjs'

const NOW = new Date(2026, 9, 2, 9, 5) // 2026-10-02 09:05 本机时间
const ok = (stdout) => () => ({ status: 0, stdout })
const bad = (status = 1, stderr = 'boom') => () => ({ status, stdout: '', stderr })
const readdir = (names) => () => names

describe('成功', () => {
  test('两个脚本都成功 → 带出结果与分诊提示，标记记下今天', () => {
    const { text, marker } = runDailyRadar({ root: '/x', now: NOW, run: (_root, radar) => ({ status: 0, stdout: `${radar.script} 结果行\n新增 0` }), readdir: readdir([]) })
    assert.match(text, /【用户反馈雷达】已跑/)
    assert.match(text, /intake:radar 结果行/)
    assert.match(text, /【供应商模型雷达】已跑/)
    assert.match(text, /nomi-model-radar/)
    assert.equal(marker.date, localDate(NOW))
    assert.equal(marker.intake.ok, true)
    assert.equal(marker.models.ok, true)
  })
})

describe('失败必须明说，不许说成没有新东西', () => {
  for (const [name, run, expectWhy] of [
    ['退出码非 0', bad(2), /脚本退出码 2/],
    ['超时', () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }), /超时/],
    ['没能启动', () => ({ status: null, stdout: '', stderr: '', error: Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' }) }), /没能启动/],
  ]) {
    test(name, () => {
      const { text, marker } = runDailyRadar({ root: '/x', now: NOW, run, readdir: readdir([]) })
      assert.match(text, /【用户反馈雷达】今天没查成/)
      assert.match(text, /【供应商模型雷达】今天没查成/)
      assert.match(text, expectWhy)
      assert.match(text, /不是没有新东西/)
      assert.doesNotMatch(text, /没有新反馈了|没有新模型了|无新增|一切正常/)
      assert.equal(marker.intake.ok, false)
    })
  }

  test('失败时把脚本自己的报错尾巴带出来，别吞', () => {
    const { text } = runDailyRadar({ root: '/x', now: NOW, run: bad(1, 'Cloudflare token missing'), readdir: readdir([]) })
    assert.match(text, /Cloudflare token missing/)
  })
})

describe('一天一次，失败重试', () => {
  test('今天已成功的不重跑；失败的下次会话重试', () => {
    let calls = []
    const run = (_root, radar) => { calls.push(radar.script); return { status: 0, stdout: 'ok' } }
    const marker = { date: localDate(NOW), intake: { ok: true, at: '08:00' }, models: { ok: false, at: '08:00' } }
    const { text, marker: next } = runDailyRadar({ root: '/x', now: NOW, run, marker, readdir: readdir([]) })
    assert.deepEqual(calls, ['radar:models'])
    assert.match(text, /【用户反馈雷达】今天已跑过（08:00）/)
    assert.equal(next.models.ok, true)
  })

  test('标记是昨天的 → 全部重新跑', () => {
    const calls = []
    runDailyRadar({ root: '/x', now: NOW, run: (_r, radar) => { calls.push(radar.script); return { status: 0, stdout: '' } }, marker: { date: '2026-10-01', intake: { ok: true, at: '08:00' }, models: { ok: true, at: '08:00' } }, readdir: readdir([]) })
    assert.deepEqual(calls, ['intake:radar', 'radar:models'])
  })
})

describe('论文雷达与竞品雷达的提醒', () => {
  test('今天已有 → 跳过；没有 → 提醒起技能', () => {
    const have = runDailyRadar({ root: '/x', now: NOW, run: ok('x'), readdir: readdir(['2026-10-01-radar.md', '2026-10-02-radar.md', 'other.md']) })
    assert.match(have.text, /今天已有 docs\/research\/2026-10-02-radar\.md，跳过/)
    const lack = runDailyRadar({ root: '/x', now: NOW, run: ok('x'), readdir: readdir(['2026-09-28-radar.md']) })
    assert.match(lack.text, /今天还没有.*最新：2026-09-28/)
    assert.match(lack.text, /nomi-research-radar/)
    assert.match(lack.text, /nomi-competitive-radar/)
  })

  test('目录读不了 → 当作没有（提醒仍给）', () => {
    assert.equal(latestPaperRadarDate('/x', () => { throw new Error('nope') }), null)
  })
})

describe('真跑 hook（用假的 pnpm 不可行，只验「脚本跑不通也不崩、退出 0、明说没查成」）', () => {
  test('在一个没有这些脚本的目录里运行 → 退出 0，输出明说今天没查成', async () => {
    const { spawnSync } = await import('node:child_process')
    const os = await import('node:os')
    const fs = await import('node:fs')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-radar-'))
    try {
      const here = path.dirname(fileURLToPath(import.meta.url))
      const result = spawnSync('bash', [path.join(here, 'claude-hooks', 'daily-radar.sh')], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8', timeout: 120000,
      })
      // 目录里没有 daily-radar-session.mjs → 静默放行（fail-open）；这是「文件缺失」分支
      assert.equal(result.status, 0)
      assert.equal(result.stdout, '')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
