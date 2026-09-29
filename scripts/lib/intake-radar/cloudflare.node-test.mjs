import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import {
  parseOAuthTokenFromToml,
  parseAccountIdFromWhoami,
  wranglerConfigCandidates,
  readWranglerOAuthToken,
  whoamiAccountId,
} from './cloudflare.mjs'

// 占位测试向量，不是任何真实 Cloudflare 账号 id——只用来测「从 whoami 输出里挑一个
// 32 位十六进制串」这条解析逻辑，形状对了就够。只在这一处写字面量并打防误报标记，
// 其余测试都引用这个常量（模板插值），源码文本里就不会再出现第二处裸 32 位 hex，
// 门岗 `check:secrets` 的行级豁免棘轮也就不用为这一份夹具多开三个名额。
const FAKE_ACCOUNT_ID = '0123456789abcdef0123456789abcdef' // nomi-secret-scan:allow 占位测试向量，非真实账号 id，见上方注释

test('parseOAuthTokenFromToml 取出 oauth_token 的值', () => {
  const toml = `some_other_key = "x"\noauth_token = "fake-token-value-for-test"\nexpiration_time = "2027-01-01"\n`
  assert.equal(parseOAuthTokenFromToml(toml), 'fake-token-value-for-test')
})

test('parseOAuthTokenFromToml 没有这一行时返回空串（不抛）', () => {
  assert.equal(parseOAuthTokenFromToml('some_other_key = "x"'), '')
  assert.equal(parseOAuthTokenFromToml(''), '')
  assert.equal(parseOAuthTokenFromToml(undefined), '')
})

test('parseAccountIdFromWhoami 从表格输出里挑 32 位十六进制账号 id', () => {
  const output = [
    '⛅️ wrangler 4.0.0',
    '👋 You are logged in with an OAuth Token, associated with the email person@example.com.',
    '┌──────────────┬──────────────────────────────────┐',
    '│ Account Name │ Account ID                        │',
    '├──────────────┼──────────────────────────────────┤',
    `│ Example Team  │ ${FAKE_ACCOUNT_ID} │`,
    '└──────────────┴──────────────────────────────────┘',
  ].join('\n')
  assert.equal(parseAccountIdFromWhoami(output), FAKE_ACCOUNT_ID)
})

test('parseAccountIdFromWhoami 解不出来时返回空串（不猜、不抛）', () => {
  assert.equal(parseAccountIdFromWhoami('You are not authenticated'), '')
  assert.equal(parseAccountIdFromWhoami(''), '')
})

test('wranglerConfigCandidates 在 Windows 上把已验证路径排第一优先级（WRANGLER_HOME 之后）', () => {
  const candidates = wranglerConfigCandidates({ APPDATA: 'C:\\Users\\test\\AppData\\Roaming' }, 'C:\\Users\\test', 'win32')
  assert.ok(candidates[0].includes('xdg.config'))
  assert.ok(candidates[0].includes('.wrangler'))
})

test('wranglerConfigCandidates 尊重 WRANGLER_HOME 覆盖，且始终包含 XDG 默认位置（非 Windows 平台也能用）', () => {
  const candidates = wranglerConfigCandidates({ WRANGLER_HOME: '/custom/wrangler' }, '/home/test', 'linux')
  assert.equal(candidates[0], path.join('/custom/wrangler', 'config', 'default.toml'))
  assert.ok(candidates.some((c) => c.includes('.config')))
})

test('readWranglerOAuthToken 依次试候选路径，第一个能解出 token 的赢', () => {
  const token = readWranglerOAuthToken({
    candidates: ['/does/not/exist.toml', '/second/candidate.toml'],
    existsImpl: (p) => p === '/second/candidate.toml',
    readFileImpl: (p) => (p === '/second/candidate.toml' ? 'oauth_token = "fixture-token"' : ''),
  })
  assert.equal(token, 'fixture-token')
})

test('readWranglerOAuthToken 读文件抛错时试下一个候选，而不是让整个解析失败', () => {
  const token = readWranglerOAuthToken({
    candidates: ['/broken.toml', '/ok.toml'],
    existsImpl: () => true,
    readFileImpl: (p) => { if (p === '/broken.toml') throw new Error('EACCES'); return 'oauth_token = "fixture-token-2"' },
  })
  assert.equal(token, 'fixture-token-2')
})

test('readWranglerOAuthToken 全部候选都拿不到 token 时抛出清楚的错误（不带任何路径/内容）', () => {
  assert.throws(
    () => readWranglerOAuthToken({ candidates: ['/a.toml', '/b.toml'], existsImpl: () => false }),
    /wrangler login/,
  )
})

test('whoamiAccountId 调用 `npx wrangler whoami` 并解析出账号 id', () => {
  const calls = []
  const accountId = whoamiAccountId({
    execImpl: (cmd, args) => {
      calls.push([cmd, args])
      return `│ Account ID │\n│ ${FAKE_ACCOUNT_ID} │\n`
    },
  })
  assert.deepEqual(calls, [['npx', ['wrangler', 'whoami']]])
  assert.equal(accountId, FAKE_ACCOUNT_ID)
})

// 2026-09-29 第一次真实运行实测：Windows 上 execFileSync('npx', …) 不带 shell:true 会
// ENOENT（npx 在 Windows 上是 .cmd 垫片）。这里不重新断言 execFileSync 本身的行为
// （那是 Node 自己的职责），只锁住"execImpl 抛出时，错误信息里要点名 npx 这条命令"这个契约，
// 防止以后有人把这层 try/catch 改没了、又变回一个吞掉原因的通用错误。
test('whoamiAccountId 在 execImpl 抛错时把原因包进"跑不动 npx wrangler whoami"里', () => {
  assert.throws(
    () => whoamiAccountId({ execImpl: () => { throw new Error('spawnSync npx ENOENT') } }),
    /跑不动 `npx wrangler whoami`.*ENOENT/,
  )
})

test('whoamiAccountId 输出里解不出账号 id 时给出清楚的下一步（不是裸抛）', () => {
  assert.throws(
    () => whoamiAccountId({ execImpl: () => 'You are not authenticated' }),
    /NOMI_CF_ACCOUNT_ID/,
  )
})
