import assert from 'node:assert/strict'
import test from 'node:test'
import { findLinkProblems } from './check-site-links.mjs'

const files = new Set([
  'marketing/index.html',
  'marketing/en/index.html',
  'marketing/models.html',
  'marketing/models/alpha.html',
  'marketing/skills.html',
  'marketing/assets/nomi-logo.svg',
  'marketing/assets/library/card-640.webp',
])
const page = (body) => `<html><head><link rel="icon" href="/assets/nomi-logo.svg" /></head><body>${body}</body></html>`
const run = (pages) => findLinkProblems({ pages: new Map(Object.entries(pages)), fileExists: (relativePath) => files.has(relativePath) })

test('green: clean routes, the two home pages, assets and a real anchor on another page all resolve', () => {
  const problems = run({
    'marketing/index.html': page('<a href="/models">m</a><a href="/models/alpha">a</a><a href="/en/">en</a><a href="/">home</a><a href="/skills#recipes">s</a><img src="/assets/library/card-640.webp" alt="" /><a href="#local">in page</a><a href="https://example.com/x">ext</a>'),
    'marketing/skills.html': page('<h2 id="recipes">r</h2>'),
    'marketing/models.html': page(''),
    'marketing/models/alpha.html': page(''),
    'marketing/en/index.html': page(''),
  })
  assert.deepEqual(problems, [])
})

test('red: a link to a page that does not exist is reported with the files it looked for', () => {
  const problems = run({ 'marketing/index.html': page('<a href="/models/gone">x</a>') })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /marketing\/index\.html: <a href="\/models\/gone"> 指向的页面或文件不存在/)
  assert.match(problems[0], /marketing\/models\/gone\.html/)
})

test('red: a missing image, poster or script file is a dead reference too', () => {
  const problems = run({ 'marketing/index.html': page('<img src="/assets/library/missing-640.webp" alt="" /><video poster="/assets/nope.jpg" src="/assets/video/none.mp4#t=1,2"></video>') })
  assert.equal(problems.length, 3)
})

test('red: a directory is not a page ( /prompts must resolve to prompts.html, not the prompts folder )', () => {
  const problems = run({ 'marketing/index.html': page('<a href="/prompts">x</a>') })
  assert.equal(problems.length, 1)
})

test('red: internal links must use the clean route', () => {
  const problems = run({ 'marketing/index.html': page('<a href="/models.html">x</a><a href="/models/">y</a>'), 'marketing/models.html': page('') })
  assert.ok(problems.some((problem) => /不带 \.html/.test(problem)), JSON.stringify(problems))
  assert.ok(problems.some((problem) => /不带结尾斜杠/.test(problem)), JSON.stringify(problems))
})

test('red: an anchor into another page needs a matching id there', () => {
  const problems = run({
    'marketing/index.html': page('<a href="/skills#character-and-scene">x</a>'),
    'marketing/skills.html': page('<h2 id="directing">d</h2>'),
  })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /锚点 #character-and-scene 在 marketing\/skills\.html 里找不到对应 id/)
})

test('external links, protocol-relative links and in-page anchors are ignored', () => {
  assert.deepEqual(run({ 'marketing/index.html': page('<a href="https://x.dev/y">e</a><a href="//cdn.example/x.js">p</a><a href="#top">t</a><a href="mailto:a@b.c">m</a>') }), [])
})
