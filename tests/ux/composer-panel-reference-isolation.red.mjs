// Intentionally red handoff probe, excluded from automatic *.test suites.
// Run under with-gates-lock; no real project, provider or filesystem mutation.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/composer-panel-reference-isolation-harness.html`)
  for (const action of ['drop', 'library', 'canvas']) await page.locator(`#${action}`).click()
  const calls = await page.evaluate(() => window.panelReferenceRepro)
  console.log(JSON.stringify(calls))
  assert.equal(calls.canvasUpdates, 0, 'unapproved panel references must not update canvas nodes')
  assert.equal(calls.canvasConnections, 0, 'unapproved panel references must not connect canvas nodes')
  assert.ok(calls.cardUpdates > 0, 'reference changes must reach the injected card writer')
} finally {
  await browser?.close()
  await server.close()
}
