import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { proveProbe, expectAbsent } from './_assert.mjs'
// Host integration, not live-provider/Electron acceptance. Only environment ports are replaced.
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { createServer } from 'vite'
let server, browser, page, cacheDir
const ports = {
  projectCanvasReadSurface: `export const withProjectAction = fn => fn({ binding: { projectId: 'project' }, assertCurrent() {} }); export const isProjectExecutionContextCurrent = () => true; export const isProjectImportCancellation = () => false;`,
  bridge: `export const getDesktopBridge = () => ({ productionRuns: { pendingSpend() {} } });`,
  productionRunApi: `export const productionRunApi = { reviseSpend: async input => { window.spendOwnership.calls.push(input); if (window.spendOwnership.revise) return window.spendOwnership.revise(input); return {ok: !window.spendOwnership.failRevision} }, discardSpend: async (...args) => {window.spendOwnership.calls.push({discard: args}); return {ok:!window.spendOwnership.failDiscard}}, confirmSpend: async (...args) => { window.spendOwnership.calls.push({confirm: args}); return {ok:!window.spendOwnership.failConfirm} }, pendingSpend: async () => ({ surface: 'ready', rows: [structuredClone(window.spendOwnership.pending)] }) };`,
  modelCatalogCache: `export const preloadModelOptions = async () => []; export const MODEL_REFRESH_EVENT = 'fixture-refresh';`,
  generationCanvasStore: `export const useGenerationCanvasStore = Object.assign(selector => selector({ nodes: window.spendOwnership.nodes, updateNode() { throw new Error('canvas write forbidden') } }), { getState: () => ({ nodes: window.spendOwnership.nodes }) });`,
  assetUploadApi: `export const importWorkbenchLocalAssetFile = (...args) => window.spendOwnership.upload(...args);`,
}
beforeAll(async () => {
  cacheDir = mkdtempSync(path.join(tmpdir(), 'nomi-t7-vite-panel-'))
  server = await createServer({ configFile: false, cacheDir, plugins: [{ name: 'controlled-panel-environment', enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !/\/(useAgentPanelSpendConfirm|useNodeAssetDrop|nodeWriteAccess)\.ts$/.test(importer)) return
      const name = source.split('/').at(-1)
      if (name in ports) return '\0panel-environment:' + name
    },
    load(id) { if (id.startsWith('\0panel-environment:')) return ports[id.split(':')[1]] },
  }], server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
  await server.listen()
  browser = await chromium.launch({ headless: true })
})
beforeEach(async () => {
  await page?.close()
  page = await browser.newPage()
  page.on('pageerror', error => console.error(error.message))
  await page.addInitScript(() => {
    const original = window.setInterval.bind(window)
    window.setInterval = (callback, delay, ...args) => delay === 1500
      ? (window.spendOwnership.setRefresh(callback), 1) : original(callback, delay, ...args)
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/ux/fixtures/spend-panel-write-ownership-harness.html`)
  await page.locator('#upload').waitFor({ state: 'visible' })
})
afterAll(async () => { await browser?.close(); await server?.close(); if (cacheDir) rmSync(cacheDir, { recursive: true, force: true }) })
async function upload() {
  await page.locator('#upload').click()
  await page.waitForFunction(() => window.spendOwnership.snapshot().uploads === 1)
}
async function settle() {
  await page.evaluate(() => window.spendOwnership.finish())
  await page.waitForFunction(() => window.spendOwnership.snapshot().completed === 1)
}
it('positive control: actual panel writer retains an upload when its captured owner remains current', async () => {
  await upload(); await settle()
  await page.waitForFunction(() => window.spendOwnership.snapshot().refs?.length === 1)
  expect((await page.evaluate(() => window.spendOwnership.snapshot())).refs).toEqual(['nomi-local://asset/reference.png'])
})
it.each(['page', 'scope', 'quote', 'operation', 'revision'])('retires the upload writer after changing %s, including same-node changes', async change => {
  await upload()
  await page.evaluate(value => window.spendOwnership.change(value), change)
  await page.waitForFunction(value => {
    const s = window.spendOwnership.snapshot()
    return value === 'page' ? s.page === 1 : value === 'scope' ? s.scope === 'all' : value === 'quote' ? s.quote === 'quote-next' : value === 'operation' ? s.operation === 'operation-next' : s.candidateRevision === 2
  }, change)
  await settle()
  const result = await page.evaluate(() => window.spendOwnership.snapshot())
  expect(result.refs).toEqual([])
  expect(result.staleNode).toBeUndefined()
  expect(result.staleWritable).toBe(false)
})
it('switching A to B and back never revives the original writer', async () => {
  await upload()
  await page.evaluate(() => window.spendOwnership.change('page'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 1)
  await page.evaluate(() => window.spendOwnership.back())
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 0)
  await settle()
  expect((await page.evaluate(() => window.spendOwnership.snapshot())).refs).toEqual([])
})
it('unmount revokes both read and write authority before the upload completes', async () => {
  await upload()
  await page.evaluate(() => window.spendOwnership.unmount())
  await settle()
  await page.evaluate(() => window.spendOwnership.staleWrite())
  const result = await page.evaluate(() => window.spendOwnership.snapshot())
  expect(result.staleNode).toBeUndefined()
  expect(result.staleWritable).toBe(false)
  expect(result.feedback).toEqual([])
})

it('unplaced candidate keeps the existing composer writer usable without touching canvas', async () => {
  await page.evaluate(() => window.spendOwnership.detach())
  await page.waitForFunction(() => window.spendOwnership.pending.shots.every(s => !s.nodeId))
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited', undefined, { timeout: 1500 })
  expect(await page.evaluate(() => window.spendOwnership.nodes)).toEqual([])
})
it('one visible shot retains its exact shot address on revise', async () => {
  await page.evaluate(() => window.spendOwnership.narrow())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'b')
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.confirm())
  await page.waitForFunction(() => window.spendOwnership.calls.length > 0)
  expect(await page.evaluate(() => window.spendOwnership.calls[0])).toMatchObject({shotId: 'b', patch: {prompt: 'edited'}})
})

it('closing retains isolated edits and only dismisses without revising the canonical candidate', async () => {
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.discard())
  await page.waitForFunction(() => window.spendOwnership.calls.some(call => call.discard))
  const calls = await page.evaluate(() => window.spendOwnership.calls)
  expect(calls).toHaveLength(1)
  expect(calls.at(-1)).toHaveProperty('discard')
})
it('failed dismissal keeps the local edit without revising the candidate', async () => {
  await page.evaluate(() => {window.spendOwnership.failDiscard = true;window.spendOwnership.edit()})
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.discard())
  await page.waitForFunction(() => window.spendOwnership.calls.length > 0)
  expect(await page.evaluate(() => window.spendOwnership.calls.some(call => call.patch))).toBe(false)
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('edited')
})

it('retains only the exact request draft through renderer remount and never carries it to a newer quote', async () => {
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.reload()
  await page.waitForFunction(() => window.spendOwnership?.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.change('quote'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().quote === 'quote-next')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('a')
  expect(await page.evaluate(() => window.spendOwnership.calls)).toEqual([])
})

it('actual shared panel composer accepts pointer and keyboard input into only the unapproved draft', async () => {
  await page.goto(page.url() + '?composer=1')
  const input = page.locator('[data-composer-host="panel"] [contenteditable="true"]')
  await input.waitFor({state:'visible'})
  const before = await page.evaluate(() => structuredClone({nodes:window.spendOwnership.nodes,shots:window.spendOwnership.pending.shots}))
  expect(await input.evaluate(element => { const r=element.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return r.width>0 && r.height>0 && getComputedStyle(element).visibility==='visible' && element.contains(hit) })).toBe(true)
  await input.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('Actual panel keyboard draft')
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt==='Actual panel keyboard draft')
  expect(await page.evaluate(() => ({nodes:window.spendOwnership.nodes,shots:window.spendOwnership.pending.shots}))).toEqual(before)
  expect(await page.evaluate(() => window.spendOwnership.calls)).toEqual([])
})

it('actual shared composer keeps a visible read-only reason and rejects text edits', async () => {
  const fixtureUrl = page.url()
  await page.goto(fixtureUrl + '?composer=1')
  const editable = page.locator('[data-composer-host="panel"] [contenteditable="true"]')
  const editableProof = await proveProbe(editable, 'same shared composer accepts text before readOnly transition')
  await page.goto(fixtureUrl + '?composer=1&readonly=1')
  const composer = page.locator('[data-composer-host="panel"]')
  await composer.waitFor({state:'visible'})
  await page.waitForFunction(() => document.querySelector('[data-composer-host="panel"] [contenteditable="false"]'))
  expect(await composer.locator('[role="status"]').textContent()).toMatch(/只读|read.only/i)
  await expectAbsent(editable, { provenBy: editableProof, message: 'readOnly host removes editable authority while retaining visible controls and reason' })
  expect(await page.evaluate(() => window.spendOwnership.calls)).toEqual([])
})


// 2026-09-21 用户拍板：× = 撤销这次草稿，单一语义。撤了就是撤了——**不留找回账本**
// （那套 localStorage 账本连同它的键一起删了）。下一次请求是一笔全新的，读不到上一笔的改动。
it('a discarded request leaves nothing behind for the next quote to recover', async () => {
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.discard())
  await page.waitForFunction(() => window.spendOwnership.calls.some(call => call.discard))
  await page.evaluate(() => window.spendOwnership.change('quote'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().quote === 'quote-next')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('a')
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('nomi:dismissed-spend-draft:')))).toEqual([])
  expect(await page.evaluate(() => window.spendOwnership.calls.some(call => call.patch))).toBe(false)
})


it('confirming A keeps unsubmitted B edits across paging and a cold renderer reload', async () => {
  await page.evaluate(() => window.spendOwnership.change('page'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 1)
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.back())
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 0)
  await page.evaluate(() => window.spendOwnership.confirm())
  await page.waitForFunction(() => !window.spendOwnership.snapshot().busy)
  expect(await page.evaluate(() => window.spendOwnership.calls.filter(call => call.confirm))).toEqual([{confirm: ['project', 'operation', 'quote', ['a']]}])
  await page.evaluate(() => window.spendOwnership.change('page'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 1)
  expect((await page.evaluate(() => window.spendOwnership.snapshot())).prompt).toBe('edited')
  await page.reload()
  await page.locator('#upload').waitFor()
  await page.evaluate(() => window.spendOwnership.change('page'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 1)
  expect((await page.evaluate(() => window.spendOwnership.snapshot())).prompt).toBe('edited')
})


it('an all-scope revision failure preserves the remaining shot across quote refresh and paging', async () => {
  await page.evaluate(() => {
    window.spendOwnership.revise = input => {
      if (input.shotId === 'b') return {ok:false, message:'fixture refusal'}
      const pending = window.spendOwnership.pending
      pending.shots[0].prompt = input.patch.prompt
      pending.quoteId = 'quote-revised'
      pending.planVersion++
      return {ok:true, quoteId:pending.quoteId}
    }
    window.spendOwnership.change('scope')
  })
  await page.waitForFunction(() => window.spendOwnership.snapshot().scope === 'all')
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.confirm())
  await page.waitForFunction(() => window.spendOwnership.calls.length === 2 && !window.spendOwnership.snapshot().busy)
  await page.evaluate(() => { window.spendOwnership.change('each'); window.spendOwnership.change('page') })
  await page.waitForFunction(() => window.spendOwnership.snapshot().page === 1 && window.spendOwnership.snapshot().scope === 'each')
  expect((await page.evaluate(() => window.spendOwnership.snapshot())).prompt).toBe('edited')
  expect(await page.evaluate(() => window.spendOwnership.calls.some(call => call.confirm))).toBe(false)
  await page.evaluate(() => window.spendOwnership.discard())
  await page.waitForFunction(() => window.spendOwnership.calls.some(call => call.discard) && !window.spendOwnership.snapshot().busy)
  // × 之后再来一笔就是**全新**的一笔：撤销没有找回账本，B 回到它自己的原文。
  await page.evaluate(() => {
    window.spendOwnership.pending.shots.splice(0, 1)
    window.spendOwnership.pending.quoteId = 'quote-B-only'
    window.spendOwnership.pending.planVersion++
    window.spendOwnership.change('revision')
  })
  await page.waitForFunction(() => window.spendOwnership.snapshot().quote === 'quote-B-only')
  expect((await page.evaluate(() => window.spendOwnership.snapshot())).prompt).toBe('b')
})

// T-QA-26（2026-09-22，与上面那条 T-QA-23 同根）：× 收回的是**这一次出价**，不是这份草稿
// （裁决 D）。同一个 operationId 再 `generate` = 重新出价，报价指纹必然换一份——而用户在卡上
// **没提交**的那句话是「这一次操作」的东西，不是「这一次报价」的东西，必须原样还在。
// 阳性对照写在同一条里：换一次 operationId 就是另一本账本，一个字都带不过去。
it('a withdrawn bid re-presented under the same operation keeps unsubmitted card edits', async () => {
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => window.spendOwnership.discard())
  await page.waitForFunction(() => window.spendOwnership.calls.some(call => call.discard) && !window.spendOwnership.snapshot().busy)
  await page.evaluate(() => window.spendOwnership.rebid())
  await page.waitForFunction(() => window.spendOwnership.snapshot().quote === 'quote-rebid')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().operation)).toBe('operation')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('edited')
  // 冷启动（D4 走查里真实走过的那一步）：账本活在存储里，键是这一次操作，重挂之后照样读回来。
  await page.reload()
  await page.locator('#upload').waitFor()
  await page.waitForFunction(() => Boolean(window.spendOwnership?.snapshot().prompt))
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('edited')
  // 没有任何改动被偷偷提交给宿主：草稿仍然只活在卡上。
  expect(await page.evaluate(() => window.spendOwnership.calls.some(call => call.patch))).toBe(false)
  await page.evaluate(() => window.spendOwnership.change('operation'))
  await page.waitForFunction(() => window.spendOwnership.snapshot().operation === 'operation-next')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('a')
})

// Real hook lifecycle with controlled storage failure; parent runs this browser slice serially.
// 账本写不进去（配额满 / 隐私模式）只是「关掉再回来还在不在」这件便利失效——
// **绝不允许**它把用户正在编辑的这张付费卡打断，也不许把上一笔的改动贴到下一笔上。
it('a storage quota failure never interrupts the card and never leaks the previous draft', async () => {
  await page.evaluate(() => window.spendOwnership.edit())
  await page.waitForFunction(() => window.spendOwnership.snapshot().prompt === 'edited')
  await page.evaluate(() => {
    window.recoverySetItem = Storage.prototype.setItem
    window.recoveryFailures = 0
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('nomi:spend-draft:')) {
        window.recoveryFailures++
        throw new DOMException('controlled quota failure', 'QuotaExceededError')
      }
      return window.recoverySetItem.call(this, key, value)
    }
    window.spendOwnership.edit()
  })
  await page.waitForFunction(() => window.recoveryFailures >= 1)
  // 卡还活着、改动还在（它活在 React state 里，存储只是便利）。
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('edited')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().operation)).toBe('operation')
  await page.evaluate(() => {
    Storage.prototype.setItem = window.recoverySetItem
    window.spendOwnership.change('quote')
  })
  await page.waitForFunction(() => window.spendOwnership.snapshot().quote === 'quote-next')
  expect(await page.evaluate(() => window.spendOwnership.snapshot().prompt)).toBe('a')
  expect(await page.evaluate(() => window.spendOwnership.calls)).toEqual([])
})
