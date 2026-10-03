import assert from 'node:assert/strict'
import test from 'node:test'
import { findSchemaProblems } from './check-site-schema.mjs'

const siteUrl = 'https://nomiaqm.com'
const canonical = `${siteUrl}/models`
const files = new Set(['marketing/index.html', 'marketing/models.html', 'marketing/assets/social-preview-zh.jpg'])
const fileExists = (relativePath) => files.has(relativePath)

const goodGraph = () => ({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: 'Nomi', url: `${siteUrl}/`, inLanguage: ['zh-CN', 'en'] },
    {
      '@type': 'CollectionPage',
      '@id': canonical,
      url: canonical,
      name: 'Models',
      inLanguage: 'zh-CN',
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#application` },
      primaryImageOfPage: { '@type': 'ImageObject', contentUrl: `${siteUrl}/assets/social-preview-zh.jpg` },
      breadcrumb: { '@id': `${canonical}#breadcrumbs` },
    },
    { '@type': 'SoftwareApplication', '@id': `${siteUrl}/#application`, name: 'Nomi', url: `${siteUrl}/` },
    {
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumbs`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: '模型库', item: canonical },
      ],
    },
    { '@type': 'ItemList', '@id': `${canonical}#models`, numberOfItems: 1, itemListElement: [{ '@type': 'ListItem', position: 1, name: 'A', url: `${siteUrl}/models` }] },
  ],
})

const pageHtml = (graph, { lang = 'zh-CN', raw = null } = {}) => `<html lang="${lang}"><head><link rel="canonical" href="${canonical}" /><script type="application/ld+json">${raw ?? JSON.stringify(graph)}</script></head><body></body></html>`
const run = (html) => findSchemaProblems({ pages: new Map([['marketing/models.html', html]]), siteUrl, fileExists })
const mutate = (change) => {
  const graph = goodGraph()
  change(graph['@graph'], graph)
  return pageHtml(graph)
}
const expectProblem = (html, pattern) => {
  const problems = run(html)
  assert.ok(problems.some((problem) => pattern.test(problem)), `expected ${pattern}, got ${JSON.stringify(problems)}`)
}

test('green: a complete, consistent page graph has no problems', () => {
  assert.deepEqual(run(pageHtml(goodGraph())), [])
})

test('red: missing, unparseable or malformed JSON-LD', () => {
  expectProblem('<html lang="zh-CN"><head><link rel="canonical" href="https://nomiaqm.com/models" /></head></html>', /没有结构化数据/)
  expectProblem(pageHtml(null, { raw: '{"@context":"https://schema.org","@graph":[{"@type":"WebSite",}]}' }), /JSON-LD 解析失败/)
  expectProblem(mutate((_, graph) => { graph['@context'] = 'http://example.org' }), /@context 不是 https:\/\/schema\.org/)
  expectProblem(mutate((_, graph) => { graph['@graph'] = [] }), /没有 @graph 或是空的/)
})

test('red: required nodes and their links', () => {
  expectProblem(mutate((nodes) => nodes.splice(0, 1)), /缺 WebSite 节点/)
  expectProblem(mutate((nodes) => nodes.splice(2, 1)), /缺 SoftwareApplication 节点/)
  expectProblem(mutate((nodes) => { nodes[1]['@id'] = `${siteUrl}/other` }), /页面节点的 @id\/url/)
  expectProblem(mutate((nodes) => { nodes[1].inLanguage = 'en' }), /inLanguage en 跟 <html lang> zh-CN 不一致/)
  expectProblem(mutate((nodes) => { delete nodes[1].isPartOf }), /没有 isPartOf 到 WebSite/)
  expectProblem(mutate((nodes) => { nodes[1].breadcrumb = { '@id': `${canonical}#missing` } }), /引用的面包屑 .* 不在 @graph 里/)
  expectProblem(mutate((nodes) => nodes.push({ '@type': 'WebPage', '@id': `${canonical}#second`, url: canonical })), /应该恰好一个，现在是 2 个/)
  expectProblem(mutate((nodes) => { delete nodes[0]['@type'] }), /没有 @type/)
  expectProblem(mutate((nodes) => nodes.push({ '@type': 'Thing', '@id': `${siteUrl}/#website` })), /@id 重复/)
})

test('red: breadcrumbs and item lists must be internally consistent', () => {
  expectProblem(mutate((nodes) => { nodes[3].itemListElement[1].position = 3 }), /position 是 3，应该连续从 1 数/)
  expectProblem(mutate((nodes) => { nodes[3].itemListElement[1].item = `${siteUrl}/skills` }), /面包屑最后一项.*应该就是本页/)
  expectProblem(mutate((nodes) => { nodes[3].itemListElement[0].name = '' }), /面包屑第 1 项没有 name/)
  expectProblem(mutate((nodes) => { nodes[4].numberOfItems = 7 }), /numberOfItems 7 跟实际条数 1 不一致/)
})

test('red: a site url that points at a page or file that does not exist', () => {
  expectProblem(mutate((nodes) => { nodes[4].itemListElement[0].url = `${siteUrl}/models/gone` }), /url https:\/\/nomiaqm\.com\/models\/gone 指向的页面或文件不存在/)
  expectProblem(mutate((nodes) => { nodes[1].primaryImageOfPage.contentUrl = `${siteUrl}/assets/missing.jpg` }), /contentUrl .*missing\.jpg 指向的页面或文件不存在/)
})

test('external urls and in-page ids are not resolved against our files', () => {
  assert.deepEqual(run(mutate((nodes) => { nodes[2].downloadUrl = 'https://github.com/example/releases'; nodes[4]['@id'] = `${canonical}#other` })), [])
})
