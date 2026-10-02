import assert from 'node:assert/strict'
import test from 'node:test'
import { VETTED_LICENSES, attributionBlocks, findAttributionProblems } from './check-site-attribution.mjs'

const MIT_TEXT = 'MIT License\n\nCopyright (c) 2026 jnMetaCode\n\nPermission is hereby granted'
const REPO = 'https://github.com/jnMetaCode/ai-shortfilm-prompts/blob/abc/README.md'
const APACHE_REPO = 'https://github.com/PicoTrex/Awesome-Nano-Banana-images/blob/def/README.md'
const POST_A = 'https://x.com/author_a/status/1'
const POST_B = 'https://x.com/author_b/status/2'

const item = (overrides) => ({ kind: 'effect', groupId: 'camera', license: 'MIT', licenseText: MIT_TEXT, source: { url: REPO, author: 'jnMetaCode' }, ...overrides })
const data = () => ({
  library: [
    item({ name: 'effect-camera-01' }),
    item({ name: 'curated-recipe', kind: 'skill', license: 'CC-BY-4.0', licenseText: 'Creative Commons Attribution 4.0 International', source: { url: 'https://github.com/LichAmnesia/ads/blob/x/README.md', author: 'LichAmnesia' } }),
    item({ name: 'effect-character-a', groupId: 'character', license: 'Apache-2.0', licenseText: 'Apache License Version 2.0', source: { url: APACHE_REPO, author: POST_A } }),
    item({ name: 'effect-character-b', groupId: 'character', license: 'Apache-2.0', licenseText: 'Apache License Version 2.0', source: { url: APACHE_REPO, author: POST_B } }),
    item({ name: 'director-cinematography', kind: 'skill', license: 'AGPL-3.0-only', licenseText: null, source: { url: 'https://github.com/aqm857886159/Nomi/blob/x/SKILL.md', author: 'Nomi contributors' } }),
  ],
  collections: [
    { id: 'c1', label: 'C1', sourceUrl: 'https://github.com/example/c1', license: 'CC0-1.0', prompts: [{ title: 't', prompt: 'p' }] },
    { id: 'offline-less', label: 'C2', sourceUrl: 'https://github.com/example/c2', license: 'CC-BY-4.0', prompts: [] },
  ],
})

const aside = ({ url, links = [], label = 'label', license, licenseText = null }) => `<aside class="attribution"><dl><div><dt>出处</dt><dd><a href="${url}">${label}</a></dd></div>${links.length ? `<div><dt>原作者</dt><dd>${links.map(([href, text]) => `<a href="${href}">${text}</a>`).join(' · ')}</dd></div>` : ''}<div><dt>许可证</dt><dd>${license}</dd></div></dl>${licenseText ? `<details class="license-text"><summary>全文</summary><pre>${licenseText}</pre></details>` : ''}</aside>`
const page = (...blocks) => `<html><body>${blocks.join('')}</body></html>`

const goodPages = () => {
  const pages = new Map()
  for (const prefix of ['marketing', 'marketing/en']) {
    pages.set(`${prefix}/prompts/camera.html`, page(aside({ url: REPO, label: 'jnMetaCode', license: 'MIT', licenseText: MIT_TEXT })))
    pages.set(`${prefix}/skills/curated-recipe.html`, page(aside({ url: 'https://github.com/LichAmnesia/ads/blob/x/README.md', label: 'LichAmnesia', license: 'CC-BY-4.0', licenseText: 'Creative Commons Attribution 4.0 International' })))
    pages.set(`${prefix}/prompts/character.html`, page(aside({ url: APACHE_REPO, label: 'PicoTrex/Awesome-Nano-Banana-images', links: [[POST_A, '@author_a'], [POST_B, '@author_b']], license: 'Apache-2.0', licenseText: 'Apache License Version 2.0' })))
    pages.set(`${prefix}/prompts/collections/c1.html`, page(aside({ url: 'https://github.com/example/c1', license: 'CC0-1.0' })))
  }
  return pages
}
const run = (pages = goodPages(), mutate = (value) => value) => findAttributionProblems({ data: mutate(data()), pages })
const expectProblem = (problems, pattern) => assert.ok(problems.some((problem) => pattern.test(problem)), `expected ${pattern}, got ${JSON.stringify(problems)}`)

test('green: every non-AGPL entry has a block with the upstream link, the author, the license and its full text, in both languages', () => {
  assert.deepEqual(run(), [])
})

