import assert from 'node:assert/strict'
import test from 'node:test'
import { findEditorialProblems } from './check-site-editorial.mjs'
import { SECTION_HEADINGS } from './marketing/library/editorial.mjs'

const today = new Date('2026-10-01T12:00:00Z')
const vendor = { key: 'kie', name: 'Kie.ai', authType: 'bearer' }
const model = (slug, extra = {}) => ({ slug, canonicalId: `${slug} id`, label: slug, kind: 'video', lifecycle: 'flagship', recognized: true, vendors: [vendor], ...extra })
const data = {
  models: [
    model('alpha'),
    model('retired', { lifecycle: 'legacy' }),
    model('bridge-only', { vendors: [{ key: 'comfyui', name: 'ComfyUI', authType: 'none' }] }),
  ],
}

function intro(locale, { front = {}, headings = SECTION_HEADINGS[locale], body = null, drop = [] } = {}) {
  const fields = {
    model: 'alpha id',
    maker: 'Alpha Labs',
    checkedAt: '2026-09-28',
    headline: 'A one-line positioning that is long enough to stand on its own as a lede.',
    ...front,
  }
  for (const key of drop) delete fields[key]
  const { sources: givenSources, ...scalars } = fields
  const sources = givenSources ?? [{ title: 'Alpha announcement', url: 'https://alpha.example/blog/launch' }]
  const lines = ['---', ...Object.entries(scalars).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)]
  if (!drop.includes('sources')) {
    lines.push(sources.length ? 'sources:' : 'sources: []')
    for (const source of sources) lines.push(`  - title: ${JSON.stringify(source.title ?? '')}`, `    url: ${JSON.stringify(source.url ?? '')}`)
  }
  lines.push('---', '', body ?? headings.map((heading) => `## ${heading}\n\n- a point`).join('\n\n'))
  return lines.join('\n')
}

const goodFiles = () => new Map([['alpha.zh-CN.md', intro('zh-CN')], ['alpha.en.md', intro('en')]])
const problemsOf = (files, extra = {}) => findEditorialProblems({ files, data, today, ...extra })
const only = (files, pattern) => {
  const matches = problemsOf(files).filter((problem) => pattern.test(problem))
  assert.ok(matches.length >= 1, `expected a problem matching ${pattern}, got ${JSON.stringify(problemsOf(files))}`)
  return matches
}

test('a well-formed zh + en pair for an eligible model passes', () => {
  assert.deepEqual(problemsOf(goodFiles()), [])
})

test('red: the front matter model must equal the catalog canonical id', () => {
  const files = goodFiles()
  files.set('alpha.en.md', intro('en', { front: { model: 'alpha' } }))
  only(files, /前言 model 写的是「alpha」，目录里这个模型的身份是「alpha id」/)
})

test('red: an intro whose model left the catalog is an orphan', () => {
  const files = goodFiles()
  files.set('ghost.zh-CN.md', intro('zh-CN'))
  files.set('ghost.en.md', intro('en'))
  only(files, /ghost\.zh-CN\.md: 孤儿介绍.*已经没有 ghost/)
})

test('red: an intro for a model that no longer gets a page is an orphan too', () => {
  for (const slug of ['retired', 'bridge-only']) {
    const files = goodFiles()
    files.set(`${slug}.zh-CN.md`, intro('zh-CN'))
    files.set(`${slug}.en.md`, intro('en'))
    only(files, new RegExp(`${slug}\\.en\\.md: 孤儿介绍.*不再上官网`))
  }
})

test('red: zh and en intros come in pairs', () => {
  only(new Map([['alpha.zh-CN.md', intro('zh-CN')]]), /alpha: 缺 en 版/)
})

test('red: bad file names, missing front matter and broken YAML are reported, not thrown', () => {
  only(new Map([['Alpha Notes.md', 'x']]), /文件名必须是/)
  only(new Map([['alpha.en.md', '# no front matter']]), /没有 --- 包起来的前言/)
  only(new Map([['alpha.en.md', '---\nmodel: [unclosed\n---\n\n## x']]), /前言 YAML 解析失败/)
})

test('red: required fields, unknown fields and non-empty text', () => {
  const files = goodFiles()
  files.set('alpha.en.md', intro('en', { drop: ['maker', 'headline'] }))
  only(files, /缺字段 maker/)
  only(files, /缺字段 headline/)
  files.set('alpha.en.md', intro('en', { front: { chekedAt: '2026-09-28' } }))
  only(files, /多余或拼错的字段 chekedAt/)
})

