// check:rule-aliases 的红证（R17：只验过绿的门岗不算门岗）。五件事各有一条阳性对照。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate, collectReferences } from './check-rule-aliases.mjs'
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

test('执行点只有 manual 却不是建议档 → 红；建议档放行', () => {
  assert.match(errs(data([rule({ enforcement: ['manual'], level: 'always' })])), /必须是 suggestion/)
  assert.equal(errs(data([rule({ enforcement: ['manual'], level: 'suggestion' })])), '')
})

test('加一删二：新增规则不带 replaces → 红；带 2 个已删旧号 → 绿', () => {
  const base = data([rule({ id: 'OLD' })])
  const noReplaces = data([rule({ id: 'OLD' }), rule({ id: 'NEW' })])
  assert.match(errs(noReplaces, { baseData: base }), /新增规则 NEW/)
  const ok = data([rule({ id: 'OLD' }), rule({ id: 'NEW', aliases: ['A', 'B'], replaces: ['A', 'B'] })])
  assert.equal(errs(ok, { baseData: base }), '')
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
