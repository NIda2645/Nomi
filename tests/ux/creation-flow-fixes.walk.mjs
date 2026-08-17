// 2026-08-17 创作链路五修的真机走查（R13：截图 + 人眼判断，不是只跑 expect）。
//
// 覆盖用户实测反馈的五条：
//   A 分镜方案「全部镜头」批量条 —— 一次把 12 个图片镜改成视频镜（原来要逐镜改十几次）
//   B 素材库「智能分组」tab 已删干净
//   C 分镜方案卡锚在产出它的那条消息上，不再跟着对话跑到最底下
//   D 选了「素材规划」专职模式 → 不再被拆分镜劫持（浮现卡也不冒出来）
//   E 设置 → AI → 系统提示词：全文可见、可改、可恢复默认（不再是 64px 小框）
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-creation-flow-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const projectId = 'creation-flow-fixes'
const projectRoot = path.join(projectsDir, `creation-flow-${projectId}`)
const shotsDir = path.join(repoRoot, 'tests/ux/shots/creation-flow-fixes')

fs.mkdirSync(path.join(projectRoot, '.nomi'), { recursive: true })
fs.mkdirSync(shotsDir, { recursive: true })

const SHOT_COUNT = 12
// 复刻用户遇到的现场：拆出来一整套**图片**镜（shotKind='image'），这正是要逐镜改十几次的那个状态。
const shots = Array.from({ length: SHOT_COUNT }, (_, index) => ({
  index: index + 1,
  shotKind: 'image',
  durationSec: 0,
  anchorIds: ['anchor-lin'],
  prompt: `第 ${index + 1} 镜：雨夜追逐，霓虹在积水里碎开。`,
}))

const storyboardPlan = {
  title: '雨夜追逐',
  anchors: [{
    id: 'anchor-lin',
    kind: 'character',
    name: '林薇',
    description: '短发女性，黑色风衣，雨夜',
    carrier: 'visual',
    scope: 'selective',
  }],
  shots,
}

const project = {
  id: projectId,
  name: '创作链路五修走查',
  version: 2,
  createdAt: 1,
  updatedAt: 1,
  savedAt: 1,
  revision: 1,
  lastKnownRootPath: projectRoot,
  payload: {
    workbenchDocument: {
      version: 1,
      title: '雨夜追逐',
      contentJson: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            // 够长（≥60 字）才会触发 StoryboardNudge 的浮现条件——D 要验的正是「够长但也不该浮」。
            text: '林薇在雨夜的老码头被人追赶，她穿过一条又一条积水的巷子，霓虹灯牌在水面上碎成一片一片。她知道对方要的是那只旧铁盒，可她还没想明白，铁盒里那张照片究竟意味着什么。',
          }],
        }],
      },
      updatedAt: 1,
    },
    timeline: null,
    generationCanvas: { nodes: [], edges: [], selectedNodeIds: [], groups: [] },
    storyboardPlan,
    storyboardPlanCommitted: false,
  },
}

for (const target of [path.join(projectRoot, 'project.json'), path.join(projectRoot, '.nomi', 'project.json')]) {
  fs.writeFileSync(target, JSON.stringify(project, null, 2))
}

// C 要验「卡片锚在产出它的那条消息上」：得有一条带 storyboardPlan 标的助手消息，
// 后面还跟着更晚的对话——卡片必须留在中间那条下面，而不是被顶到列表最底下。
const conversations = {
  v: 2,
  creation: {
    activeId: 'thread-1',
    threads: [{
      id: 'thread-1',
      title: '雨夜追逐',
      createdAt: 1,
      updatedAt: 5,
      messages: [
        { id: 'u1', role: 'user', content: '把这个故事拆成镜头' },
        { id: 'a1', role: 'assistant', content: '已经拆成 12 个镜头。', storyboardPlan: true },
        { id: 'u2', role: 'user', content: '这条是拆完之后我又说的话' },
        { id: 'a2', role: 'assistant', content: '收到，这条在方案卡后面。' },
      ],
    }],
  },
  generation: { activeId: null, threads: [] },
}
fs.writeFileSync(path.join(projectRoot, '.nomi', 'conversations.json'), JSON.stringify(conversations, null, 2))

