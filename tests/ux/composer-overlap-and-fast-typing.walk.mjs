// R13 走查：节点生成浮框（composer）不被画布底部 chrome 盖住 + 提示词编辑器快速输入不丢字。
//
// 两个用户可见症状（2026-09-21）：
//   ① 图片节点 composer 底栏（变体/参数芯片、生成钮）被画布左下的缩放工具条与底部「时间轴」胶囊压住；
//   ② 以 0ms 间隔逐键输入「A samurai walks…」变成「Ai waks…」（文字扩展工具、输入法上屏、极快打字）。
//
// 四件真实：打包同构的 dev Electron（隔离 profile）/ 真实页面输入（鼠标拖节点、键盘逐键输入、Cmd+V 粘贴、
// 点「优化」再点「应用」）/ 真实文本模型（DeepSeek 官方端点，走产品同一条 prompt_refine 管线，
// 用来产生一次真正来自编辑器之外的改写）/ 真实图片素材（1024×1792 实拍细节图进参考槽，让浮框长到截图里那么高）。
//
// 断言钉的是用户看得见的结果：
//   · 底栏每一颗控件的包围盒与每一块底部停靠区（缩放条、时间轴胶囊、Nomi 收起坞…）不相交，且中心点点得中它自己；
//     默认窗口测一次，缩到最小窗口（1100×720 内容区）再测一次；
//   · 0ms / 5ms 逐键键入 ≥80 字符中英混合串（含空格与标点）后，编辑器与输入逐字相同（图片 + 视频节点）；
//   · 一次性粘贴长文本逐字相同；
//   · 外部改写（优化 → 应用提示）确实写进编辑器，且之后继续快打不丢字；
//   · 追加 A：翻到节点上方的浮框卡片不压节点自己的浮动工具条 / 标签行（zh/en）；
//   · 追加 B：底栏芯片文字不被裁断——只允许「有意省略号 + title 全名 + 省略后仍 ≥24px」（1100×720 EN 是现场）。
// 另记一个探针：输入过程中编辑器文字「倒退」（纯插入却变短）的次数——那就是旧值回流覆盖文档的现场。
//
// 用法：先 pnpm run build；DEEPSEEK_API_KEY 取自 env（`set -a; . ~/.nomi-secrets.env; set +a`）。
//   node tests/ux/composer-overlap-and-fast-typing.walk.mjs
// 产出：tests/ux/shots/composer-overlap-and-fast-typing/*.png + report.json（key 不进任何日志/截图/报告）。
import fs from 'node:fs'
import path from 'node:path'
import { launchNomiApp, repoRoot, ACCEPTANCE_VIEWPORT } from './_launchApp.mjs'
import { addCanvasNodeFromRail } from './_canvasRail.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { clickOrFail, expect, expectVisible, expectHittable, screenshotSettled, DEFAULT_TIMEOUT_MS } from './_assert.mjs'

const API_KEY = process.env.DEEPSEEK_API_KEY
if (!API_KEY) throw new Error('需要 DEEPSEEK_API_KEY（外部改写走真实文本模型，不许 mock）：set -a; . ~/.nomi-secrets.env; set +a')

const VENDOR = 'deepseek-official'
const MODEL = 'deepseek-chat'
const REFERENCE_IMAGE = path.join(repoRoot, 'tests/ux/fixtures/hires-detail-1024x1792.png')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/composer-overlap-and-fast-typing')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

const COMPOSER = '.generation-canvas-v2-node__composer'
const COMPOSER_CARD = '.generation-canvas-v2-node__composer-card'
const EDITOR = `${COMPOSER} .generation-canvas-v2-node__prompt-input`
const FOOTER = `${COMPOSER} [data-node-composer-footer]`
const DOCKS = '[data-canvas-bottom-dock]'
const MIN_VIEWPORT = Object.freeze({ width: 1100, height: 720 })
const MODEL_TIMEOUT = stationTimeout({ operations: 6 })

