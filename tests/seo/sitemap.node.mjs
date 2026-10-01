import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { shared } from '../../scripts/marketing/content.mjs'
import { loadSiteData } from '../../scripts/marketing/library/data.mjs'
import { loadPageDates } from '../../scripts/marketing/page-dates.mjs'
import { computeSitemapEntries } from '../../scripts/marketing/pages.mjs'
import { renderSitemap } from '../../scripts/build-marketing-sitemap.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const runtimeFacts = Object.freeze({ ...shared, version: packageJson.version })

test('renderSitemap is a pure, deterministic, XML-safe template over given entries', () => {
  const entries = [
    { path: '/', updatedAt: '2026-01-01', changefreq: 'weekly', priority: '1.0' },
    { path: '/prompts/collections/a-b', updatedAt: '2026-01-02', changefreq: 'monthly', priority: '0.6' },
  ]
  const xml = renderSitemap('https://nomiaqm.com', entries)
  assert.equal(xml, renderSitemap('https://nomiaqm.com', entries), 'same input renders the same output')
  assert.equal((xml.match(/<url>/g) || []).length, entries.length)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/<\/loc>/)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/prompts\/collections\/a-b<\/loc>/)
  for (const entry of entries) assert.ok(xml.includes(`<lastmod>${entry.updatedAt}</lastmod>`))
  assert.doesNotMatch(xml, /&(?!(amp|lt|gt|quot|apos);)/)
})

test('computed entries cover the real site once each, with clean routes and no retired pages', () => {
  const siteData = loadSiteData()
  const { entries } = computeSitemapEntries({ siteData, runtimeFacts, previousDates: loadPageDates(), today: '2026-09-28' })
  const paths = entries.map((entry) => entry.path)
  assert.equal(new Set(paths).size, paths.length, 'every route appears exactly once')
  for (const expected of ['/', '/en/', '/quickstart', '/en/quickstart', '/features', '/en/features', '/models', '/en/models']) {
    assert.ok(paths.includes(expected), `sitemap includes ${expected}`)
  }
  assert.ok(!paths.includes('/handbook') && !paths.includes('/handbook.html'), 'the retired handbook is not in the sitemap')
  for (const entry of entries) {
    assert.doesNotMatch(entry.path, /\.html$/, `${entry.path} is a clean route`)
    assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}$/, `${entry.path} has a real lastmod date`)
  }
})

test('sitemap renderer over the real entries is deterministic and XML-safe', () => {
  const siteData = loadSiteData()
  const { entries } = computeSitemapEntries({ siteData, runtimeFacts, previousDates: loadPageDates(), today: '2026-09-28' })
  const xml = renderSitemap('https://nomiaqm.com', entries)
  assert.equal((xml.match(/<url>/g) || []).length, entries.length)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/quickstart<\/loc>/)
  assert.doesNotMatch(xml, /<loc>https:\/\/nomiaqm\.com\/(?:quickstart|handbook)\.html<\/loc>/)
  assert.match(xml, /<loc>https:\/\/nomiaqm\.com\/en\/quickstart<\/loc>/)
  assert.doesNotMatch(xml, /&(?!(amp|lt|gt|quot|apos);)/)
})
