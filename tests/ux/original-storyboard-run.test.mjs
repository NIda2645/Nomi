import { test } from 'vitest'
import { expect } from '@playwright/test'
import { proveProbe, expectAbsent } from './_assert.mjs'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

for (const locale of ['zh-CN', 'en']) for (const media of ['image', 'video']) test(`original storyboard ${locale}/${media} keeps loaded-model controls clickable at the established collapsed-sidebar editor width`, async () => {
  const en = locale === 'en'
  const cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'nomi-storyboard-width-vite-'))
  const server = await createServer({ configFile: false, cacheDir, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/original-storyboard-run-harness.html?locale=${locale}&media=${media}`)
    await page.addStyleTag({ url: '/tailwind.generated.css' })
    await page.addStyleTag({ url: '/src/styles/index.css' })
    const editor = page.locator('[data-storyboard-editor]')
    await expect(editor).toBeVisible()
    const expand = editor.getByRole('button', { name: en ? 'Expand all' : '全部展开', exact: true })
    if (await expand.isVisible()) await expand.click()
    await editor.getByRole('button', { name: en ? 'Add Reference' : '添加参考', exact: true }).click()
    await expect(editor.locator('[data-storyboard-anchor-row]')).toHaveCount(1)
    // A-1 restores this editor budget by collapsing the existing resource sidebar.
    // Full-shell preference/toggle behavior is covered by the Electron journey.
    await editor.evaluate(element => { element.parentElement.style.width = '840px' })
    const row = editor.locator('[data-storyboard-row="1"]')
    const modelLabel = media === 'image' ? (en ? 'Image model' : '图片模型') : (en ? 'Video model' : '视频模型')
    await expect(row.getByRole('button', { name: modelLabel, exact: true })).toContainText(media === 'image' ? 'Fixture 图片' : 'Fixture 视频')
    await expect(row.getByRole('button', { name: en ? 'Mode' : '模式', exact: true })).toBeVisible()
    const button = row.locator('[data-storyboard-generate-state]')
    await expect(button).toBeVisible()
    const read = () => page.evaluate(() => {
      const scroll = document.querySelector('[data-storyboard-scroll]')
      const row = document.querySelector('[data-storyboard-row="1"]')
      const prompt = row.querySelector('[data-storyboard-prompt-block]')
      const controls = [...row.querySelectorAll('[data-storyboard-composer-bar] button')].map(element => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return { label: element.getAttribute('aria-label') || element.textContent, generate: element.hasAttribute('data-storyboard-generate-state'), x: rect.x, width: rect.width, hit: Boolean(hit && element.contains(hit)) }
      })
      const anchor = document.querySelector('[data-storyboard-anchor-row]')
      const anchorControls = [...anchor.querySelectorAll('input,textarea,button')].map(element => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return { label: element.getAttribute('aria-label') || element.textContent, width: rect.width, hit: Boolean(hit && element.contains(hit)) }
      })
      return { anchor: { clientWidth: anchor.clientWidth, scrollWidth: anchor.scrollWidth, controls: anchorControls }, scroll: { clientWidth: scroll.clientWidth, scrollWidth: scroll.scrollWidth, left: scroll.scrollLeft, overflowX: getComputedStyle(scroll).overflowX },
        row: { clientWidth: row.clientWidth, scrollWidth: row.scrollWidth, columns: getComputedStyle(row).gridTemplateColumns },
        prompt: { clientWidth: prompt.clientWidth, scrollWidth: prompt.scrollWidth }, controls }
    })
    // ResizeObserver demotes optional parameters asynchronously. Wait for its
    // measured bar and demotion signature to settle before collecting geometry.
    await row.evaluate(async element => {
      const bar = element.querySelector('[data-storyboard-composer-bar]')
      let last = ''; let stable = 0
      for (let frame = 0; frame < 120 && stable < 4; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        const next = `${bar.clientWidth}:${bar.getAttribute('data-storyboard-composer-demoted')}:${bar.scrollWidth}`
        stable = next === last ? stable + 1 : 0
        last = next
      }
      if (stable < 4) throw new Error('Original composer layout did not stabilize')
    })
    const after = await read()
    fs.writeFileSync(path.join(tmpdir(), `nomi-storyboard-collapsed-width-${locale}-${media}.json`), JSON.stringify(after, null, 2))
    for (const control of after.controls) expect(control.hit, `Composer control ${control.label} must be reachable without scrolling`).toBe(true)
    expect(after.controls.find(control => control.generate)?.hit, 'Original generate control remains reachable at the established editor width').toBe(true)
    expect(after.scroll.left).toBe(0)
    const interactiveControls = row.locator('[data-storyboard-composer-bar] button')
    for (let index = 0; index < await interactiveControls.count(); index++) {
      const control = interactiveControls.nth(index)
      if (await control.isEnabled()) await control.click({ trial: true })
    }
    expect(after.prompt.clientWidth, 'Prompt column must retain editable width').toBeGreaterThan(120)
    expect(after.anchor.controls.find(control => control.label === (en ? 'Reference card description' : '参考卡描述'))?.hit, 'Expanded reference description remains reachable at the established editor width').toBe(true)
    expect(after.anchor.controls.find(control => control.label === (en ? 'Delete reference card' : '删除参考卡'))?.hit, 'Expanded reference action must remain reachable').toBe(true)
  } finally { await browser?.close(); await server.close(); fs.rmSync(cacheDir, { recursive: true, force: true }) }
})
test('Run reuses the original full editor and keeps conflicted input across plan switches', async () => {
  const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/original-storyboard-run-harness.html`)
    const editor = page.locator('[data-storyboard-editor]')
    await expect(editor).toBeVisible()
    await expect(editor.locator('[data-storyboard-prompt-block]')).toHaveCount(1)
    await expect(editor.locator('[data-storyboard-play-all]')).toBeVisible()
    const title = editor.locator('header input')
    await title.fill('Saved A')
    await expect.poll(() => page.evaluate(() => window.originalStoryboard.snapshot().a.authoring.title)).toBe('Saved A')
    await page.getByRole('button', { name: 'Plan B', exact: true }).click()
    await expect(title).toHaveValue('Plan b')
    await page.getByRole('button', { name: 'Plan A', exact: true }).click()
    await expect(title).toHaveValue('Saved A')
    await editor.getByRole('button', { name: '添加镜头', exact: true }).click()
    await expect(editor.locator('[data-storyboard-prompt-block]')).toHaveCount(2)
    await expect.poll(() => page.evaluate(() => window.originalStoryboard.snapshot().a.generationPlan.editorial.shots.length)).toBe(2)
    expect(await page.evaluate(() => new Set(window.originalStoryboard.snapshot().a.generationPlan.editorial.shots.map(shot => shot.shotId)).size)).toBe(2)
    await page.evaluate(() => window.originalStoryboard.conflict())
    await title.fill('Keep my local draft')
    const alertProof = await proveProbe(editor.getByRole('alert'), 'Save conflict is rendered')
    await page.getByRole('button', { name: 'Plan B', exact: true }).click()
    await page.getByRole('button', { name: 'Plan A', exact: true }).click()
    await expect(title).toHaveValue('Keep my local draft')
    await expect.poll(() => page.evaluate(() => window.originalStoryboard.snapshot().a.authoring.title)).toBe('Saved A')
    await page.evaluate(() => window.originalStoryboard.recover())
    await editor.getByRole('button', { name: '覆盖远端', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.originalStoryboard.snapshot().a.authoring.title)).toBe('Keep my local draft')
    await expectAbsent(editor.getByRole('alert'), { provenBy: alertProof })
    expect(await page.evaluate(() => window.originalStoryboard.legacy().doc ?? [])).toEqual([])
    expect(await page.evaluate(() => window.originalStoryboard.calls.every(call => call.type === 'generation.save_storyboard'))).toBe(true)
  } finally { await browser?.close(); await server.close() }
})
