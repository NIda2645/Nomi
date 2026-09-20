// Regression for the former red handoff probe; browser-only isolated host permissions.
// Run under with-gates-lock; no real project, provider or filesystem mutation.
import { expect } from '@playwright/test'
import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/composer-panel-reference-isolation-harness.html`)
  await page.locator('#drop').waitFor({ state: 'visible' })
  await page.evaluate(() => window.proveCanvasWriterProbes())
  const baseline = await page.evaluate(() => window.panelReferenceRepro)
  expect(baseline.canvasUpdates, 'positive control observes real store update entry').toBe(1)
  expect(baseline.canvasConnections, 'positive control observes real store connection entry').toBe(1)
  for (const action of ['drop', 'library', 'canvas']) await page.locator(`#${action}`).click()
  const calls = await page.evaluate(() => window.panelReferenceRepro)
  console.log(JSON.stringify(calls))
  expect(calls.canvasUpdates, 'unapproved panel references must not update canvas nodes').toBe(baseline.canvasUpdates)
  expect(calls.canvasConnections, 'unapproved panel references must not connect canvas nodes').toBe(baseline.canvasConnections)
  expect(calls.cardUpdates, 'drop and both mention sources reach only the injected card writer').toBe(3)
  expect(calls.indices, 'chips resolve against updated panel references, not canvas state').toEqual([2, 3])
  await page.evaluate(() => { window.panelReferenceRepro.readOnly = true })
  for (const action of ['drop', 'library', 'canvas']) await page.locator(`#${action}`).click()
  const blocked = await page.evaluate(() => window.panelReferenceRepro)
  expect(blocked.cardUpdates, 'read-only host blocks all reference mutations').toBe(3)
  expect(blocked.canvasUpdates + blocked.canvasConnections, 'read-only never falls through to canvas').toBe(baseline.canvasUpdates + baseline.canvasConnections)
} finally {
  await browser?.close()
  await server.close()
}
