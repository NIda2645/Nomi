// Controlled browser component behavior; not Electron/package acceptance.
import { test } from 'vitest'
import { expect } from '@playwright/test'
import { expectAbsent, proveProbe } from './_assert.mjs'
import { chromium } from 'playwright'
import { createServer } from 'vite'
test('sidebar preserves legacy plan and document deletion with confirmation', async () => {
  const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0 } })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/creation-sidebar-delete-harness.html`)
    const plan = page.locator('[data-storyboard-id]')
    await expect(plan).toHaveCount(1)
    const planProof = await proveProbe(plan, 'existing sidebar plan before deletion')
    await plan.click({ button: 'right' })
    await expect(page.locator('[data-resource-action="delete"]')).toBeVisible()
    await page.locator('[data-resource-action="delete"]').click()
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(plan).toHaveCount(1)
    await plan.click({ button: 'right' })
    await page.locator('[data-resource-action="delete"]').click()
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expectAbsent(plan, { provenBy: planProof, message: 'confirmed deletion removes the previously visible plan' })
    await expect(page.locator('[data-document-row]')).toHaveCount(2)
    await page.locator('button[data-document-id="b"]').click({ button: 'right' })
    await page.locator('[data-resource-action="delete"]').click()
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('[data-document-row]')).toHaveCount(1)
    await page.locator('button[data-document-id="a"]').click({ button: 'right' })
    await expect(page.locator('[data-resource-action="delete"]')).toBeDisabled()
  } finally { await browser?.close(); await server.close() }
})
