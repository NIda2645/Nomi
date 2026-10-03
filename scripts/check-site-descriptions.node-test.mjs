import assert from 'node:assert/strict'
import test from 'node:test'
import { findDescriptionProblems } from './check-site-descriptions.mjs'
import { DESCRIPTION_LENGTH, clipDescription, descriptionLength, fitDescription } from './marketing/seo-limits.mjs'

const page = ({ title = 'A unique title', description, og = description, twitter = description } = {}) => `<html><head>${title === null ? '' : `<title>${title}</title>`}${description === null ? '' : `<meta name="description" content="${description}" />`}<meta property="og:description" content="${og}" /><meta name="twitter:description" content="${twitter}" /></head></html>`
const english = (length) => 'x'.repeat(length)
const run = (entries) => findDescriptionProblems({ pages: new Map(Object.entries(entries)) })

test('green: 50 and 160 characters are both fine, and Chinese counts characters, not bytes', () => {
  assert.deepEqual(run({ 'marketing/a.html': page({ description: english(50) }), 'marketing/b.html': page({ title: 'B', description: english(160) }), 'marketing/c.html': page({ title: 'C', description: '字'.repeat(50) }) }), [])
})

test('red: 49 and 161 characters are out of range, a missing description is reported', () => {
  const problems = run({
    'marketing/short.html': page({ title: 'S', description: english(49) }),
    'marketing/long.html': page({ title: 'L', description: english(161) }),
    'marketing/none.html': page({ title: 'N', description: null }),
    'marketing/han.html': page({ title: 'H', description: '字'.repeat(49) }),
  })
  assert.ok(problems.some((problem) => /short\.html: 描述 49 字符，要在 50–160 之间/.test(problem)), JSON.stringify(problems))
  assert.ok(problems.some((problem) => /long\.html: 描述 161 字符/.test(problem)))
  assert.ok(problems.some((problem) => /none\.html: 没有 meta description/.test(problem)))
  assert.ok(problems.some((problem) => /han\.html: 描述 49 字符/.test(problem)), 'Chinese is counted by characters')
})

test('red: the share-card descriptions must equal the meta description, and a title must exist', () => {
  const problems = run({
    'marketing/og.html': page({ title: 'O', description: english(60), og: english(61) }),
    'marketing/tw.html': page({ title: 'T', description: english(60), twitter: 'other' }),
    'marketing/no-title.html': page({ title: null, description: english(70) }),
  })
  assert.ok(problems.some((problem) => /og\.html: og:description 跟 meta description 不一致/.test(problem)), JSON.stringify(problems))
  assert.ok(problems.some((problem) => /tw\.html: twitter:description 跟 meta description 不一致/.test(problem)))
  assert.ok(problems.some((problem) => /no-title\.html: 没有 <title>/.test(problem)))
})

test('red: two pages of one language may not share a title or a description; two languages may', () => {
  const same = english(80)
  const problems = run({
    'marketing/a.html': page({ title: 'Same', description: same }),
    'marketing/b.html': page({ title: 'Same', description: same }),
    'marketing/en/a.html': page({ title: 'Same', description: same }),
  })
  assert.equal(problems.filter((problem) => /marketing\/b\.html: 标题跟 marketing\/a\.html 一字不差/.test(problem)).length, 1, JSON.stringify(problems))
  assert.equal(problems.filter((problem) => /marketing\/b\.html: 描述跟 marketing\/a\.html 一字不差/.test(problem)).length, 1)
  assert.ok(!problems.some((problem) => problem.startsWith('marketing/en/a.html')), 'the English page is compared with English pages only')
})

test('fitDescription: short text gets the suffix, long text is clipped at a pause with an ellipsis, impossible text throws', () => {
  const suffix = '后面接一句真话，凑够五十个字符的下限，说明这是哪一组、在哪里能用，不再多说废话。'
  const grown = fitDescription('用点火、暖光与烟雾营造安静氛围。', { locale: 'zh-CN', suffix })
  assert.ok(grown.startsWith('用点火、暖光与烟雾营造安静氛围。后面接一句真话'))
  assert.ok(descriptionLength(grown) >= DESCRIPTION_LENGTH.min)

  const long = `${'前半句，'.repeat(30)}最后一段没有任何停顿所以会被一起截掉${'字'.repeat(40)}`
  const clipped = clipDescription(long, 'zh-CN')
  assert.ok(clipped.endsWith('…') && descriptionLength(clipped) <= DESCRIPTION_LENGTH.max && descriptionLength(clipped) >= DESCRIPTION_LENGTH.min, `${clipped} (${descriptionLength(clipped)})`)
  assert.ok(!clipped.endsWith('，…'), 'the pause mark itself is dropped before the ellipsis')

  const noPause = clipDescription('a'.repeat(300), 'en')
  assert.equal(descriptionLength(noPause), DESCRIPTION_LENGTH.max - 1 + 1)
  assert.equal(clipDescription(english(120), 'en'), english(120), 'text already in range is untouched')

  assert.throws(() => fitDescription('太短', { locale: 'zh-CN', suffix: '也不够' }), /不在 50–160 之内/)
})
