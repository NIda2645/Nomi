// `check:skill-tool-binding` 的阳性对照（R17：加规则必须先验它会红）。
//
// 每条判据都喂一份**假技能**，断言它会红；再喂反例，断言它不红。
// 三条阳性对照逐字用的是真实事故文本（2026-09-18 那次 Agent 4/5 轮不调工具的现场），
// 不是我编的样例——判据只有对着真事故红过，才算接住了它。
import assert from 'node:assert/strict'
import test from 'node:test'
import { findFalseFieldValues, findEffectRestatements, declaredToolsOf } from './skill-tool-binding-lib.mjs'

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

// ── 第五类：字段该填什么值（2026-09-18 真机 5 次失败全是这一条）──────────────
//
// 阳性对照逐字用真实事故文本：技能写「`durationSec` 一律填 `0`」，而动词是 `z.number().positive()`。
// 模型照技能填、被 ajv 当场拒。判据只问「值过不过得了那个字段的 schema」，不问「有没有复述」。
const fieldSchemas = new Map([['draft_shots', new Map([
  ['durationSec', { safeParse: (value) => ({ success: typeof value === 'number' && value > 0 }) }],
  ['parameters', { safeParse: (value) => ({ success: value !== null && typeof value === 'object' }) }],
  ['taskKind', { safeParse: (value) => ({ success: ['text_to_image', 'text_to_video'].includes(value) }) }],
])],
  // 注册表里的另一个工具。它必须在这份视图里，`list_models` 才会被当成引用而不是值——
  // 这一条是**注册表驱动**的证据：判据不认死名字，只认调用方给的那份真相视图。
  ['list_models', new Map()],
])
const falseValuesIn = (body) => findFalseFieldValues(withTools(body), ['draft_shots'], fieldSchemas)

test('阳性对照：事故原句——技能规定的值过不了那个字段的 schema', () => {
  const found = falseValuesIn('  - `durationSec` 一律填 `0`；')
  assert.equal(found.length, 1)
  assert.equal(found[0].field, 'durationSec')
  assert.equal(found[0].value, 0)
})

test('值过得了就一声不吭——举合法例子不该被误伤', () => {
  assert.deepEqual(falseValuesIn('视频镜给 `durationSec`，比如 `5`。'), [])
  assert.deepEqual(falseValuesIn('`taskKind` 填 `text_to_image`。'), [])
})

test('裸标识符若是工具名/字段名就当引用，不当规定的值（第一版在这里假红过）', () => {
  // 注意 `list_models` 是从上面那份注册表视图里认出来的，不是写死在判据里的名字。
  // 真实文本：`list_models` 是工具名，被归给了前面最近的 `parameters`，object schema 收不下字符串。
  assert.deepEqual(
    falseValuesIn('- **`modelKey` / `modeId` / `parameters`**：用户已指定时才填（从 `list_models` 取准确值）。'),
    [],
    '「从 X 取值」不是「填 X」',
  )
})

test('字面值归它前面最近的那个字段——不是同一行就算同一个字段', () => {
  // 少了归属规则，`text_to_image` 会被拿去喂 durationSec 的 schema（不是数字 → 假红）。
  assert.deepEqual(falseValuesIn('`taskKind` 填 `text_to_image`，`durationSec` 省掉。'), [])
})

test('没声明工具的技能整份跳过——与上面同一条结构判据，不靠豁免名单', () => {
  assert.deepEqual(findFalseFieldValues('`durationSec` 一律填 `0`', [], fieldSchemas), [])
})
