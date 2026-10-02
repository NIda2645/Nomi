import assert from 'node:assert/strict'
import test from 'node:test'
import { findLocaleProblems, parseSitemap } from './check-site-locales.mjs'

const siteUrl = 'https://nomiaqm.com'
const head = ({ lang, canonical, alternates }) => `<html lang="${lang}"><head><link rel="canonical" href="${canonical}" />${alternates.map(([hreflang, href]) => `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`).join('')}</head><body></body></html>`
const triple = (zh, en) => [['zh-CN', `${siteUrl}${zh}`], ['en', `${siteUrl}${en}`], ['x-default', `${siteUrl}${zh}`]]
const goodPages = () => new Map([
  ['marketing/models.html', head({ lang: 'zh-CN', canonical: `${siteUrl}/models`, alternates: triple('/models', '/en/models') })],
  ['marketing/en/models.html', head({ lang: 'en', canonical: `${siteUrl}/en/models`, alternates: triple('/models', '/en/models') })],
  ['marketing/index.html', head({ lang: 'zh-CN', canonical: `${siteUrl}/`, alternates: triple('/', '/en/') })],
  ['marketing/en/index.html', head({ lang: 'en', canonical: `${siteUrl}/en/`, alternates: triple('/', '/en/') })],
])
const sitemapFor = (pages) => `<urlset>${[...pages.entries()].map(([file]) => {
  const english = file.startsWith('marketing/en/')
  const route = file.replace(/^marketing\//, '').replace(/index\.html$/, '').replace(/\.html$/, '')
  const loc = `${siteUrl}/${route}`
  const zh = `${siteUrl}/${english ? route.replace(/^en\/?/, '') : route}`
  const en = `${siteUrl}/${english ? route : `en/${route}`}`
  return `<url><loc>${loc}</loc><xhtml:link rel="alternate" hreflang="zh-CN" href="${zh}" /><xhtml:link rel="alternate" hreflang="en" href="${en}" /><xhtml:link rel="alternate" hreflang="x-default" href="${zh}" /></url>`
}).join('')}</urlset>`
const run = (pages, sitemapXml = sitemapFor(goodPages())) => findLocaleProblems({ pages, siteUrl, sitemapXml })

test('green: every page has its counterpart, the same three hreflang links on both sides, and a matching sitemap', () => {
  assert.deepEqual(run(goodPages()), [])
})

test('red: a Chinese page with no English page is reported (and the English side too)', () => {
  const pages = goodPages()
  pages.delete('marketing/en/models.html')
  const problems = run(pages)
  assert.ok(problems.some((problem) => /marketing\/models\.html: 没有对应的英文页 marketing\/en\/models\.html/.test(problem)), JSON.stringify(problems))
  const english = goodPages()
  english.delete('marketing/models.html')
  assert.ok(run(english).some((problem) => /marketing\/en\/models\.html: 没有对应的中文页 marketing\/models\.html/.test(problem)))
})

test('red: hreflang pointing at the wrong page, at only two links, or different from the other side', () => {
  const wrong = goodPages()
  wrong.set('marketing/en/models.html', head({ lang: 'en', canonical: `${siteUrl}/en/models`, alternates: triple('/models', '/en/skills') }))
  assert.ok(run(wrong).some((problem) => /hreflang en 是 https:\/\/nomiaqm\.com\/en\/skills，应该是 https:\/\/nomiaqm\.com\/en\/models/.test(problem)))

  const two = goodPages()
  two.set('marketing/models.html', head({ lang: 'zh-CN', canonical: `${siteUrl}/models`, alternates: triple('/models', '/en/models').slice(0, 2) }))
  assert.ok(run(two).some((problem) => /hreflang 应该恰好三条.*现在是 2 条/.test(problem)))

  const xDefault = goodPages()
  xDefault.set('marketing/en/models.html', head({ lang: 'en', canonical: `${siteUrl}/en/models`, alternates: [['zh-CN', `${siteUrl}/models`], ['en', `${siteUrl}/en/models`], ['x-default', `${siteUrl}/en/models`]] }))
  assert.ok(run(xDefault).some((problem) => /hreflang x-default 是 https:\/\/nomiaqm\.com\/en\/models，应该是 https:\/\/nomiaqm\.com\/models/.test(problem)))
})

