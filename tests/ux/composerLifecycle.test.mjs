import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { expectAbsent, proveProbe } from './_assert.mjs'
let server, browser, page, cacheDir
beforeAll(async () => {
  cacheDir = mkdtempSync(path.join(tmpdir(), 'nomi-t7-vite-lifecycle-'))
  server = await createServer({ configFile: false, cacheDir, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
  await server.listen()
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/composer-lifecycle-harness.html`)
})
afterAll(async () => { await browser?.close(); await server?.close(); if (cacheDir) rmSync(cacheDir, { recursive: true, force: true }) })
it('keeps a captured gesture when focus moves between elements, but releases on window blur', async () => {
  await page.reload()
  await page.locator('#unpublished-draft').focus()
  await startPan()
  await page.locator('#readonly').focus()
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBe('true')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBeNull()
  expect(await page.evaluate(() => window.composerFixture.gesture().remembers)).toBe(0)
})
it('opens history when the original trigger selects an unselected node in the same event', async () => {
  await page.reload()
  await page.locator('#select').click()
  await page.locator('#history').click()
  expect(await page.locator('#history').textContent()).toBe('history')
  await page.locator('#select').click()
  expect(await page.locator('#history').textContent()).toBe('composer')
})
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
  await page.locator('#unpublished-draft').fill('still unpublished')
  await page.evaluate(() => { window.savedInput = document.querySelector('input'); window.composerFixture.load() })
  await page.locator('[role="alert"] button').click()
  await page.locator('[data-loaded]').waitFor()
  expect(await page.evaluate(() => window.composerFixture.snapshot())).toEqual({ calls: 4, reloads: 0 })
  expect(await page.evaluate(() => window.savedInput === document.querySelector('input'))).toBe(true)
  expect(await page.locator('#unpublished-draft').inputValue()).toBe('still unpublished')
})

async function openEscapePopover() {
  await page.locator('[data-escape-anchor]').click()
  await expect.poll(() => page.locator('[data-escape-popover]').count()).toBe(1)
}

async function expectPopoverClosedWithSelectedNode() {
  await expect.poll(() => page.locator('[data-escape-popover]').count()).toBe(0)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('true')
  expect(await page.locator('[data-escape-composer]').count()).toBe(1)
  expect(await page.locator('[data-host-escapes]').textContent()).toBe('0')
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-escape-anchor'))).toBe(true)
}

it.each([
  ['the external anchor', '[data-escape-anchor]'],
  ['a portal button', '[data-escape-button]'],
  ['a portal input', '[data-escape-input]'],
])('closes an anchored popover from %s without forwarding Escape to React Flow', async (_label, selector) => {
  await page.reload()
  await openEscapePopover()
  await page.locator(selector).focus()
  await page.keyboard.press('Escape')
  await expectPopoverClosedWithSelectedNode()
})

it('keeps child-prevented and composing Escape inside the open popover', async () => {
  await page.reload()
  await openEscapePopover()
  await page.locator('[data-escape-prevent]').focus()
  await page.keyboard.press('Escape')
  expect(await page.locator('[data-escape-popover]').count()).toBe(1)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('true')
  expect(await page.locator('[data-host-escapes]').textContent()).toBe('0')
  await page.locator('[data-escape-input]').evaluate((input) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, isComposing: true })
    input.dispatchEvent(event)
  })
  expect(await page.locator('[data-escape-popover]').count()).toBe(1)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('true')
  expect(await page.locator('[data-host-escapes]').textContent()).toBe('0')
})

it('lets nested NomiSelect consume the first Escape and closes the parent on the second', async () => {
  await page.reload()
  await openEscapePopover()
  await page.getByRole('button', { name: 'nested select' }).click()
  await expect.poll(() => page.locator('[data-nomi-select-dropdown]:visible').count()).toBe(1)
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('[data-nomi-select-dropdown]:visible').count()).toBe(0)
  expect(await page.locator('[data-escape-popover]').count()).toBe(1)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('true')
  await page.keyboard.press('Escape')
  await expectPopoverClosedWithSelectedNode()
})

it('lets a nested document-bubble owner consume Escape without reaching React Flow', async () => {
  await page.reload()
  await openEscapePopover()
  await page.locator('[data-open-document-menu]').click()
  await page.locator('[data-escape-button]').focus()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('[data-document-child="menu"]').count()).toBe(0)
  expect(await page.locator('[data-escape-popover]').count()).toBe(1)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('true')
})

it('yields focus-outside Escape to a higher dialog before closing the parent', async () => {
  await page.reload()
  await openEscapePopover()
  await page.locator('[data-open-higher-dialog]').click()
  await page.locator('[data-escape-outside]').focus()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('[data-document-child="dialog"]').count()).toBe(0)
  expect(await page.locator('[data-escape-popover]').count()).toBe(1)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('true')
})

it('preserves React Flow Escape deselection when no anchored popover owns the key', async () => {
  await page.reload()
  const flowNode = page.locator('.react-flow__node[data-id="escape-node"]')
  await flowNode.focus()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('[data-escape-composer]').count()).toBe(0)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('false')
})

it('retains focus-outside fallback and releases the anchor after closing', async () => {
  await page.reload()
  await openEscapePopover()
  await page.locator('[data-escape-outside]').focus()
  await page.keyboard.press('Escape')
  await expectPopoverClosedWithSelectedNode()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('[data-escape-composer]').count()).toBe(0)
  expect(await page.locator('[data-escape-node]').getAttribute('data-selected')).toBe('false')
})

async function startPan() {
  await page.locator('#stage .react-flow__pane').dispatchEvent('pointerdown', { pointerId: 4, pointerType: 'mouse', isPrimary: true, button: 1, buttons: 4, clientX: 20, clientY: 20 })
  await page.locator('#stage').dispatchEvent('pointermove', { pointerId: 4, pointerType: 'mouse', buttons: 4, clientX: 50, clientY: 40 })
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBe('true')
}
it.each(['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'readonly', 'unmount'])('releases pan state without remembering a successful move on %s', async (reason) => {
  await page.reload()
  await startPan()
  const activeGesture = page.locator('#stage[data-dragging]')
  const activeProof = await proveProbe(activeGesture, 'pan enters the active dragging state before interruption')
  if (reason === 'hidden') await page.locator('#stage').evaluate(element => { element.hidden = true })
  else if (reason === 'readonly' || reason === 'unmount') await page.locator(`#${reason}`).click()
  else await page.locator('#stage').dispatchEvent(reason, { pointerId: 4 })
  if (reason !== 'unmount') {
    await page.waitForFunction(() => !document.querySelector('#stage')?.hasAttribute('data-dragging'))
    expect(await page.locator('#stage').getAttribute('data-panning')).toBeNull()
  }
  await expectAbsent(activeGesture, { provenBy: activeProof, message: `${reason} releases the active gesture and it stays released` })
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
  const activeGesture = page.locator('#stage[data-dragging]')
  const activeProof = await proveProbe(activeGesture, 'wheel takeover enters the active dragging state before blur')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  expect(await page.locator('#stage').getAttribute('data-dragging')).toBeNull()
  await expectAbsent(activeGesture, { provenBy: activeProof, message: 'blur releases wheel takeover and it stays released' })
  expect(await page.evaluate(() => window.composerFixture.gesture().remembers)).toBe(0)
})
it('cancelling one stage keeps another active stage owned', async () => {
  await page.reload(); await startPan()
  await page.evaluate(() => { window.releaseOther = window.composerFixture.holdOther() })
  await page.locator('#stage').dispatchEvent('pointercancel', { pointerId: 4 })
  expect(await page.locator('#other-stage').getAttribute('data-dragging')).toBe('true')
  await page.evaluate(() => window.releaseOther())
})

it('history A to B to A restores composer without replacing a typed draft', async () => {
  await page.reload()
  await page.locator('#unpublished-draft').fill('unpublished across A B A')
  await page.locator('#history').click()
  expect(await page.locator('#history').textContent()).toBe('history')
  await page.locator('#identity').click()
  expect(await page.locator('#history').textContent()).toBe('composer')
  await page.locator('#identity').click()
  expect(await page.locator('#history').textContent()).toBe('composer')
  expect(await page.locator('#unpublished-draft').inputValue()).toBe('unpublished across A B A')
})
it('geometry owner keeps controls inside each viewport edge after real resize observation', async () => {
  await page.reload()
  for (const [left, top] of [[-80, 10], [850, 10], [10, 740], [850, 740]]) {
    await page.locator('#geometry-stage .generation-canvas-v2-node').evaluate((node, point) => { node.style.left=point[0]+'px'; node.style.top=point[1]+'px' }, [left, top])
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await page.waitForFunction(() => { const stage=document.querySelector('#geometry-stage').getBoundingClientRect(); const card=document.querySelector('#geometry-card').getBoundingClientRect(); return card.width>0 && card.height>0 && card.left>=stage.left && card.top>=stage.top && card.right<=stage.right+1 && card.bottom<=stage.bottom+1 })
  }
})


it('keeps parameter actions clickable when intersecting workspace bottom docks mount and resize', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.setViewportSize({ width: 1280, height: 1200 })
  await page.locator('#geometry-stage').waitFor({ timeout: 5000 })
  await page.locator('#geometry-stage .generation-canvas-v2-node').evaluate(node => {
    Object.assign(node.style, { top: '10px', height: '760px' })
  })
  await page.evaluate(() => {
    const stage = document.querySelector('#geometry-stage')
    const workspace = stage.parentElement
    workspace.style.position = 'relative'
    const dock = document.createElement('button')
    dock.id = 'geometry-dock'
    dock.setAttribute('data-canvas-bottom-dock', 'true')
    dock.textContent = 'existing workspace dock'
    Object.assign(dock.style, { position: 'absolute', left: '0px', bottom: '12px', width: '600px', height: '48px', zIndex: '8' })
    workspace.append(dock)
  })
  for (const height of [48, 112]) {
    await page.locator('#geometry-dock').evaluate((dock, next) => { dock.style.height = next + 'px' }, height)
    await page.waitForFunction(() => {
      const card = document.querySelector('#geometry-card').getBoundingClientRect()
      const dock = document.querySelector('#geometry-dock').getBoundingClientRect()
      const button = document.querySelector('#geometry-action')
      const action = button.getBoundingClientRect()
      return card.bottom <= dock.top && document.elementFromPoint(action.left + action.width / 2, action.top + action.height / 2) === button
    }, undefined, { timeout: 2500 })
    await page.locator('#geometry-action').click()
  }
  expect(await page.locator('#geometry-action').getAttribute('data-clicks')).toBe('2')
  await page.locator('#geometry-dock').evaluate(dock => { dock.style.left = '800px'; dock.style.width = '100px' })
  await page.waitForFunction(() => {
    const card = document.querySelector('#geometry-card').getBoundingClientRect()
    const stage = document.querySelector('#geometry-stage').getBoundingClientRect()
    return Math.abs(card.bottom - (stage.bottom - 12)) < 1
  })
  await page.locator('#geometry-action').click()
  expect(await page.locator('#geometry-action').getAttribute('data-clicks')).toBe('3')
})


it('keeps a slider keyboard edit projected through the original React Flow ownership boundary', async () => {
  await page.reload()
  const slider = page.getByRole('slider', { name: 'projection duration' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.locator('[data-projection-duration]').textContent()).toBe('6')
  expect(await page.evaluate(() => window.projectionSnapshot())).toEqual({ ownsNodes: true, position: { x: 40, y: 40 } })
  await expect.poll(() => slider.getAttribute('aria-valuenow')).toBe('6')
})

it('keeps original node keyboard movement from disabling subsequent projection updates', async () => {
  await page.reload()
  await page.locator('.react-flow__node[data-id="projection-node"]').focus()
  await page.keyboard.press('ArrowRight')
  const snapshot = await page.evaluate(() => window.projectionSnapshot())
  expect(snapshot.position.x).toBeGreaterThan(40)
  expect(snapshot.ownsNodes).toBe(true)
  const slider = page.getByRole('slider', { name: 'projection duration' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.locator('[data-projection-duration]').textContent()).toBe('6')
  await expect.poll(() => slider.getAttribute('aria-valuenow')).toBe('6')
})


it('opens an unselected history through the real delayed React Flow selection projection', async () => {
  await page.reload()
  const a = page.locator('[data-projected-history="history-a"]')
  const b = page.locator('[data-projected-history="history-b"]')
  expect(await a.locator('[data-projected-tray]').count()).toBe(0)
  await a.locator('[data-history-trigger]').click()
  await expect.poll(() => a.getAttribute('data-selected')).toBe('true')
  await expect.poll(() => a.locator('[data-projected-tray]').count()).toBe(1)
  await b.locator('[data-history-trigger]').click()
  await expect.poll(() => b.locator('[data-projected-tray]').count()).toBe(1)
  await expect.poll(() => a.locator('[data-projected-tray]').count()).toBe(0)
  await a.locator('[data-history-trigger]').click()
  await expect.poll(() => a.locator('[data-projected-tray]').count()).toBe(1)
  await a.locator('[data-history-trigger]').click()
  await expect.poll(() => a.locator('[data-projected-tray]').count()).toBe(0)
  await page.locator('[data-history-availability]').click()
  await a.locator('[data-history-trigger]').click()
  expect(await a.locator('[data-projected-tray]').count()).toBe(0)
  await page.locator('[data-history-availability]').click()
  expect(await a.locator('[data-projected-tray]').count()).toBe(0)
})
