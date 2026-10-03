// check:rule-aliases 的红证（R17：只验过绿的门岗不算门岗）。五件事各有一条阳性对照。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate, collectReferences, makeEnforcementChecker } from './check-rule-aliases.mjs'
import { renderView } from './gen-rules-view.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const rule = (over = {}) => ({
  id: 'X1',
  aliases: [],
  rule: '一句话',
  disease: '病',
  enforcement: ['gate:check:x'],
  evidence: '证据',
  owner: '谁',
  review_on: '2026-12-01',
  delete_when: '不适用',
  level: 'l2',
  ...over,
})
const data = (rules, reserved = {}) => ({ rules, reserved })
const errs = (d, extra = {}) => evaluate({ data: d, viewText: renderView(d), ...extra }).join('\n')

test('旧号写在 aliases 里就解析得到；没人定义的号 → 红；保留号不红', () => {
  const d = data([rule({ id: 'R5', aliases: ['R6'] })], { R24: '保留' })
  const refs = collectReferences(() => '看 R6 和 R5 和 R24', ['x.md'])
  assert.equal(errs(d, { references: refs }), '')
  const bad = collectReferences(() => '照 R29 办', ['x.md'])
  assert.match(errs(d, { references: bad }), /引用了 R29/)
})

test('字段缺失 → 红', () => {
  const broken = rule()
  delete broken.delete_when
  assert.match(errs(data([broken])), /缺字段 delete_when/)
  assert.match(errs(data([rule({ enforcement: [] })])), /缺字段 enforcement/)
})

test('执行点只有 manual 却不是建议档 → 红；建议档放行；用户拍板的 principle 可常驻但必须带 decided_on', () => {
  assert.match(errs(data([rule({ enforcement: ['manual'], level: 'always', kind: 'principle' })])), /必须带 decided_on/)
  assert.equal(errs(data([rule({ enforcement: ['manual'], level: 'always', kind: 'principle', decided_on: '2026-10-02' })])), '')
  assert.match(errs(data([rule({ kind: 'other' })])), /kind 只能是 principle/)
  assert.match(errs(data([rule({ enforcement: ['manual'], level: 'always' })])), /必须是 suggestion/)
  assert.equal(errs(data([rule({ enforcement: ['manual'], level: 'suggestion' })])), '')
})

test('加一删二：新增规则不带 replaces → 红；带 2 个已删旧号 → 绿', () => {
  const base = data([rule({ id: 'OLD', aliases: ['A', 'B'] })])
  const noReplaces = data([rule({ id: 'OLD' }), rule({ id: 'NEW' })])
  assert.match(errs(noReplaces, { baseData: base }), /新增规则 NEW/)
  const ok = data([rule({ id: 'NEW', aliases: ['A', 'B'], replaces: ['A', 'B'] })])
  assert.equal(errs(ok, { baseData: base }), '')
  // 评审反例：Z1 / Z2 从来没存在过，编造的旧号不能顶替「删二」
  const fake = data([rule({ id: 'OLD', aliases: ['A', 'B'] }), rule({ id: 'NEW', aliases: ['Z1', 'Z2'], replaces: ['Z1', 'Z2'] })])
  assert.match(errs(fake, { baseData: base }), /Z1、Z2 在 origin.main 上从来没存在过/)
  // 列的号真实存在过、但那条规则还在（没删）也不算
  const notDeleted = data([rule({ id: 'OLD', aliases: ['A', 'B'] }), rule({ id: 'NEW', aliases: ['OLD', 'A'], replaces: ['OLD', 'A'] })])
  assert.match(errs(notDeleted, { baseData: base }), /必须带 replaces/)
})

test('replaces 里的号仍是规则 id、或没写进 aliases → 红', () => {
  const still = data([rule({ id: 'A' }), rule({ id: 'NEW', aliases: ['B'], replaces: ['A', 'B'] })])
  assert.match(errs(still), /仍是规则 id/)
  const noAlias = data([rule({ id: 'NEW', aliases: ['B'], replaces: ['B', 'C'] })])
  assert.match(errs(noAlias), /没写进它的 aliases/)
})

test('视图和正本不一致 → 红', () => {
  const d = data([rule()])
  assert.match(evaluate({ data: d, viewText: 'stale' }).join('\n'), /不一致/)
})

test('真仓库：正本字段齐全、视图同步、引用都解析得到', () => {
  const read = (f) => (fs.existsSync(path.join(repoRoot, f)) ? fs.readFileSync(path.join(repoRoot, f), 'utf8') : null)
  const d = JSON.parse(read('docs/engineering/rules.json'))
  assert.equal(evaluate({ data: d, viewText: read('docs/engineering/rules.md') ?? '', references: collectReferences(read) }).join('\n'), '')
})

test('执行点必须真的存在：gate 要在 package.json、hook / skill / template 路径要存在', () => {
  const exists = (p) => ['scripts/claude-hooks/pre-push-check.sh', 'docs/x.md', 'scripts/validation-policy.mjs', 'agent-skills/real/SKILL.md'].includes(p)
  const checker = makeEnforcementChecker({ scripts: { 'check:real': 'x', 'test:core-smoke': 'y' }, exists })
  for (const ok of ['manual', 'gate:check:real', 'gate:check:real(只对 schema 阻断)', 'gate:test:core-smoke', 'hook:pre-push-check', 'hook:pre-push-check(说明)', 'template:docs/x.md', 'gate:scripts/validation-policy.mjs', 'skill:real']) assert.equal(checker(ok), null, ok)
  for (const bad of ['gate:check:gone', 'hook:gone', 'template:docs/none.md', 'skill:gone', 'gate:CI desktop-linux/core-smoke']) assert.notEqual(checker(bad), null, bad)
  const d = data([rule({ enforcement: ['gate:check:gone'] })])
  assert.match(errs(d, { checkExists: checker }), /执行点 gate:check:gone 不存在/)
})