// ≥80 字符，中英混合，含空格与标点；不含 @（那是引用触发符，会弹候选框）。
const MIXED = 'A samurai walks slowly through a bamboo forest in heavy rain, 镜头从背后跟拍，雨滴打在刀鞘上；camera at waist height (35mm, f/2.8)! 慢动作。'
const PASTE = '【粘贴】一只橘猫坐在窗台上，窗外是黄昏的城市天际线，暖色逆光。An orange cat on a windowsill at dusk, warm rim light, city skyline outside; 35mm film grain, shallow depth of field.'
if ([...MIXED].length < 80) throw new Error(`测试串必须 ≥80 字符，现在 ${[...MIXED].length}`)

const report = { viewport: {}, overlap: [], typing: [], external: null, screenshots: [] }
const redact = (text) => String(text).split(API_KEY).join('[REDACTED]')

async function launchWithDeepSeek(locale) {
  const root = path.join(repoRoot, '.tmp', `composer-keys-${locale}`)
  fs.rmSync(root, { recursive: true, force: true })
  const dirs = {
    userDataDir: path.join(root, 'user-data'), settingsDir: path.join(root, 'settings'),
    projectsDir: path.join(root, 'projects'), capabilityDir: path.join(root, 'capability'),
  }
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })
  const initialLocalStorage = {
    'nomi:locale:v1': locale, 'nomi-color-scheme': 'light',
    'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen',
  }
  // 凭据必须是 safeStorage 密文，只能由同一 Electron 身份加密：先起一次拿密文、关掉、写 catalog、再起。
  const first = await launchNomiApp({ name: `composer-keys-${locale}`, tempRoot: root, ...dirs, settleMs: 0, initialLocalStorage })
  const cipher = await first.app.evaluate(({ safeStorage }, key) => safeStorage.encryptString(key).toString('base64'), API_KEY)
  await first.app.close()
  const catalogFile = path.join(dirs.settingsDir, 'model-catalog.json')
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
  const now = new Date().toISOString()
  catalog.vendors.push({ key: VENDOR, name: 'DeepSeek Official', enabled: true, baseUrlHint: 'https://api.deepseek.com', providerKind: 'openai-compatible', authType: 'bearer', createdAt: now, updatedAt: now })
  catalog.models.push({ vendorKey: VENDOR, modelKey: MODEL, labelZh: MODEL, kind: 'text', enabled: true, published: true, createdAt: now, updatedAt: now })
  catalog.apiKeysByVendor = { ...(catalog.apiKeysByVendor || {}), [VENDOR]: { vendorKey: VENDOR, apiKey: cipher, enc: 'safeStorage', enabled: true, createdAt: now, updatedAt: now } }
  fs.writeFileSync(catalogFile, JSON.stringify(catalog), { mode: 0o600 })
  const launched = await launchNomiApp({ name: `composer-keys-${locale}`, tempRoot: root, ...dirs, settleMs: 0 })
  await expect.poll(() => launched.win.evaluate(() => window.nomiDesktop.promptLibrary.textBrain().then((r) => r?.brain ?? null)),
    { message: '文本大脑应解析到隔离 catalog 里的 DeepSeek', timeout: DEFAULT_TIMEOUT_MS }).toEqual({ vendor: VENDOR, modelKey: MODEL })
  return launched
}

async function openBlankGenerationCanvas(win, english) {
  await clickOrFail(win.getByText(english ? /New blank project/i : '新建空白项目', { exact: false }), english ? 'New blank project' : '新建空白项目')
  await clickOrFail(win.getByRole('button', { name: english ? 'Generate' : '生成', exact: true }), english ? 'Generate tab' : '生成 标签')
  await expectVisible(win.locator('.generation-canvas-v2-toolbar').first(), '生成画布左缘工具条就绪')
  const consent = win.getByRole('button', { name: english ? "Don't share" : '不分享', exact: true }).first()
  if (await consent.isVisible().catch(() => false)) await consent.click()
}