// D 要验的是「还没拆过、故事够长」时的浮现卡：这个状态下卡片本该出现（通用模式），
// 而选了专职模式就该消失。项目 1 已经有方案了（storyboardPlan≠null → 卡片天然不显示），
// 在那里测等于什么都没测——所以另起一个干净项目。
const nudgeProjectId = 'creation-flow-nudge'
const nudgeProjectRoot = path.join(projectsDir, `creation-flow-${nudgeProjectId}`)
fs.mkdirSync(path.join(nudgeProjectRoot, '.nomi'), { recursive: true })
const nudgeProject = {
  ...project,
  id: nudgeProjectId,
  name: '专职模式不被劫持',
  lastKnownRootPath: nudgeProjectRoot,
  payload: { ...project.payload, storyboardPlan: null, storyboardPlanCommitted: false },
}
for (const target of [path.join(nudgeProjectRoot, 'project.json'), path.join(nudgeProjectRoot, '.nomi', 'project.json')]) {
  fs.writeFileSync(target, JSON.stringify(nudgeProject, null, 2))
}

const { app, win } = await launchNomiApp({
  name: 'creation-flow-fixes',
  tempRoot,
  settingsDir,
  projectsDir,
  settleMs: 1200,
})

const findings = []
function record(name, ok, detail) {
  findings.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`)
}

async function shot(name) {
  await win.screenshot({ path: path.join(shotsDir, `${name}.png`) })
}

async function closeApp() {
  const child = app.process()
  await Promise.race([app.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 8000))])
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function dismissOnboarding() {
  await win.evaluate(() => {
    for (const key of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) {
      localStorage.setItem(key, 'seen')
    }
  })
  await win.reload()
  await win.waitForTimeout(1400)
  for (let i = 0; i < 5; i += 1) {
    await win.keyboard.press('Escape').catch(() => {})
    const skip = win.locator('button,[role="button"],a', { hasText: /跳过|完成|知道了|开始创作/ }).first()
    if ((await skip.count()) > 0) await skip.click({ timeout: 1000 }).catch(() => {})
  }
}

async function openProject(name) {
  // 已经在某个项目里 → 先回项目库，再开目标项目。
  const backToLibrary = win.getByRole('button', { name: '项目库', exact: false }).first()
  if (await backToLibrary.isVisible().catch(() => false)) {
    await backToLibrary.click().catch(() => {})
    await win.waitForTimeout(1400)
  }
  const card = win.locator('[data-project-card]', { hasText: name }).first()
  await card.waitFor({ state: 'visible', timeout: 8000 })
  await card.hover()
  const continueButton = card.getByText('继续创作', { exact: false }).first()
  if ((await continueButton.count()) > 0) await continueButton.click()
  else await card.dblclick()
  await win.waitForTimeout(1800)
  const creationButton = win.getByRole('button', { name: '创作', exact: true })
  if (await creationButton.isVisible().catch(() => false)) await creationButton.click()
  await win.getByLabel('创作区', { exact: true }).waitFor({ state: 'visible', timeout: 8000 })
}

// ───────────────────────── C 分镜卡锚定 ─────────────────────────
async function verifyPlanCardAnchored() {
  const card = win.locator('[data-storyboard-card]').first()
  await card.waitFor({ state: 'visible', timeout: 8000 })
  const laterMessage = win.getByText('这条是拆完之后我又说的话').first()
  const [cardBox, laterBox] = await Promise.all([card.boundingBox(), laterMessage.boundingBox()])
  await shot('C-plan-card-anchored')
  if (!cardBox || !laterBox) {
    record('C 分镜卡锚定', false, '拿不到方案卡或后续消息的边界框')
    return
  }
  // 锚定成立 = 卡片在「拆完那条」之后、但在「我又说的话」**之前**。
  const anchored = cardBox.y + cardBox.height <= laterBox.y + 4
  record('C 分镜卡锚定', anchored,
    anchored ? `卡片(y=${Math.round(cardBox.y)}) 留在后续消息(y=${Math.round(laterBox.y)}) 之前，没跟着对话跑`
      : `卡片(y=${Math.round(cardBox.y)}) 跑到了后续消息(y=${Math.round(laterBox.y)}) 下面 —— 仍在跟随对话`)
}

// ───────────────────────── A 批量条 ─────────────────────────
async function verifyBulkBar() {
  await win.locator('[data-storyboard-card]').first().getByRole('button', { name: /打开编辑器|编辑|继续编辑|再改改/ }).first()
    .click({ timeout: 5000 }).catch(async () => {
      await win.getByText('打开编辑器', { exact: false }).first().click({ timeout: 5000 })
    })
  await win.waitForTimeout(1200)

  const scope = win.getByText('全部镜头', { exact: true }).first()
  const present = await scope.isVisible().catch(() => false)
  await shot('A-bulk-bar-before')
  if (!present) {
    record('A 批量条存在', false, '编辑器里找不到「全部镜头」批量条')
    return
  }
  record('A 批量条存在', true, '「全部镜头」批量条常驻在编辑器里，带作用域组名')

  const typeSelect = win.getByLabel('全部镜头的类型').first()
  const before = await win.evaluate(() => document.body.innerText.match(/视频/g)?.length ?? 0)
  await typeSelect.selectOption({ label: '视频' }).catch(async () => {
    await typeSelect.click()
    await win.getByRole('option', { name: '视频' }).first().click()
  })
  await win.waitForTimeout(900)
  await shot('A-bulk-bar-after-video')

  // 全部改成视频后：每张镜卡都该出现「时长」选择器（图片镜没有时长）。
  const durationCount = await win.getByLabel(/^时长$/).count().catch(() => 0)
  const after = await win.evaluate(() => document.body.innerText.match(/视频/g)?.length ?? 0)
  const flipped = durationCount >= SHOT_COUNT
  record('A 一次改全部镜头', flipped,
    flipped ? `一次操作后 ${durationCount} 张镜卡都出现时长选择器（=全变视频镜），文中「视频」字样 ${before}→${after}`
      : `只有 ${durationCount} 张镜卡变成视频镜，期望 ≥${SHOT_COUNT}`)
}

// ───────────────────────── D 素材规划不被劫持 ─────────────────────────
async function verifyAssetsModeNotHijacked() {
  await win.keyboard.press('Escape').catch(() => {})
  await openProject(nudgeProject.name)

  // 精确锚点：只数浮现的拆镜头动作卡本身，不数页面上出现的「拆成镜头」字样
  // （第一版就是被我自己 seed 的那句用户消息骗了，误报成产品 bug）。
  const nudgeCard = win.locator('[data-action-card="storyboard"]')

  // 基线：通用模式下这张卡**应该**出现。不先证明测得到，「没看到卡」就只是个空洞的通过。
  await win.waitForTimeout(1200)
  const baseline = await nudgeCard.count()
  await shot('D-baseline-general-mode')
  record('D 基线：通用模式确实会浮拆镜头卡', baseline > 0,
    baseline > 0 ? `通用模式下浮现了 ${baseline} 张拆镜头卡（说明这条检查测得到东西）`
      : '通用模式下也没浮卡 —— 基线不成立，下面那条通过不算数')

  const chip = win.locator('button', { hasText: /通用助手|自动|素材/ }).first()
  await chip.click({ timeout: 5000 }).catch(() => {})
  await win.waitForTimeout(600)
  const assetsEntry = win.getByText('素材规划', { exact: false }).first()
  if (await assetsEntry.isVisible().catch(() => false)) await assetsEntry.click()
  await win.waitForTimeout(1200)
  await shot('D-assets-mode-selected')

  const after = await nudgeCard.count()
  record('D 素材规划下不推拆分镜', baseline > 0 && after === 0,
    after === 0 ? '选中素材规划后浮现卡消失，没有抢用户已经指好的路'
      : `仍有 ${after} 张拆镜头卡冒出来`)
}

// ───────────────────────── B 智能分组已删 ─────────────────────────
async function verifySmartGroupGone() {
  // 智能分组过去住在生成区的素材库面板里 —— 得真的走到那个面才算查过。
  const generation = win.getByRole('button', { name: '生成', exact: true })
  if (await generation.isVisible().catch(() => false)) await generation.click()
  await win.waitForTimeout(1400)
  const assetEntry = win.getByRole('button', { name: /素材库|素材/ }).first()
  if (await assetEntry.isVisible().catch(() => false)) await assetEntry.click().catch(() => {})
  await win.waitForTimeout(1200)
  await shot('B-asset-library-no-smart-group')
  const hits = await win.getByText('智能分组', { exact: false }).count().catch(() => 0)
  record('B 智能分组已删干净', hits === 0,
    hits === 0 ? '走到生成区素材库，搜不到「智能分组」入口' : `素材库里仍有 ${hits} 处残留`)
}

// ───────────────────────── E 系统提示词进设置 ─────────────────────────
async function verifySystemPromptSettings() {
  await win.evaluate(() => window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'ai' } })))
  await win.waitForTimeout(1400)
  const heading = win.getByText('系统提示词', { exact: true }).first()
  if ((await heading.count()) === 0) {
    await shot('E-settings-missing')
    record('E 系统提示词进设置', false, '设置 → AI 里找不到「系统提示词」区')
    return
  }
  // 这一节在 AI 策略页的折叠线以下——先滚到它，否则量到的是别的控件（第一版就栽在这）。
  await heading.scrollIntoViewIfNeeded()
  await win.waitForTimeout(500)
  await shot('E-settings-system-prompt')
  record('E 系统提示词进设置', true, '设置 → AI 里有「系统提示词」区')

  // 量这一节自己的编辑框，不是页面上第一个 textarea。
  const box = win.locator('[data-settings-field="system-prompt"]').first()
  const scoped = (await box.count()) > 0
  const height = (await box.boundingBox().catch(() => null))?.height ?? 0
  // 原来那个只读框是 max-h-16 = 64px。要明显比它大，才算真解决「局限在很小的框里」。
  const roomy = height >= 120
  record('E 提示词框够大', roomy && scoped,
    `提示词编辑框高 ${Math.round(height)}px（原来的只读小框 64px）${scoped ? '' : ' · 找不到 data-settings-field="system-prompt"'}`)

  // 默认选中的是「通用」，它的提示词本来就只有 ~48 字 —— 拿它验「不截断」等于没验。
  // 换成「素材」：那份是用户 2026-08-12 提供的全资产大师规范，上万字，旧小框硬截在 360 字。
  await win.getByRole('button', { name: '素材', exact: true }).first().click().catch(() => {})
  await win.waitForTimeout(600)
  const full = ((await box.inputValue().catch(() => '')) || '').length
  record('E 提示词不截断', full > 360,
    `素材规划的提示词在编辑框里有 ${full} 字，完整可读（旧的只读小框硬截断在 360 字）`)
  await shot('E-settings-system-prompt-assets')

  // 「可改 + 可恢复」是这次拍板的核心诉求，光有个大框不算数。
  const reset = win.locator('[data-settings-prompt-reset]').first()
  const resetFallback = win.getByRole('button', { name: '恢复默认' }).first()
  const resetBtn = (await reset.count()) > 0 ? reset : resetFallback
  const disabledBefore = await resetBtn.isDisabled().catch(() => null)
  record('E 未改动时「恢复默认」置灰', disabledBefore === true,
    disabledBefore === true ? '没有覆盖时按钮是 disabled（§1.6 C1 可点即有效）' : `按钮 disabled=${disabledBefore}`)

  await box.click()
  await box.press('End')
  await box.type('\n【走查追加的一行】')
  await win.waitForTimeout(1200)
  const customized = await win.locator('[data-settings-prompt-customized]').count().catch(() => 0)
  const disabledAfter = await resetBtn.isDisabled().catch(() => null)
  await shot('E-settings-prompt-customized')
  record('E 改完标「已自定义」且可恢复', customized > 0 && disabledAfter === false,
    `已自定义徽标 ${customized > 0 ? '出现' : '没出现'}，恢复默认按钮 disabled=${disabledAfter}`)

  await resetBtn.click().catch(() => {})
  await win.waitForTimeout(1200)
  const restored = ((await box.inputValue().catch(() => '')) || '').length
  await shot('E-settings-prompt-reset')
  record('E 恢复默认真的还原', restored === full,
    restored === full ? `恢复后字数回到 ${restored}，与内置默认一致` : `恢复后 ${restored} 字，期望 ${full} 字`)
}

try {
  await dismissOnboarding()
  await openProject(project.name)
  await shot('00-creation-workspace')

  await verifyPlanCardAnchored()
  await verifyBulkBar()
  await verifySmartGroupGone()
  await verifySystemPromptSettings()
  await verifyAssetsModeNotHijacked()

  console.log('\n──────── 走查小结 ────────')
  console.log(JSON.stringify(findings, null, 2))
  const failed = findings.filter((f) => !f.ok)
  await closeApp()
  if (failed.length > 0) {
    console.error(`\n${failed.length} 项未通过：${failed.map((f) => f.name).join('、')}`)
    process.exit(1)
  }
  console.log(`\n全部 ${findings.length} 项通过。截图在 ${shotsDir}`)
} catch (error) {
  console.error(error)
  await win.screenshot({ path: path.join(shotsDir, 'failure.png') }).catch(() => {})
  console.log(JSON.stringify(findings, null, 2))
  await closeApp()
  process.exit(1)
}
