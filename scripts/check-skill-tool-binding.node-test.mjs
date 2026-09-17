// `check:skill-tool-binding` 的阳性对照（R17：加规则必须先验它会红）。
//
// 每条判据都喂一份**假技能**，断言它会红；再喂反例，断言它不红。
// 三条阳性对照逐字用的是真实事故文本（2026-09-18 那次 Agent 4/5 轮不调工具的现场），
// 不是我编的样例——判据只有对着真事故红过，才算接住了它。
import assert from 'node:assert/strict'
import test from 'node:test'
import { findEffectRestatements, declaredToolsOf } from './skill-tool-binding-lib.mjs'

// 真相视图由调用方注入，正如生产里由 `resolveCapabilityAlias()` 派生。
const effects = new Map([['draft_shots', 'reversible_write'], ['look_at_canvas', 'read'], ['generate', 'reversible_write']])
const withTools = (body) => `---\nname: x\nmetadata:\n  nomi:\n    tools:\n      - draft_shots\n---\n${body}`
const findIn = (body, tools = ['draft_shots']) => findEffectRestatements(withTools(body), tools, effects)

test('阳性 1 · 事故原句：泛指「写画布/生成类工具」，没点名任何工具也要红', () => {
  const hits = findIn('- **绝不调用写画布/生成类工具**——你只产出方案对象，落画布与生成由用户确认后系统处理。')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].kind, 'read_write')
  assert.deepEqual(hits[0].tools, [], '这一句正是「没点名工具」的形状——只认点名的话会漏掉事故本体')
})

test('阳性 2 · 点名工具 + 断言只读', () => {
  const hits = findIn('- `look_at_canvas`：只读，开工前可查画布上已有的角色卡。')
  assert.equal(hits.length, 1)
  assert.deepEqual(hits[0].tools, ['look_at_canvas'])
})

test('阳性 3 · 断言花不花钱（注册表事实，且当时已经写错了）', () => {
  const hits = findIn('用 `draft_shots` 一次产出整份分镜方案。**不碰画布、不花额度。**')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].kind, 'money')
})

test('阴性 1 · 工作流意图不该红：技能自己的阶段门是它该写的内容', () => {
  assert.deepEqual(findIn('2. 用户确认后，用 `draft_shots` 落节点；角色锚用 `arrange_canvas` 共用。'), [])
  assert.deepEqual(findIn('规划阶段不要调用 `generate`——用户说「生成」时才轮到它。'), [])
})

test('阴性 2 · 零工具技能整份跳过：writer-* 的剧作词汇不是在说工具', () => {
  const craft = '| 不可逆决定 | 角色做了不能撤回的事 | 签字、关门、开枪 |\n### 第二层：定向精读（只读标记段落）'
  assert.deepEqual(findEffectRestatements(withTools(craft), [], effects), [],
    '这条靠「声明零工具 ⇒ 不扫」在结构上排除，不靠豁免名单——名单的理由会过期')
})

test('declaredToolsOf 读的是 metadata.nomi.tools', () => {
  assert.deepEqual(declaredToolsOf(withTools('body')), ['draft_shots'])
  assert.deepEqual(declaredToolsOf('---\nname: x\n---\nbody'), [])
})