test('red: wrong html lang or canonical', () => {
  const pages = goodPages()
  pages.set('marketing/en/index.html', head({ lang: 'zh-CN', canonical: `${siteUrl}/en`, alternates: triple('/', '/en/') }))
  const problems = run(pages)
  assert.ok(problems.some((problem) => /<html lang> 是 "zh-CN"，应该是 en/.test(problem)), JSON.stringify(problems))
  assert.ok(problems.some((problem) => /canonical 是 https:\/\/nomiaqm\.com\/en，应该是 https:\/\/nomiaqm\.com\/en\//.test(problem)), JSON.stringify(problems))
})

test('red: the sitemap must list exactly the pages on disk, once each, with the same hreflang', () => {
  const pages = goodPages()
  const stale = sitemapFor(pages).replace('<url><loc>https://nomiaqm.com/en/models</loc>', '<url><loc>https://nomiaqm.com/en/gone</loc>')
  const problems = run(pages, stale)
  assert.ok(problems.some((problem) => /sitemap\.xml: https:\/\/nomiaqm\.com\/en\/gone 没有对应的页面/.test(problem)), JSON.stringify(problems))
  assert.ok(problems.some((problem) => /sitemap\.xml: 缺 https:\/\/nomiaqm\.com\/en\/models/.test(problem)), JSON.stringify(problems))

  const duplicated = sitemapFor(pages).replace('</urlset>', `${sitemapFor(pages).match(/<url>[\s\S]*?<\/url>/)[0]}</urlset>`)
  assert.ok(run(pages, duplicated).some((problem) => /出现了不止一次/.test(problem)))

  const drifted = sitemapFor(pages).replace(/hreflang="en" href="https:\/\/nomiaqm\.com\/en\/models"/, 'hreflang="en" href="https://nomiaqm.com/en/elsewhere"')
  assert.ok(run(pages, drifted).some((problem) => /xhtml:link 跟页面 .* hreflang 不一致/.test(problem)))
})

test('red: an English page must not leak Chinese into its title, description or h1', () => {
  const english = (extraHead, body) => goodPages().get('marketing/en/models.html').replace('</head>', `${extraHead}</head>`).replace('<body></body>', `<body>${body}</body>`)
  const withTitle = goodPages()
  withTitle.set('marketing/en/models.html', english('<title>Sora 官方 prompt collection</title>', ''))
  assert.ok(run(withTitle).some((problem) => /英文页的标题里混进了中文「官」/.test(problem)), JSON.stringify(run(withTitle)))

  const withDescription = goodPages()
  withDescription.set('marketing/en/models.html', english('<meta name="description" content="Prompts from the GPT-4o 图像 collection" />', ''))
  assert.ok(run(withDescription).some((problem) => /英文页的描述里混进了中文/.test(problem)))

  const withHeading = goodPages()
  withHeading.set('marketing/en/models.html', english('', '<h1><span>Models</span> 模型库</h1>'))
  assert.ok(run(withHeading).some((problem) => /英文页的<h1>里混进了中文/.test(problem)))

  const chineseBody = goodPages()
  chineseBody.set('marketing/en/models.html', english('<title>Models | Nomi</title>', '<h1>Models</h1><article lang="zh-CN">技能全文原样展示</article>'))
  assert.deepEqual(run(chineseBody), [], 'Chinese skill text in the page body is allowed on English pages')
})

test('red: two English sentences glued together (no space after the full stop) are reported; verbatim blocks are not', () => {
  const english = (body) => goodPages().get('marketing/en/models.html').replace('<body></body>', `<body>${body}</body>`)
  const glued = goodPages()
  glued.set('marketing/en/models.html', english('<h2>Pro-grade AI video.Models at their real price.</h2>'))
  const problems = run(glued)
  assert.ok(problems.some((problem) => /marketing\/en\/models\.html: 英文页正文里两句话贴在一起.*video\.Models at/.test(problem)), JSON.stringify(problems))

  const verbatim = goodPages()
  verbatim.set('marketing/en/models.html', english('<pre class="prompt-text">Wide shot.Camera pushes in.</pre><p>Run <code>a.B</code> twice.</p>'))
  assert.deepEqual(run(verbatim), [], 'prompt payloads and code are shown as they are')

  const fine = goodPages()
  fine.set('marketing/en/models.html', english('<p>Works with Node.js and kie.ai. See e.g. the Sora page. Version 2.5 is out!</p>'))
  assert.deepEqual(run(fine), [], 'file names, domains, abbreviations and version numbers are not sentences glued together')

  const chinese = goodPages()
  chinese.set('marketing/models.html', goodPages().get('marketing/models.html').replace('<body></body>', '<body><p>Pro-grade AI video.Models</p></body>'))
  assert.deepEqual(run(chinese), [], 'the rule is for English pages only')
})

test('parseSitemap reads every url with its alternates', () => {
  const entries = parseSitemap(sitemapFor(goodPages()))
  assert.equal(entries.length, 4)
  assert.equal(entries[0].alternates.length, 3)
})