/** 内容区尺寸：原生窗口 + Chromium 视口一起设，量回来核一遍（同 _launchApp 的做法）。 */
async function setViewport(app, win, size) {
  const browserWindow = await app.browserWindow(win)
  await browserWindow.evaluate((window, next) => window.setContentSize(next.width, next.height), size)
  await win.setViewportSize(size)
  const actual = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  expect(actual, '内容区尺寸就是要测的那一档').toEqual(size)
}

/** 编辑器内容的可读投影：文字原样，chip 记成 ⟪chip⟫，段落用 \n。只读。 */
function readPrompt(win) {
  return win.locator(EDITOR).evaluate((root) => {
    const pm = root.classList.contains('ProseMirror') ? root : root.querySelector('.ProseMirror') ?? root
    return [...pm.children].map((paragraph) => {
      let out = ''
      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) { out += node.textContent; return }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        if (node.matches('[data-asset-mention]')) { out += '⟪chip⟫'; return }
        if (node.matches('.ProseMirror-trailingBreak, br')) return
        node.childNodes.forEach(walk)
      }
      paragraph.childNodes.forEach(walk)
      return out
    }).join('\n')
  })
}

/** 回退探针：纯插入期间编辑器文字长度变短的次数（= 旧值回流把文档覆盖回去）。 */
async function armRegressionProbe(win) {
  await win.locator(EDITOR).evaluate((root) => {
    const pm = root.classList.contains('ProseMirror') ? root : root.querySelector('.ProseMirror') ?? root
    window.__composerKeysProbe?.observer.disconnect()
    const probe = { last: pm.textContent.length, regressions: 0, observer: null }
    probe.observer = new MutationObserver(() => {
      const length = pm.textContent.length
      if (length < probe.last) probe.regressions += 1
      probe.last = length
    })
    probe.observer.observe(pm, { childList: true, subtree: true, characterData: true })
    window.__composerKeysProbe = probe
  })
}
const readRegressions = (win) => win.evaluate(() => {
  const probe = window.__composerKeysProbe
  probe?.observer.disconnect()
  return probe?.regressions ?? -1
})

async function clearEditor(win) {
  await clickOrFail(win.locator(EDITOR), '提示词框')
  await win.keyboard.press('Meta+a')
  await win.keyboard.press('Backspace')
  await expect.poll(() => readPrompt(win), { message: '提示词框已清空' }).toBe('')
}

/** 逐键打字（delay=ms），比对逐字相同；把丢字的现场与回退次数记进报告。 */
async function typeAndCompare(win, label, text, delay) {
  await clearEditor(win)
  await armRegressionProbe(win)
  const started = Date.now()
  await win.keyboard.type(text, { delay })
  const elapsed = Date.now() - started
  let actual = ''
  const settled = await expect.poll(async () => { actual = await readPrompt(win); return actual }, {
    message: `${label}：逐键 ${delay}ms 输入后编辑器应与输入逐字相同`, timeout: 4000,
  }).toBe(text).then(() => true, () => false)
  const regressions = await readRegressions(win)
  report.typing.push({ label, delayMs: delay, chars: [...text].length, elapsedMs: elapsed, identical: settled, regressions, actual: settled ? undefined : actual })
  console.log(`  ${settled ? '✓' : '✗'} ${label}（${delay}ms/键，${[...text].length} 字，${elapsed}ms，回退 ${regressions} 次）${settled ? '' : `\n      实得：${actual}`}`)
  expect(actual, `${label}：逐字相同`).toBe(text)
  expect(regressions, `${label}：纯插入期间编辑器文字从未倒退`).toBe(0)
}

async function pasteAndCompare(app, win, label, text) {
  await clearEditor(win)
  await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text)
  await win.keyboard.press('Meta+v')
  let actual = ''
  await expect.poll(async () => { actual = await readPrompt(win); return actual }, { message: `${label}：粘贴后逐字相同` }).toBe(text)
  report.typing.push({ label, mode: 'paste', chars: [...text].length, identical: actual === text })
  console.log(`  ✓ ${label}（粘贴 ${[...text].length} 字）`)
}

