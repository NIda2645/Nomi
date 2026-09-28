import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync } from 'node:fs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const marketingRoot = path.join(repoRoot, 'marketing')
const shotsDir = path.join(repoRoot, 'tests/ux/_marketing')
mkdirSync(shotsDir, { recursive: true })

function assert(condition, label) {
  if (!condition) throw new Error(`MARKETING QUICKSTART FAIL: ${label}`)
  console.log(`  ✓ ${label}`)
}

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
])

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(marketingRoot, safePath === '/' ? 'index.html' : safePath)
  if (!filePath.startsWith(marketingRoot) || !existsSync(filePath)) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  res.writeHead(200, { 'content-type': contentTypes.get(path.extname(filePath)) || 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
// 2026-09-27 起快速上手由官网生成器出中英两页（docs/plan/2026-09-27-promo-0.22-site-readme.md）。
const pages = [
  { name: 'zh', url: `http://127.0.0.1:${port}/quickstart.html`, title: 'Nomi 快速上手', h1: '从下载， 到第一个镜头。' },
  { name: 'en', url: `http://127.0.0.1:${port}/en/quickstart.html`, title: 'Nomi quick start', h1: 'From download to your first shot.' },
]

async function auditViewport(browser, target, name, viewport) {
  const page = await browser.newPage({ viewport })
  await page.goto(target.url)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(shotsDir, `quickstart-${target.name}-${name}.png`), fullPage: true })

  const result = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((el) => el.textContent.trim()).filter(Boolean)
    const links = Array.from(document.querySelectorAll('a[href]')).map((el) => el.getAttribute('href'))
    const images = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src'),
      alt: img.getAttribute('alt') || '',
      width: img.naturalWidth,
      height: img.naturalHeight,
    }))
    const blankImages = images.filter((img) => img.width < 10 || img.height < 10)
    const missingAlt = images.filter((img) => img.alt.trim().length === 0 && !/nomi-logo/.test(img.src || ''))
    return { title: document.title, overflow, headings, links, images, blankImages, missingAlt }
  })

  const label = `${target.name}/${name}`
  assert(result.title.includes(target.title), `${label}: title 正确`)
  assert(result.overflow <= 1, `${label}: 无横向溢出`)
  assert(result.headings.includes(target.h1), `${label}: hero H1 可见`)
  assert(result.headings.length >= 5, `${label}: 四步 + 常见问题都有标题`)
  assert(result.links.includes('https://github.com/aqm857886159/Nomi/releases/latest/download/Nomi-mac-arm64.dmg'), `${label}: Mac arm64 下载链接在位`)
  assert(result.links.includes('https://github.com/aqm857886159/Nomi/releases/latest/download/Nomi-windows-setup.exe'), `${label}: Windows 下载链接在位`)
  assert(result.images.length >= 4, `${label}: 三张步骤截图 + 标识都在`)
  assert(result.blankImages.length === 0, `${label}: 图片非空渲染`)
  assert(result.missingAlt.length === 0, `${label}: 图片 alt 完整`)
  await page.close()
}

const browser = await chromium.launch()
try {
  for (const target of pages) {
    await auditViewport(browser, target, 'desktop', { width: 1440, height: 1200 })
    await auditViewport(browser, target, 'mobile', { width: 390, height: 844 })
  }
  console.log('\nMARKETING QUICKSTART PASS')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
