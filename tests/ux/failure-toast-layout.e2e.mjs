// A generation-failure toast must be fully inside the window at every supported size, its × must be
// reachable, and one failure must be shown once (2026-09-29 full-walk pb06: the toast ran past the right edge
// at 1280×800 and 1100×720, the × sat outside the window, and the same failure stacked ×3).
//
// Real production container (NomiAppProviders → Mantine Notifications) + real toast store + real failure
// catalog + real i18n strings in real Chromium with the production CSS. Only the surrounding page is a stub.
//   node scripts/build-tailwind.mjs && node tests/ux/failure-toast-layout.e2e.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { expect, expectHittable, expectOverlayReachable, screenshotSettled, waitForVisualQuiescence } from './_assert.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const evidence = path.join(root, '.tmp', 'failure-toast-layout-evidence')
fs.mkdirSync(evidence, { recursive: true })

/** Supported window sizes: the everyday laptop size, and the smallest window the app allows (electron/main.ts). */
const mainSource = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8')
const minWindow = { width: Number(/minWidth:\s*(\d+)/.exec(mainSource)?.[1]), height: Number(/minHeight:\s*(\d+)/.exec(mainSource)?.[1]) }
assert.ok(minWindow.width > 0 && minWindow.height > 0, 'cannot read the minimum window size from electron/main.ts')
const SIZES = [{ width: 1280, height: 800 }, minWindow]

const server = await createServer({ root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 5299, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ headless: true })
const failures = []
try {
  for (const locale of ['zh-CN', 'en']) {
    for (const size of SIZES) {
      const tag = `${locale}-${size.width}x${size.height}`
      const page = await browser.newPage({ viewport: size })
      await page.addInitScript((loc) => { localStorage.setItem('nomi-color-scheme', 'light'); localStorage.setItem('nomi:locale:v1', loc) }, locale)
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto('http://127.0.0.1:5299/tests/ux/fixtures/failure-toast-layout/index.html', { timeout: 120_000 })
      await page.waitForFunction(() => Boolean(window.__toastFixture))
      const toasts = page.locator('.mantine-Notification-root')
      const closer = toasts.locator('.mantine-Notification-closeButton')
      const check = async (label, run) => {
        await page.evaluate(() => window.__toastFixture.clear())
        await expect(toasts).toHaveCount(0)
        try { await run() } catch (error) { failures.push(`[${tag}] ${label}: ${String(error?.message ?? error).split('\n')[0]}`) }
      }
      const expectInside = async (label) => {
        await waitForVisualQuiescence(page)
        await expectOverlayReachable(toasts, label)
        await expectHittable(closer, `${label} 的 ×`)
        const closerInside = await closer.first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight })
        assert.equal(closerInside, true, `${label} 的 × 伸出了窗口`)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '页面出现了横向滚动')
        // 不许被削：提示根节点 overflow:hidden，内容比它高就是被切掉了一截（上下各一截，看不出来少了什么）。
        // 再长的话必须在文字区里滚动（够得着），根节点自己永远装得下它的内容。
        const clipped = await toasts.evaluateAll((nodes) => nodes.filter((node) => node.scrollHeight > node.clientHeight + 1).map((node) => `${node.scrollHeight}>${node.clientHeight}`))
        assert.deepEqual(clipped, [], `${label} 的文字被削掉了一截（内容高 > 可见高）`)
      }
      /** 用户真会遇到的失败（模型已下线这一条）：整句话不用滚动就能读完。 */
      const expectReadableWithoutScrolling = async (label) => {
        const scrolling = await page.locator('[data-toast-message]').evaluateAll((nodes) => nodes.filter((node) => node.scrollHeight > node.clientHeight + 1).length)
        assert.equal(scrolling, 0, `${label} 需要滚动才读得完`)
      }

      await check('the failure toast is fully inside the window and its × can be pressed', async () => {
        await page.evaluate(() => window.__toastFixture.showFailure())
        await expect(toasts).toHaveCount(1)
        await expectInside('失败提示')
        await expectReadableWithoutScrolling('失败提示（模型已下线）')
        await screenshotSettled(page, { path: path.join(evidence, `${tag}-failure-toast.png`) })
        await closer.click()
        await expect(toasts).toHaveCount(0)
      })

      await check('the longest message the failure catalog can produce fits without being cut (worst case for this language)', async () => {
        const longest = await page.evaluate(() => window.__toastFixture.showLongestCatalogMessage())
        await expect(toasts).toHaveCount(1)
        await expectInside(`目录里最长的一条（${longest.kind}，${longest.length} 字）`)
        await screenshotSettled(page, { path: path.join(evidence, `${tag}-longest-catalog-message.png`) })
      })

      await check('an action label with no break opportunities cannot shove the toast out either', async () => {
        await page.evaluate(() => window.__toastFixture.showFailure({ actionLabel: 'Switch-to-a-provider-with-an-extraordinarily-long-display-name-GPT-Image-2-Ultra' }))
        await expect(toasts).toHaveCount(1)
        await expectInside('失败提示（超长动作名）')
      })

      await check('with a right panel open the toast steps aside and is still inside', async () => {
        await page.evaluate(() => { window.__toastFixture.openPanel('tasks'); window.__toastFixture.showFailure() })
        await expect(toasts).toHaveCount(1)
        await expectInside('失败提示（右侧面板打开）')
        await screenshotSettled(page, { path: path.join(evidence, `${tag}-with-right-panel.png`) })
        await page.evaluate(() => window.__toastFixture.closePanels())
      })

      await check('two different failures are both inside the window', async () => {
        await page.evaluate(() => { window.__toastFixture.showFailure({ id: 'node-recovery:one', vendor: 'vendor-one' }); window.__toastFixture.showFailure({ id: 'node-recovery:two', vendor: 'vendor-two' }) })
        await expect(toasts).toHaveCount(2)
        await waitForVisualQuiescence(page)
        for (let index = 0; index < 2; index += 1) await expectOverlayReachable(toasts.nth(index), `第 ${index + 1} 条失败提示`)
      })

      await check('the same failure announced three times is one toast, without a repeat count', async () => {
        await page.evaluate(() => { for (let index = 0; index < 3; index += 1) window.__toastFixture.showFailure({ id: 'node-recovery:same', occurrence: 'run-1@10' }) })
        await expect(toasts).toHaveCount(1)
        await waitForVisualQuiescence(page)
        assert.equal(await page.locator('[data-notification-occurrences]').count(), 0, '同一次失败叠出了「×N」')
        // A genuinely new event under the same identity replaces it and counts once more.
        await page.evaluate(() => window.__toastFixture.showFailure({ id: 'node-recovery:same', occurrence: 'run-2@20' }))
        await expect(page.locator('[data-notification-occurrences]')).toHaveText('×2')
        await expect(toasts).toHaveCount(1)
        await screenshotSettled(page, { path: path.join(evidence, `${tag}-two-events.png`) })
      })

      assert.deepEqual(pageErrors, [], `[${tag}] page errors`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`failure toast layout: ${SIZES.map((size) => `${size.width}x${size.height}`).join(' / ')} × zh-CN / en — all inside the window, × reachable, one failure = one toast`)
