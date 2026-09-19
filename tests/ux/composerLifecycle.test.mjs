import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { createServer } from 'vite'
let server, browser, page
beforeAll(async () => {
  server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/composer-lifecycle-harness.html`)
})
afterAll(async () => { await browser?.close(); await server?.close() })
it('invalidates the single history owner across selection, results, kind and identity', async () => {
  await page.locator('[role="status"]').waitFor()
  await page.evaluate(() => window.composerFixture.fail())
  await page.locator('#history').click()
  expect(await page.locator('#history').textContent()).toBe('history')
  for (const toggle of ['select', 'available']) {
    await page.locator(`#${toggle}`).click(); await page.locator(`#${toggle}`).click()
    expect(await page.locator('#history').textContent()).toBe('composer')
    await page.locator('#history').click()
  }
  for (const toggle of ['kind', 'identity']) {
    await page.locator(`#${toggle}`).click()
    expect(await page.locator('#history').textContent()).toBe('composer')
    await page.locator('#history').click()
  }
})
it('recovers a failed import locally without reloading or replacing unpublished input', async () => {
  await page.locator('[role="alert"]').waitFor()
  await page.locator('input').fill('still unpublished')
  await page.evaluate(() => { window.savedInput = document.querySelector('input'); window.composerFixture.load() })
  await page.locator('[role="alert"] button').click()
  await page.locator('[data-loaded]').waitFor()
  expect(await page.evaluate(() => window.composerFixture.snapshot())).toEqual({ calls: 4, reloads: 0 })
  expect(await page.evaluate(() => window.savedInput === document.querySelector('input'))).toBe(true)
  expect(await page.locator('input').inputValue()).toBe('still unpublished')
})

async function startPan() {
  await page.locator('#stage .react-flow__pane').dispatchEvent('pointerdown', { pointerId: 4, pointerType: 'mouse', isPrimary: true, button: 1, buttons: 4, clientX: 20, clientY: 20 })
  await page.locator('#stage').dispatchEvent('pointermove', { pointerId: 4, pointerType: 'mouse', buttons: 4, clientX: 50, clientY: 40 })
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBe('true')
}
it.each(['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'readonly', 'unmount'])('releases pan state without remembering a successful move on %s', async (reason) => {
  await page.reload()
  await startPan()
  if (reason === 'hidden') await page.locator('#stage').evaluate(element => { element.hidden = true })
  else if (reason === 'readonly' || reason === 'unmount') await page.locator(`#${reason}`).click()
  else await page.locator('#stage').dispatchEvent(reason, { pointerId: 4 })
  if (reason !== 'unmount') {
    await page.waitForFunction(() => !document.querySelector('#stage')?.hasAttribute('data-dragging'))
    expect(await page.locator('#stage').getAttribute('data-panning')).toBeNull()
  }
  expect(await page.evaluate(() => window.composerFixture.gesture().remembers)).toBe(0)
})
it('ignores a different pointer cancellation, and normal pointerup persists exactly once', async () => {
  await page.reload(); await startPan()
  await page.locator('#stage').dispatchEvent('pointercancel', { pointerId: 99 })
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBe('true')
  await page.locator('#stage').dispatchEvent('pointerup', { pointerId: 4 })
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBeNull()
  expect(await page.evaluate(() => window.composerFixture.gesture().remembers)).toBe(1)
})

it('remeasures a zero-sized stage after reopening and clamps at both zoom extremes', async () => {
  await page.locator('#geometry-stage').evaluate(element => { element.style.display = 'none' })
  await page.waitForFunction(() => document.querySelector('#geometry-card').style.maxHeight === '0px')
  await page.locator('#geometry-stage').evaluate(element => { element.style.display = 'block' })
  for (const zoom of [0.4, 2]) {
    await page.evaluate(value => window.composerFixture.zoom(value), zoom)
    await page.waitForFunction(() => {
      const stage = document.querySelector('#geometry-stage').getBoundingClientRect()
      const card = document.querySelector('#geometry-card').getBoundingClientRect()
      return card.height > 0 && card.left >= stage.left && card.top >= stage.top && card.right <= stage.right && card.bottom <= stage.bottom
    })
  }
})

it('wheel takeover is cancelled on blur without persisting a viewport', async () => {
  await page.reload()
  await page.locator('#stage .react-flow__pane').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: 20, clientY: 20 })
  await page.locator('#stage').dispatchEvent('wheel', { clientX: 30, clientY: 30, deltaY: 10 })
  await page.locator('#stage').dispatchEvent('pointermove', { pointerId: 7, buttons: 1, clientX: 60, clientY: 60 })
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBe('true')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBeNull()
  expect(await page.evaluate(() => window.composerFixture.gesture().remembers)).toBe(0)
})
it('cancelling one stage keeps another active stage owned', async () => {
  await page.reload(); await startPan()
  await page.evaluate(() => { window.releaseOther = window.composerFixture.holdOther() })
  await page.locator('#stage').dispatchEvent('pointercancel', { pointerId: 4 })
  expect(await page.locator('#other-stage').getAttribute('data-dragging')).toBe('true')
  await page.evaluate(() => window.releaseOther())
})