test('red: every source needs a title and an http(s) link, from a maker site, once', () => {
  const withSources = (sources) => new Map([...goodFiles(), ['alpha.en.md', intro('en', { front: { sources } })]])
  only(withSources([]), /sources 至少要有一条官方出处/)
  only(withSources([{ title: '', url: 'https://alpha.example/a' }]), /sources\[0\] 缺标题/)
  only(withSources([{ title: 'T', url: 'ftp://alpha.example/a' }]), /不是 http\(s\) 链接/)
  only(withSources([{ title: 'T', url: 'not a url' }]), /不是 http\(s\) 链接/)
  only(withSources([{ title: 'T', url: 'https://medium.com/@someone/post' }]), /medium\.com 不是厂商或供应商自己的站点/)
  only(withSources([{ title: 'T', url: 'https://www.zhihu.com/question/1' }]), /www\.zhihu\.com 不是厂商或供应商自己的站点/)
  only(withSources([{ title: 'A', url: 'https://alpha.example/a' }, { title: 'B', url: 'https://alpha.example/a' }]), /url 重复/)
})

test('red: the check date must be a real date and not in the future; released may be month-only but not later than the check', () => {
  const withFront = (front) => new Map([...goodFiles(), ['alpha.en.md', intro('en', { front })]])
  only(withFront({ checkedAt: '2026-13-40' }), /checkedAt 必须是真实的 YYYY-MM-DD/)
  only(withFront({ checkedAt: '2027-01-01' }), /checkedAt 2027-01-01 写在了未来/)
  only(withFront({ released: '2026-10-05' }), /released 2026-10-05 晚于核对日期/)
  only(withFront({ released: 'last spring' }), /released 必须是官方给出的/)
  assert.deepEqual(problemsOf(withFront({ released: '2026-02' })), [], 'a month-only release date is allowed')
  assert.deepEqual(problemsOf(withFront({ released: '2026-02-18' })), [])
})

test('red: the body must be exactly the four agreed sections, in order, with no level-1 heading', () => {
  const swapped = [...SECTION_HEADINGS.en].reverse()
  const files = goodFiles()
  files.set('alpha.en.md', intro('en', { headings: swapped }))
  only(files, /正文必须正好是四节/)
  files.set('alpha.en.md', intro('en', { headings: [...SECTION_HEADINGS.en, 'Bonus section'] }))
  only(files, /正文必须正好是四节/)
  files.set('alpha.zh-CN.md', intro('zh-CN', { headings: SECTION_HEADINGS.en }))
  only(files, /alpha\.zh-CN\.md: 正文必须正好是四节/)
  files.set('alpha.en.md', intro('en', { body: `# A title\n\n${SECTION_HEADINGS.en.map((heading) => `## ${heading}\n\n- x`).join('\n\n')}` }))
  only(files, /正文里有一级标题/)
})

test('a "## " line inside a code block is not a section', () => {
  const fenced = `${SECTION_HEADINGS.en.map((heading, index) => `## ${heading}\n\n${index === 2 ? '```text\n## not a heading\n```\n' : '- x'}`).join('\n\n')}`
  const files = goodFiles()
  files.set('alpha.en.md', intro('en', { body: fenced }))
  assert.deepEqual(problemsOf(files), [])
})

test('pages and intros must match both ways when page paths are given', () => {
  const pagePaths = ['marketing/models/alpha.html', 'marketing/en/models/alpha.html', 'marketing/models.html']
  assert.deepEqual(problemsOf(goodFiles(), { pagePaths }), [])

  const withStrayPage = [...pagePaths, 'marketing/models/ghost.html', 'marketing/en/models/ghost.html']
  const stray = problemsOf(goodFiles(), { pagePaths: withStrayPage })
  assert.ok(stray.some((problem) => /marketing\/models\/ghost\.html: 页面还在，但没有对应的 zh-CN 介绍/.test(problem)), JSON.stringify(stray))
  assert.ok(stray.some((problem) => /marketing\/en\/models\/ghost\.html: 页面还在，但没有对应的 en 介绍/.test(problem)), JSON.stringify(stray))

  const missingPage = problemsOf(goodFiles(), { pagePaths: ['marketing/models/alpha.html'] })
  assert.ok(missingPage.some((problem) => /alpha: 介绍写好了，但官网没有 en 的页面/.test(problem)), JSON.stringify(missingPage))
})