/**
 * 重叠判据：底栏里每一颗控件 × 每一块可见底部停靠区，矩形不许相交；每颗控件中心点点得中它自己。
 * 停靠区按 DOM 自己声明的 `data-canvas-bottom-dock` 取（和产品里的避让名单是同一个标记），不抄 class。
 */
async function assertFooterClearOfDocks(win, label) {
  const geometry = await win.evaluate(({ footerSelector, dockSelector, cardSelector }) => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) } }
    const footer = document.querySelector(footerSelector)
    const card = footer?.closest(cardSelector)
    const controls = footer ? [...footer.querySelectorAll('button, [role="button"], [role="combobox"]')].filter((el) => el.getBoundingClientRect().width > 0) : []
    const docks = [...document.querySelectorAll(dockSelector)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    const describe = (el) => el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 24) || el.tagName
    const intersections = []
    for (const control of controls) {
      const a = control.getBoundingClientRect()
      for (const dock of docks) {
        const b = dock.getBoundingClientRect()
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX > 0 && overlapY > 0) intersections.push({ control: describe(control), dock: describe(dock), overlap: [Math.round(overlapX), Math.round(overlapY)] })
      }
    }
    // 追加 A：浮框卡片不许压在它所属节点画在上沿之外的 chrome 上（浮动工具条、标签行）。
    const node = card?.closest('[data-node-id]')
    const nodeChrome = node ? [...node.querySelectorAll('[data-node-floating-toolbar="true"], [data-node-label-row="true"]')]
      .filter((el) => !card.contains(el) && el.getBoundingClientRect().width > 0) : []
    const chromeIntersections = []
    if (card) {
      const c = card.getBoundingClientRect()
      for (const el of nodeChrome) {
        const b = el.getBoundingClientRect()
        const overlapX = Math.min(c.right, b.right) - Math.max(c.left, b.left)
        const overlapY = Math.min(c.bottom, b.bottom) - Math.max(c.top, b.top)
        if (overlapX > 0 && overlapY > 0) chromeIntersections.push({ chrome: el.getAttribute('aria-label') || (el.hasAttribute('data-node-label-row') ? 'label-row' : el.tagName), overlap: [Math.round(overlapX), Math.round(overlapY)] })
      }
    }
    // 追加 B：底栏芯片的文字不许被裁断。允许的只有「有意的省略号 + title 能看全名」，且省略后仍留得下字。
    const clipped = []
    for (const control of controls) {
      const name = describe(control)
      if (control.scrollWidth > control.clientWidth + 1) clipped.push({ control: name, why: `内容溢出按钮 ${control.scrollWidth}>${control.clientWidth}` })
      for (const span of control.querySelectorAll('span')) {
        const text = span.textContent?.trim() ?? ''
        if (!text || span.children.length) continue
        if (span.scrollWidth <= span.clientWidth + 1) continue
        const ellipsis = getComputedStyle(span).textOverflow === 'ellipsis'
        const titled = Boolean(control.getAttribute('title')) && control.getAttribute('title').includes(text.replace(/…$/, ''))
        if (!ellipsis || !titled) clipped.push({ control: name, text, why: ellipsis ? '省略号但 title 看不到全名' : '无省略号的硬裁断' })
        else if (span.clientWidth < 24) clipped.push({ control: name, text, why: `省略后只剩 ${span.clientWidth}px，读不出字` })
      }
    }
    return {
      chromeIntersections,
      clipped,
      card: card ? rect(card) : null,
      footer: footer ? rect(footer) : null,
      side: footer?.closest('[data-flipped]')?.getAttribute('data-flipped') === 'true' ? 'above' : 'below',
      controls: controls.map((el) => ({ name: describe(el), ...rect(el) })),
      docks: docks.map((el) => ({ name: describe(el), ...rect(el) })),
      intersections,
      viewport: { width: innerWidth, height: innerHeight },
    }
  }, { footerSelector: FOOTER, dockSelector: DOCKS, cardSelector: COMPOSER_CARD })
  const minGap = geometry.footer ? Math.min(...geometry.docks
    .filter((dock) => dock.right > geometry.footer.left && dock.left < geometry.footer.right)
    .map((dock) => dock.top - geometry.footer.bottom), Infinity) : null
  report.overlap.push({ label, ...geometry, footerToDockGapPx: Number.isFinite(minGap) ? minGap : null })
  console.log(`  · ${label}：浮框在节点${geometry.side === 'above' ? '上' : '下'}方，card=${JSON.stringify(geometry.card)}，停靠区 ${geometry.docks.length} 块，底栏控件 ${geometry.controls.length} 颗，相交 ${geometry.intersections.length} 处，压节点浮条/标签行 ${geometry.chromeIntersections.length} 处，芯片裁断 ${geometry.clipped.length} 处，底栏到横向重叠停靠区的最小竖直间距 ${Number.isFinite(minGap) ? `${minGap}px` : '（无横向重叠停靠区）'}`)
  expect(geometry.footer, `${label}：底栏在`).not.toBeNull()
  expect(geometry.docks.length, `${label}：现场里至少有缩放条与时间轴胶囊两块停靠区（证明是在对的现场断言）`).toBeGreaterThanOrEqual(2)
  expect(geometry.controls.length, `${label}：底栏里有控件`).toBeGreaterThan(0)
  expect(geometry.intersections, `${label}：底栏控件与底部停靠区矩形不相交`).toEqual([])
  expect(geometry.chromeIntersections, `${label}：浮框卡片不压节点自己的浮动工具条 / 标签行`).toEqual([])
  expect(geometry.clipped, `${label}：底栏芯片文字没有被裁断`).toEqual([])
  const footerControls = win.locator(`${FOOTER} button, ${FOOTER} [role="button"], ${FOOTER} [role="combobox"]`)
  const count = await footerControls.count()
  for (let index = 0; index < count; index += 1) {
    const control = footerControls.nth(index)
    if (!(await control.isVisible())) continue
    const name = (await control.getAttribute('aria-label')) || (await control.textContent())?.trim().slice(0, 24) || `#${index}`
    await expectHittable(control, `${label}：底栏控件「${name}」`)
  }
}

