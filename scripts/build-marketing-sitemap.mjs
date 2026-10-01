import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shared } from './marketing/content.mjs'
import { loadSiteData } from './marketing/library/data.mjs'
import { formatPageDates, loadPageDates, PAGE_DATES_FILE } from './marketing/page-dates.mjs'
import { computeSitemapEntries } from './marketing/pages.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'marketing/sitemap.xml')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

/** 纯 XML 模板：给定一份已经算好的 entries（见 computeSitemapEntries），跟 siteData/日期无关，方便单测。 */
export function renderSitemap(siteUrl, entries) {
  const baseUrl = String(siteUrl).replace(/\/$/, '')
  const urls = entries.map((page) => `  <url>
    <loc>${escapeXml(`${baseUrl}${page.path}`)}</loc>
    <lastmod>${escapeXml(page.updatedAt)}</lastmod>
    <changefreq>${escapeXml(page.changefreq)}</changefreq>
    <priority>${escapeXml(page.priority)}</priority>
  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

function parseArg(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const checkOnly = process.argv.includes('--check')
  const today = parseArg('--now', new Date().toISOString()).slice(0, 10)
  const siteData = loadSiteData()
  const runtimeFacts = Object.freeze({ ...shared, version: packageJson.version })
  const previousDates = loadPageDates()
  const { dates, entries } = computeSitemapEntries({ siteData, runtimeFacts, previousDates, today })
  const sitemapXml = renderSitemap(shared.siteUrl, entries)
  const datesJson = formatPageDates(dates)

  if (checkOnly) {
    const stale = []
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== sitemapXml) stale.push(path.relative(root, output))
    if (!fs.existsSync(PAGE_DATES_FILE) || fs.readFileSync(PAGE_DATES_FILE, 'utf8') !== datesJson) stale.push(path.relative(root, PAGE_DATES_FILE))
    if (stale.length) {
      console.error(`Marketing sitemap is stale:\n${stale.map((item) => `- ${item}`).join('\n')}`)
      process.exitCode = 1
    } else {
      console.log('MARKETING SITEMAP CHECK PASS')
    }
  } else {
    const temporary = `${output}.${process.pid}.tmp`
    fs.writeFileSync(temporary, sitemapXml)
    fs.renameSync(temporary, output)
    fs.mkdirSync(path.dirname(PAGE_DATES_FILE), { recursive: true })
    fs.writeFileSync(PAGE_DATES_FILE, datesJson)
    console.log(`Generated ${path.relative(root, output)} (${entries.length} URLs) and ${path.relative(root, PAGE_DATES_FILE)}`)
  }
}
