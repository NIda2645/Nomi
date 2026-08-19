import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { renderPosterCard, FORMATS } from './marketing/poster-card.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shotlistPath = path.join(root, 'docs/marketing/poster-shotlist.json')
const outputDir = path.join(root, 'marketing/assets/posters')

const { posters } = JSON.parse(fs.readFileSync(shotlistPath, 'utf8'))
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
const selected = only.length ? posters.filter((poster) => only.includes(poster.id)) : posters

if (!selected.length) {
  console.error(`No poster matched: ${only.join(', ')}`)
  process.exit(1)
}

fs.mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const spec of selected) {
    const { width, height } = FORMATS[spec.format]
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
    await page.setContent(renderPosterCard(spec), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const target = path.join(outputDir, `${spec.id}.png`)
    await page.screenshot({ path: target })
    await page.close()
    console.log(`Rendered ${path.relative(root, target)} (${width}x${height} @2x)`)
  }
} finally {
  await browser.close()
}
