// 2026-08-18 提示词选择器的真机走查（R13）。用户原话：「得留自定义的口子，而且得可以被调用，
// 我们现在的找不到调用的地方」。这份要证明的正是「调得起来」：
//   1 选择器在 composer 发送键左边，头部那颗已删（一功能一个家）
//   2 7 个内置提示词**全部**在列 —— 尤其原来 UI 上根本不存在的那 5 个
//   3 选中后 chip 标签跟着变（读起来像选择器，不是静态徽标）
//   4 设置页能新建自定义提示词 → 它出现在选择器的「我的」组里 → 选得中
//   5 选中自定义后，带「镜头」的话不被拆分镜劫走（承接 08-17 的 dedicatedJob）
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-prompt-picker-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/prompt-picker')
fs.mkdirSync(shotsDir, { recursive: true })

const projDir = path.join(projectsDir, 'promptpicker-0001')
fs.mkdirSync(path.join(projDir, '.nomi'), { recursive: true })
const project = {
  id: 'promptpicker-0001', name: '提示词选择器走查', version: 2,
  createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1, lastKnownRootPath: projDir,
  payload: {
    workbenchDocument: {
      version: 1, title: '走查', updatedAt: 1,
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '林薇在雨夜的老码头被人追赶，她穿过一条又一条积水的巷子，霓虹灯牌在水面上碎成一片一片。' }] }] },
    },
    timeline: null,
    generationCanvas: { nodes: [], edges: [], selectedNodeIds: [], groups: [] },
    storyboardPlan: null, storyboardPlanCommitted: false,
  },
}
for (const t of [path.join(projDir, 'project.json'), path.join(projDir, '.nomi', 'project.json')]) {
  fs.writeFileSync(t, JSON.stringify(project, null, 2))
}

const { app, win } = await launchNomiApp({ name: 'prompt-picker', tempRoot, settingsDir, projectsDir, settleMs: 1200 })