/**
 * 把节点拖到画布左下（与缩放条、时间轴胶囊同一片区域）：节点水平中心压在缩放条右端附近，
 * 节点底边落在「浮框刚好还放得进视口底」的高度——正是截图里被盖住的那个现场。
 * 真人手势：在节点卡片上按下、分步挪、松开（不灌 store）。
 */
async function dragNodeToBottomLeft(win, nodeSelector, label) {
  const plan = await win.evaluate(({ nodeSelector: selector, composerSelector }) => {
    const node = document.querySelector(selector)
    const stage = document.querySelector('.generation-canvas-v2__stage')
    const zoomBar = [...document.querySelectorAll('[data-canvas-bottom-dock]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .sort((a, b) => a.left - b.left)[0]
    const composer = document.querySelector(composerSelector)
    if (!node || !stage || !zoomBar) return null
    const n = node.getBoundingClientRect(); const s = stage.getBoundingClientRect()
    const composerHeight = composer ? composer.getBoundingClientRect().height : 260
    const gap = 24
    return {
      from: { x: n.left + n.width / 2, y: n.top + n.height * 0.35 },
      targetCenterX: zoomBar.right - 20,
      targetBottom: s.bottom - 12 - gap - composerHeight,
      nodeBottom: n.bottom, nodeCenterX: n.left + n.width / 2,
    }
  }, { nodeSelector, composerSelector: COMPOSER_CARD })
  expect(plan, `${label}：量得到节点、舞台与缩放条`).not.toBeNull()
  const dx = plan.targetCenterX - plan.nodeCenterX
  const dy = plan.targetBottom - plan.nodeBottom
  await win.mouse.move(plan.from.x, plan.from.y)
  await win.mouse.down()
  await win.mouse.move(plan.from.x + dx / 2, plan.from.y + dy / 2, { steps: 8 })
  await win.mouse.move(plan.from.x + dx, plan.from.y + dy, { steps: 8 })
  await win.mouse.up()
}

async function ensureComposerOpen(win, nodeSelector, label) {
  const composer = win.locator(COMPOSER).first()
  if (!(await composer.isVisible().catch(() => false))) await clickOrFail(win.locator(nodeSelector), `${label}：点节点重新选中`)
  await expectVisible(composer, `${label}：生成浮框在`)
}

async function shot(target, name) {
  const file = path.join(shotsDir, `${name}.png`)
  await screenshotSettled(target, { path: file })
  report.screenshots.push(file)
}

async function uploadReference(win, english) {
  const composer = win.locator(COMPOSER).first()
  await clickOrFail(composer.locator(`button[aria-label="${english ? 'Add reference' : '加参考'}"]`), english ? 'Add reference' : '加参考')
  await win.locator(`input[type="file"][aria-label="${english ? 'Upload local file' : '上传本地文件'}"]`).first().setInputFiles(REFERENCE_IMAGE)
  await expectVisible(composer.getByLabel(/^(输入图|Input image)\s*1$/i).first(), '上传后参考槽出现真实图片 tile')
  await win.mouse.move(8, 8) // 移开指针：tile 悬停会弹大图预览，别让它盖住后面的几何与截图
}

async function optimizeAndApply(win, english) {
  const before = await readPrompt(win)
  await clickOrFail(win.locator(`${COMPOSER} [data-prompt-tool="optimize"]`), '优化钮')
  await clickOrFail(win.getByRole('button', { name: english ? 'Optimize Prompt' : '优化提示', exact: true }), '优化提示')
  const apply = win.getByRole('button', { name: english ? 'Apply Prompt' : '应用提示', exact: true })
  const started = Date.now()
  await expect(apply, '真模型给出优化结果').toBeVisible({ timeout: MODEL_TIMEOUT })
  await apply.click()
  let after = before
  await expect.poll(async () => { after = await readPrompt(win); return after !== before && after.trim().length > 0 },
    { message: '外部改写（应用提示）写进了编辑器' }).toBe(true)
  return { before, after, ms: Date.now() - started }
}

let current
try {
  // ─────────────── 中文界面 ───────────────
  current = await launchWithDeepSeek('zh-CN')
  let win = current.win
  await openBlankGenerationCanvas(win, false)
  report.viewport.default = ACCEPTANCE_VIEWPORT

  // 图片节点 + 改图模式 + 真实参考图：浮框长到截图里那么高。
  await addCanvasNodeFromRail(win, 'image')
  const imageNode = '[data-node-id]'
  await expectVisible(win.locator(COMPOSER).first(), '新建图片节点后浮出生成浮框')
  await clickOrFail(win.locator(COMPOSER).first().getByRole('button', { name: '改图', exact: true }), '改图 模式')
  await uploadReference(win, false)
  await shot(win, '00-zh-default-position')
  await assertFooterClearOfDocks(win, '中文·默认位置')

  await dragNodeToBottomLeft(win, imageNode, '中文·图片节点')
  await ensureComposerOpen(win, imageNode, '中文·拖到左下后')
  await assertFooterClearOfDocks(win, '中文·左下角（默认窗口）')
  await shot(win, '01-zh-bottom-left-default-window')

  await setViewport(current.app, win, MIN_VIEWPORT)
  report.viewport.min = MIN_VIEWPORT
  await dragNodeToBottomLeft(win, imageNode, '中文·最小窗口')
  await ensureComposerOpen(win, imageNode, '中文·最小窗口')
  await assertFooterClearOfDocks(win, '中文·左下角（最小窗口）')
  await shot(win, '02-zh-bottom-left-min-window')
  await setViewport(current.app, win, ACCEPTANCE_VIEWPORT)

  // 丢字：图片节点。
  await typeAndCompare(win, '图片节点·0ms', MIXED, 0)
  await typeAndCompare(win, '图片节点·5ms', MIXED, 5)
  await pasteAndCompare(current.app, win, '图片节点·粘贴', PASTE)
  await shot(win, '03-zh-image-typed')

  // 外部改写：优化 → 应用，编辑器必须显示改写结果；之后继续快打不丢字。
  await clearEditor(win)
  await win.keyboard.type('一只橘猫坐在窗台上', { delay: 0 })
  const rewrite = await optimizeAndApply(win, false)
  report.external = { source: 'optimizer apply (updateNode)', before: rewrite.before, after: rewrite.after, ms: rewrite.ms }
  console.log(`  ✓ 外部改写生效（${rewrite.ms}ms）\n      前：${rewrite.before}\n      后：${rewrite.after}`)
  await clickOrFail(win.locator(EDITOR), '点回提示词框')
  await win.keyboard.press('Meta+ArrowDown')
  await win.keyboard.press('End')
  const suffix = ' — then the camera cranes up, 雨停了。'
  await win.keyboard.type(suffix, { delay: 0 })
  await expect.poll(() => readPrompt(win), { message: '外部改写后继续 0ms 快打，结果 = 改写结果 + 追加串' }).toBe(rewrite.after + suffix)
  report.external.appendedIdentical = true
  await shot(win, '04-zh-after-external-rewrite')

  // 丢字：视频节点。
  await win.keyboard.press('Escape')
  await addCanvasNodeFromRail(win, 'video')
  await expectVisible(win.locator(COMPOSER).first(), '新建视频节点后浮出生成浮框')
  await typeAndCompare(win, '视频节点·0ms', MIXED, 0)
  await typeAndCompare(win, '视频节点·5ms', MIXED, 5)
  await pasteAndCompare(current.app, win, '视频节点·粘贴', PASTE)
  await assertFooterClearOfDocks(win, '中文·视频节点')
  await shot(win, '05-zh-video-typed')
  await current.app.close()
  current = null

  // ─────────────── 英文界面 ───────────────
  current = await launchWithDeepSeek('en')
  win = current.win
  await openBlankGenerationCanvas(win, true)
  await addCanvasNodeFromRail(win, 'image')
  await expectVisible(win.locator(COMPOSER).first(), 'EN：新建图片节点后浮出生成浮框')
  await clickOrFail(win.locator(COMPOSER).first().getByRole('button', { name: /edit/i }).first(), 'EN：改图模式')
  await uploadReference(win, true)
  await dragNodeToBottomLeft(win, imageNode, 'EN·图片节点')
  await ensureComposerOpen(win, imageNode, 'EN·拖到左下后')
  await assertFooterClearOfDocks(win, 'EN·左下角（默认窗口）')
  await typeAndCompare(win, 'EN·图片节点·0ms', MIXED, 0)
  await shot(win, '06-en-bottom-left-typed')
  await setViewport(current.app, win, MIN_VIEWPORT)
  await dragNodeToBottomLeft(win, imageNode, 'EN·最小窗口')
  await ensureComposerOpen(win, imageNode, 'EN·最小窗口')
  await assertFooterClearOfDocks(win, 'EN·左下角（最小窗口）')
  await shot(win, '07-en-bottom-left-min-window')
  await current.app.close()
  current = null

  report.result = 'pass'
} catch (error) {
  report.result = 'fail'
  report.error = redact(error?.stack ?? error)
  if (current) await current.win.screenshot({ path: path.join(shotsDir, 'FAIL.png') }).catch(() => {})
  console.error(redact(error?.stack ?? error))
  process.exitCode = 1
} finally {
  if (current) await current.app.close().catch(() => {})
  fs.writeFileSync(path.join(shotsDir, 'report.json'), redact(JSON.stringify(report, null, 2)))
}
