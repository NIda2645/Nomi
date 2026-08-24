import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marketingPages } from './marketing/site-manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'marketing/sitemap.xml')

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

export { marketingPages }

export function renderSitemap(siteUrl) {
  const baseUrl = String(siteUrl).replace(/\/$/, '')
  const urls = marketingPages.map((page) => `  <url>
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

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const contents = renderSitemap('https://nomiaqm.com')
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== contents) {
      console.error(`Marketing sitemap is stale: ${path.relative(root, output)}`)
      process.exitCode = 1
    } else {
      console.log('MARKETING SITEMAP CHECK PASS')
    }
  } else {
    const temporary = `${output}.${process.pid}.tmp`
    fs.writeFileSync(temporary, contents)
    fs.renameSync(temporary, output)
    console.log(`Generated ${path.relative(root, output)}`)
  }
}
