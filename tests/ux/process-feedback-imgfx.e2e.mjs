import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { expect, expectVisible, expectAbsent, proveProbe } from './_assert.mjs'
import { assertLabPortOwnership, labOriginFor } from './design-lab/labServer.mjs'

const evidence = path.resolve('docs/plan/process-feedback-evidence/imgfx/lab')
await fs.mkdir(evidence, { recursive: true })
const only = process.env.PF_FX_ONLY
if (only !== 'probe') assertLabPortOwnership('visual')
const browser = await chromium.launch({ args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] })
const receipt = []
async function open(state, reduced = false, freeze = true) {
  const page = await browser.newPage({ viewport: { width: 900, height: 650 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  page.on('pageerror', error => receipt.push({ error: String(error) }))
  if (freeze) {
    await page.clock.install({ time: new Date('2026-09-09T11:59:59Z') })
    await page.clock.pauseAt(new Date('2026-09-09T12:00:00Z'))
  }
  await page.goto(`${labOriginFor('visual')}/design-lab.html?screen=process-feedback&frame=1&state=${state}`)
  await expectVisible(page.locator('[data-process-lab-ready]'), '真实宿主挂载')
  return page
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`) })
  receipt.push({ screenshot: name })
}
try {
  if (!only || only === 'probe') {
    const require = createRequire(import.meta.url)
    const { build } = createRequire(require.resolve('vite/package.json'))('esbuild')
    const bundle = await build({ stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { useReducedProcessMotion } from './src/workbench/generationCanvas/nodes/useReducedProcessMotion';
      let probes = 0, released = 0;
      const listeners = new Set();
      const realContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        if (kind !== 'webgl') return realContext.call(this, kind, ...args);
        probes++;
        return { getExtension: name => name === 'WEBGL_lose_context' ? { loseContext: () => released++ } : { UNMASKED_RENDERER_WEBGL: 0x9246 }, getParameter: () => 'Hardware fixture' };
      };
      const realMatch = window.matchMedia.bind(window);
      window.matchMedia = query => {
        const media = realMatch(query);
        const add = media.addEventListener.bind(media), remove = media.removeEventListener.bind(media);
        media.addEventListener = (type, callback, ...args) => { if (type === 'change') listeners.add(callback); add(type, callback, ...args); };
        media.removeEventListener = (type, callback, ...args) => { if (type === 'change') listeners.delete(callback); remove(type, callback, ...args); };
        return media;
      };
      function Consumer(){return <span data-reduced={String(useReducedProcessMotion())}/>;}
      function App(){const [show,setShow]=React.useState(true);return <><button onClick={()=>setShow(!show)}>Toggle</button>{show && Array.from({length:8},(_,key)=><Consumer key={key}/>)}</>;}
      window.probeStats = () => ({probes,released,listeners:listeners.size});
      createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
    `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' } })
    const page = await browser.newPage({ reducedMotion: 'no-preference' })
    try {
      await page.setContent('<main id="root"></main>')
      await page.addScriptTag({ content: bundle.outputFiles[0].text })
      await page.waitForFunction(() => document.querySelectorAll('[data-reduced="false"]').length === 8)
      const stats = () => page.evaluate('window.probeStats()')
      expect(await stats()).toEqual({ probes: 1, released: 1, listeners: 8 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForFunction(() => document.querySelectorAll('[data-reduced="true"]').length === 8)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.waitForFunction(() => document.querySelectorAll('[data-reduced="false"]').length === 8)
      await page.getByRole('button', { name: 'Toggle' }).click()
      expect(await stats()).toEqual({ probes: 1, released: 1, listeners: 0 })
      await page.getByRole('button', { name: 'Toggle' }).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-reduced="false"]').length === 8)
      expect(await stats()).toEqual({ probes: 1, released: 1, listeners: 8 })
      receipt.push({ criterion: 'shared-probe-strict-mode-live-preference-cleanup', result: 'green', stats: await stats(), gpu: 'hardware capability fixture; React and media query events are real' })
    } finally { await page.close() }
  }
  if (!only || only === 'generating') {
    const page = await open('pf-fx-generating')
    await expectVisible(page.locator('[data-process-fx]'), '真实 img-fx 挂载')
    await expect(page.locator('[data-process-fx]')).toHaveAttribute('data-image-count', '0')
    await page.clock.runFor(1000)
    await expect(page.locator('[data-process-fx]')).toHaveAttribute('data-cycle-phase', 'idle')
    receipt.push({ criterion: 'no-fabricated-image', result: 'green', canvases: await page.locator('[data-process-fx] canvas').evaluateAll(nodes => nodes.map(n => ({ width: n.width, height: n.height, rect: n.getBoundingClientRect().toJSON() }))) })
    await shot(page, 'pf-fx-generating')
    await page.close()
  }
  if (!only || only === 'preview') {
    const page = await open('pf-fx-preview-reveal')
    await expect(page.locator('[data-process-fx]')).toHaveAttribute('data-cycle-phase', 'reveal')
    await page.clock.runFor(400)
    await expectVisible(page.locator('[data-process-preview-scrim]'), '真实预览帧仍有说明遮罩')
    await shot(page, 'pf-fx-preview-reveal')
    await page.close()
  }
  if (!only || only === 'final') {
    const page = await open('pf-image-generating')
    const waitingProof = await proveProbe(page.locator('[data-process-fx]'), '先证明等待层存在')
    await page.clock.pauseAt(new Date('2026-09-09T12:01:00Z'))
    await page.evaluate(async () => {
      const { advanceProcessFeedback } = await import('/src/devlab/designLab/processFeedback/processFeedbackLabKit.tsx')
      advanceProcessFeedback('saved')
    })
    await expect(page.locator('[data-process-fx]')).toHaveAttribute('data-image-source', '/fixtures/process-feedback-result.svg')
    await expect(page.locator('[data-process-fx]')).toHaveAttribute('data-cycle-phase', 'reveal')
    await page.clock.runFor(400)
    await shot(page, 'pf-fx-final-reveal')
    await page.clock.runFor(801)
    // Immediate sampling at the deadline: retrying for 5s would hide a 1s overstay mutation.
    expect(await page.locator('[data-generation-waiting]').count(), '1200ms 后等待层必须已卸载').toBe(0)
    expect(await page.locator('[data-generating-placement]').count(), '等待层父壳也必须卸载').toBe(0)
    expect(await page.locator('[data-node-id] canvas').count(), '卸载后所有 fx canvas 归零').toBe(0)
    await expectAbsent(page.locator('[data-generation-waiting]'), { provenBy: waitingProof, message: '等待层持续卸载' })
    await page.clock.runFor(2000)
    await shot(page, 'pf-fx-done-clean')
    receipt.push({ criterion: 'terminal-zero-waiting-overlay', deadlineMs: 1200, result: 'green' })
    await page.close()
  }
  if (!only || only === 'organic') {
    const page = await open('pf-fx-organic')
    await expectVisible(page.locator('[data-process-fx]'), 'organic 对比态挂载')
    await page.clock.runFor(1000)
    await shot(page, 'pf-fx-organic')
    await page.close()
  }
  if (!only || only === 'reduced') {
    const page = await open('pf-fx-reduced', true)
    await expectVisible(page.locator('[data-process-static-grid]'), '减弱动态使用静态格子')
    expect(await page.locator('[data-process-fx]').count()).toBe(0)
    expect(await page.locator('[data-process-static-band]').count()).toBe(0)
    expect(await page.locator('[data-process-static-grid]').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
    await expect(page.locator('[data-process-static-grid]')).toHaveCSS('mask-composite', /^intersect(?:, intersect)?$/)
    await shot(page, 'pf-fx-reduced')
    await page.close()
  }
  if (!only || only === 'gates') {
    const page = await open('pf-fx-generating', false, false)
    await expectVisible(page.locator('[data-process-fx]'), '门控正向对照先挂载')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expectVisible(page.locator('[data-process-static-grid]'), '动态切换 reduced-motion 卸载 shader')
    expect(await page.locator('[data-process-fx]').count()).toBe(0)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expectVisible(page.locator('[data-process-fx]'), '恢复动态重新挂载格子效果')
    async function zoom(value) {
      await page.evaluate(async z => {
        const { setProcessFeedbackZoom } = await import('/src/devlab/designLab/processFeedback/processFeedbackLabKit.tsx')
        setProcessFeedbackZoom(z)
      }, value)
    }
    await zoom(0.39)
    await expectVisible(page.locator('[data-process-static-grid]'), '39% 卸载')
    expect(await page.locator('[data-process-fx]').count()).toBe(0)
    await zoom(0.4)
    await expectVisible(page.locator('[data-process-fx]'), '40% 恢复')
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.locator('[data-process-fx]')).toHaveAttribute('data-paused', 'true')
    await page.evaluate(() => {
      delete document.hidden
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.locator('[data-process-fx]')).not.toHaveAttribute('data-paused', 'true')
    await page.evaluate(async () => {
      const { advanceProcessFeedback } = await import('/src/devlab/designLab/processFeedback/processFeedbackLabKit.tsx')
      advanceProcessFeedback('failed')
    })
    await expect(page.locator('[data-generation-waiting]')).toHaveCount(0)
    await expect(page.locator('[data-node-id] canvas')).toHaveCount(0)
    receipt.push({ criterion: 'reduced-zoom-visibility-failure', result: 'green' })
    await page.close()
  }
  expect(receipt.filter(item => item.error)).toEqual([])
} finally {
  await fs.writeFile(path.join(evidence, `acceptance${only ? `-${only}` : ''}.json`), JSON.stringify(receipt, null, 2))
  await browser.close()
}