test('the vetted list is the closed set of licenses someone read the terms of', () => {
  assert.deepEqual([...VETTED_LICENSES].sort(), ['AGPL-3.0-only', 'Apache-2.0', 'CC-BY-4.0', 'CC0-1.0', 'MIT'])
})

test('red: a license nobody vetted must not ship its full text', () => {
  expectProblem(run(goodPages(), (value) => { value.library[0].license = 'CC-BY-NC-4.0'; return value }), /effect-camera-01: 许可证 "CC-BY-NC-4\.0" 没有读过条款/)
  expectProblem(run(goodPages(), (value) => { value.collections[0].license = 'All rights reserved'; return value }), /合集 c1: 许可证 "All rights reserved" 没有读过条款/)
})

test('red: a missing page, a missing block, a block without the right link or license', () => {
  const noPage = goodPages()
  noPage.delete('marketing/en/skills/curated-recipe.html')
  expectProblem(run(noPage), /curated-recipe（en）: 页面 marketing\/en\/skills\/curated-recipe\.html 不存在/)

  const noBlock = goodPages()
  noBlock.set('marketing/prompts/camera.html', page('<p>no attribution here</p>'))
  expectProblem(run(noBlock), /effect-camera-01（zh-CN）: marketing\/prompts\/camera\.html 上没有一个出处块同时带着原仓库链接/)

  const wrongLicense = goodPages()
  wrongLicense.set('marketing/prompts/camera.html', page(aside({ url: REPO, label: 'jnMetaCode', license: 'Apache-2.0', licenseText: MIT_TEXT })))
  expectProblem(run(wrongLicense), /effect-camera-01（zh-CN）.*许可证 MIT/)
})

test('red: the full license text of a non-AGPL entry must be on the page', () => {
  const noText = goodPages()
  noText.set('marketing/prompts/camera.html', page(aside({ url: REPO, label: 'jnMetaCode', license: 'MIT' })))
  expectProblem(run(noText), /缺许可证全文/)
  const otherText = goodPages()
  otherText.set('marketing/prompts/camera.html', page(aside({ url: REPO, label: 'jnMetaCode', license: 'MIT', licenseText: 'Some other license entirely' })))
  expectProblem(run(otherText), /许可证全文跟目录里的对不上/)
})

test('red: every author is credited — a named author by name, a post author by a link to the post', () => {
  const missingNamed = goodPages()
  missingNamed.set('marketing/prompts/camera.html', page(aside({ url: REPO, label: 'someone else', license: 'MIT', licenseText: MIT_TEXT })))
  expectProblem(run(missingNamed), /没有作者 jnMetaCode/)

  const missingPost = goodPages()
  missingPost.set('marketing/prompts/character.html', page(aside({ url: APACHE_REPO, label: 'PicoTrex/Awesome-Nano-Banana-images', links: [[POST_A, '@author_a']], license: 'Apache-2.0', licenseText: 'Apache License Version 2.0' })))
  expectProblem(run(missingPost), new RegExp(`effect-character-b（zh-CN）.*没有作者 ${POST_B.replaceAll('/', '\\/').replaceAll('.', '\\.')}`))
})

test('red: two entries from one source address with different licenses cannot share one block', () => {
  const conflicting = goodPages()
  assert.deepEqual(run(conflicting), [])
  expectProblem(run(conflicting, (value) => { value.library[3].license = 'MIT'; return value }), /effect-character-b（zh-CN）.*许可证 MIT/)
})

test('red: an open-source collection page needs the upstream link and license; AGPL entries are not forced', () => {
  const noUpstream = goodPages()
  noUpstream.set('marketing/prompts/collections/c1.html', page(aside({ url: 'https://elsewhere.example', license: 'CC0-1.0' })))
  expectProblem(run(noUpstream), /合集 c1（zh-CN）.*没有出处块同时带着原仓库链接/)
  const agplOnly = goodPages()
  agplOnly.delete('marketing/skills/director-cinematography.html')
  assert.deepEqual(run(agplOnly), [], 'AGPL-3.0-only (Nomi own) skills are not checked here')
})

test('attributionBlocks reads links, license rows, text and the folded license text', () => {
  const [block] = attributionBlocks(page(aside({ url: REPO, label: 'jnMetaCode', links: [[POST_A, '@a']], license: 'MIT', licenseText: MIT_TEXT })))
  assert.deepEqual(block.links, [REPO, POST_A])
  assert.ok(block.licenses.includes('MIT'))
  assert.ok(block.hasLicenseText)
  assert.ok(block.text.includes('jnMetaCode'))
})
