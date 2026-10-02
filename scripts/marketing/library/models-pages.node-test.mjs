import assert from 'node:assert/strict'
import test from 'node:test'
import { modelMetaDescription, specRows } from './models-pages.mjs'

const model = (facts = {}) => ({
  slug: 'alpha',
  kind: 'video',
  vendors: [{ key: 'kie', name: 'Kie.ai', authType: 'bearer' }, { key: 'comfyui', name: 'ComfyUI', authType: 'none' }],
  facts: { intents: ['text', 'single'], references: { image_ref: 2 }, resolutions: ['1080P', '4k'], aspectRatios: ['16:9'], durationSeconds: { min: 4, max: 12 }, audio: true, variants: [], ...facts },
})
const row = (rows, label) => rows.find(([name]) => name === label)?.[1]

test('meta description: an explicit description wins over the headline', () => {
  const editorial = { headline: '一句话定位，五十个字以内就够了。'.repeat(1), description: '这是专门写给搜索结果的描述，比一句话定位更完整，长度正好落在五十到一百六十个字符之间，说明这个模型是什么、适合谁。' }
  assert.equal(modelMetaDescription(model(), editorial, 'zh-CN'), editorial.description)
})

test('meta description: a headline under 50 characters gets a capability sentence from the same data as the capability card', () => {
  const zh = modelMetaDescription(model(), { headline: '谷歌 Imagen 4 的快速档，专注纯文生图，速度快，适合大批量出图。' }, 'zh-CN')
  assert.match(zh, /适合大批量出图。在 Nomi 里能做：文生视频、首帧生视频。$/)
  assert.ok([...zh].length >= 50 && [...zh].length <= 160)
  const en = modelMetaDescription(model({ intents: ['text'] }), { headline: 'A fast, light video model for quick drafts.' }, 'en')
  assert.match(en, /quick drafts\. In Nomi: Text to video\.$/)
})

test('meta description: a headline in range is used as written', () => {
  const headline = 'ByteDance’s video model that generates multi-shot clips of up to 30 seconds with sound, taking up to 30 reference images.'
  assert.equal(modelMetaDescription(model(), { headline }, 'en'), headline)
})

test('red: a headline over 160 characters fails the build instead of being cut in half', () => {
  assert.throws(() => modelMetaDescription(model(), { headline: 'x'.repeat(161) }, 'en'), /不在 50–160 之内：alpha\.en（在介绍前言里写一条 description）/)
})

test('capability card: duration options come out sorted and unique, ranges stay ranges', () => {
  const sorted = row(specRows(model({ durationSeconds: { options: ['3', '5', '10', '4', '6', '8', '4'] } }), 'zh-CN'), '时长')
  assert.deepEqual(sorted, ['3 秒', '4 秒', '5 秒', '6 秒', '8 秒', '10 秒'])
  assert.deepEqual(row(specRows(model(), 'en'), 'Duration'), ['4–12 s'])
  assert.equal(row(specRows(model({ durationSeconds: null }), 'en'), 'Duration'), undefined, 'no duration row when the profile gives none')
})

test('capability card: aspect ratios are written out, pixel-size lists collapse to a count, auto and adaptive merge', () => {
  const zh = row(specRows(model({ aspectRatios: ['auto', '1:1', '16:9', 'adaptive', 'auto_1k', '512:512', '416:624', '4096:4096', '27:16'] }), 'zh-CN'), '画幅')
  assert.deepEqual(zh, ['自适应', '1:1', '16:9', '27:16', '3 种固定像素尺寸'])
  const onlySizes = row(specRows(model({ aspectRatios: ['1344:768', '768:1344'] }), 'en'), 'Aspect ratio')
  assert.deepEqual(onlySizes, ['2 fixed pixel sizes'])
  assert.equal(row(specRows(model({ aspectRatios: [] }), 'en'), 'Aspect ratio'), undefined)
})

test('capability card: only providers that connect with an API key are listed, and the rows keep their order', () => {
  const rows = specRows(model(), 'en')
  assert.deepEqual(row(rows, 'Connect via'), ['Kie.ai'])
  assert.equal(rows[0][0], 'Modes')
  assert.equal(rows.at(-1)[0], 'Connect via')
  assert.deepEqual(row(rows, 'Resolution'), ['1080p', '4K'], 'resolutions are normalised and sorted')
})
