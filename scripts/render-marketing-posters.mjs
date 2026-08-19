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
    // 标题按 spec 里写的断行来排，写长了就自动收字号——否则每加一条文案都要手调，就不叫批量了
    const fitted = await page.evaluate(() => {
      const claim = document.querySelector('.claim')
      const limit = claim.clientWidth
      let size = Number.parseFloat(getComputedStyle(claim).fontSize)
      const widest = () => Math.max(...[...claim.children].map((line) => line.scrollWidth))
      while (widest() > limit && size > 40) {
        size -= 2
        claim.style.fontSize = `${size}px`
      }
      return size
    })
    if (fitted !== FORMATS[spec.format].headline) console.log(`  ↳ ${spec.id} 标题收到 ${fitted}px（原 ${FORMATS[spec.format].headline}px）`)
    const target = path.join(outputDir, `${spec.id}.png`)
    await page.screenshot({ path: target })
    await page.close()
    console.log(`Rendered ${path.relative(root, target)} (${width}x${height} @2x)`)
  }
} finally {
  await browser.close()
}