const findings = []
const record = (name, ok, detail) => {
  findings.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`)
}
const snap = async (n) => { await win.screenshot({ path: path.join(shotsDir, `${n}.png`) }) }
async function closeApp() {
  const child = app.process()
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 8000))])
  if (child.exitCode === null) child.kill('SIGKILL')
}

const picker = () => win.locator('[data-creation-prompt-picker="true"]')

try {
  await win.evaluate(() => {
    for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(k, 'seen')
  })
  await win.reload()
  await win.waitForTimeout(1500)
  for (let i = 0; i < 5; i += 1) {
    await win.keyboard.press('Escape').catch(() => {})
    const s = win.locator('button,[role="button"],a', { hasText: /跳过|完成|知道了|开始创作/ }).first()
    if ((await s.count()) > 0) await s.click({ timeout: 1000 }).catch(() => {})
  }
  const card = win.locator('[data-project-card]', { hasText: project.name }).first()
  await card.waitFor({ state: 'visible', timeout: 8000 })
  await card.hover()
  const cont = card.getByText('继续创作', { exact: false }).first()
  if ((await cont.count()) > 0) await cont.click(); else await card.dblclick()
  await win.waitForTimeout(1800)
  const creation = win.getByRole('button', { name: '创作', exact: true })
  if (await creation.isVisible().catch(() => false)) await creation.click()
  await win.getByLabel('创作区', { exact: true }).waitFor({ state: 'visible', timeout: 8000 })
  await win.waitForTimeout(1000)
  await snap('01-composer')

  // ① 位置：在 composer（footer）里，不在 header 里。
  const count = await picker().count()
  const inFooter = count > 0 ? await picker().first().evaluate((el) => Boolean(el.closest('footer'))) : false
  const inHeader = count > 0 ? await picker().first().evaluate((el) => Boolean(el.closest('header'))) : false
  record('① 选择器在 composer、不在头部', count === 1 && inFooter && !inHeader,
    `找到 ${count} 个选择器；在 footer=${inFooter}，在 header=${inHeader}（期望 1 / true / false）`)

  // ② 7 个内置提示词全部在列 —— 这是用户报的「找不到调用的地方」的正面证明。
  await picker().first().click()
  await win.waitForTimeout(700)
  await snap('02-picker-open')
  const BUILTIN = ['general', 'story', 'script', 'assets', 'storyboard', 'seedance', 'review']
  const shown = await win.evaluate(() =>
    [...document.querySelectorAll('[data-prompt-option]')].map((n) => n.getAttribute('data-prompt-option')))
  const missing = BUILTIN.filter((id) => !shown.includes(id))
  record('② 7 个内置提示词全部可选', missing.length === 0,
    missing.length === 0 ? `全部在列：${shown.join('、')}` : `仍缺 ${missing.join('、')}（这 5 个正是原来调不起来的）`)

  // ③ 选中「写剧本」→ chip 标签跟着变。
  const before = (await picker().first().innerText()).trim()
  await win.locator('[data-prompt-option="script"]').first().click()
  await win.waitForTimeout(800)
  const after = (await picker().first().innerText()).trim()
  await snap('03-picked-script')
  record('③ chip 标签跟当前选择走', before !== after && after.includes('剧本'),
    `点「写剧本」前「${before}」→ 后「${after}」`)

  // ④ 设置页新建自定义提示词 → 回到对话里能选到。
  await win.evaluate(() => window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'ai' } })))
  await win.waitForTimeout(1400)
  const heading = win.getByText('系统提示词', { exact: true }).first()
  await heading.scrollIntoViewIfNeeded().catch(() => {})
  await win.waitForTimeout(400)
  const newChip = win.getByRole('button', { name: /新建/ }).first()
  const canCreate = await newChip.isVisible().catch(() => false)
  if (canCreate) {
    await newChip.click()
    await win.waitForTimeout(800)
    const nameInput = win.locator('[data-settings-field="system-prompt-name"]').first()
    if ((await nameInput.count()) > 0) {
      await nameInput.fill('口播带货体')
    }
    const body = win.locator('[data-settings-field="system-prompt"]').first()
    await body.fill('本轮任务：写口播带货脚本。前三秒必须给钩子，中段讲一个具体痛点场景，结尾给促单理由。')
    await win.waitForTimeout(1400)
    await snap('04-settings-created')
  }
  record('④ 设置页能新建自定义提示词', canCreate, canCreate ? '「新建」可点并已填入名字+正文' : '设置页里找不到「新建」')

  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(900)
  await picker().first().click()
  await win.waitForTimeout(700)
  await snap('05-picker-with-custom')
  const labels = await win.evaluate(() =>
    [...document.querySelectorAll('[data-prompt-option]')].map((n) => n.textContent?.trim() || ''))
  const hasCustom = labels.some((l) => l.includes('口播带货体'))
  record('⑤ 自定义提示词出现在选择器里（能被调用）', hasCustom,
    hasCustom ? '「口播带货体」已出现在「我的」组，可点选' : `没找到；当前条目：${labels.join('、')}`)

  if (hasCustom) {
    await win.locator('[data-prompt-option]', { hasText: '口播带货体' }).first().click()
    await win.waitForTimeout(800)
    const chip = (await picker().first().innerText()).trim()
    await snap('06-custom-selected')
    record('⑥ 选中自定义后 chip 显示它', chip.includes('口播带货体'), `chip 现在显示「${chip}」`)

    // ⑦ 选了自定义（dedicatedJob）→ 说带「镜头」的话不该被拆分镜动作卡劫走。
    const input = win.getByLabel(/输入|对话/).first()
    await input.fill('帮我把这段写成一个个画面').catch(async () => {
      await win.locator('textarea').last().fill('帮我把这段写成一个个画面')
    })
    await win.waitForTimeout(600)
    const nudge = await win.locator('[data-action-card="storyboard"]').count()
    await snap('07-no-hijack')
    record('⑦ 自定义提示词不被拆分镜劫走', nudge === 0,
      nudge === 0 ? '输入含「画面」也没弹拆分镜动作卡' : `冒出了 ${nudge} 张拆分镜卡`)
  }

  console.log('\n──────── 小结 ────────')
  const failed = findings.filter((f) => !f.ok)
  await closeApp()
  if (failed.length > 0) {
    console.error(`${failed.length} 项未通过：${failed.map((f) => f.name).join('、')}`)
    process.exit(1)
  }
  console.log(`全部 ${findings.length} 项通过。截图在 ${shotsDir}`)
} catch (error) {
  console.error(error)
  await win.screenshot({ path: path.join(shotsDir, 'failure.png') }).catch(() => {})
  console.log(JSON.stringify(findings, null, 2))
  await closeApp()
  process.exit(1)
}
