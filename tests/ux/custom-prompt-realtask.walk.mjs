// R16 真实任务闭环：自定义提示词到底有没有真的作用到模型上（2026-08-18）。
//
// 前面那份 prompt-picker.walk.mjs 只证明了「选得到」。这份要证明「选了有用」——
// 走真模型、花真额度，把同一句话在「通用」和自定义提示词下各跑一次做**对照**。
// 没有对照组的话，模型碰巧写得像口播稿，也会被当成「提示词生效了」（假绿）。
//
// 凭据：从用户真实 userData 复制 model-catalog.json 到隔离目录 —— 用真 key，
// 但绝不往用户正式配置里写我的测试提示词。
import { launchNomiApp } from './_launchApp.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-r16-'))
const settingsDir = path.join(tempRoot, 'settings')
const projectsDir = path.join(tempRoot, 'projects')
const shotsDir = path.join(repoRoot, 'tests/ux/shots/custom-prompt-realtask')
fs.mkdirSync(settingsDir, { recursive: true })
fs.mkdirSync(shotsDir, { recursive: true })

const REAL_CATALOG = path.join(os.homedir(), 'Library/Application Support/Nomi/model-catalog.json')
if (!fs.existsSync(REAL_CATALOG)) {
  console.error(`拿不到真实模型目录：${REAL_CATALOG}\n没有真凭据就跑不了真任务——这条不能用假绿糊过去。`)
  process.exit(1)
}
fs.copyFileSync(REAL_CATALOG, path.join(settingsDir, 'model-catalog.json'))

const projDir = path.join(projectsDir, 'r16-0001')
fs.mkdirSync(path.join(projDir, '.nomi'), { recursive: true })
const project = {
  id: 'r16-0001', name: '自定义提示词真实任务', version: 2,
  createdAt: 1, updatedAt: 1, savedAt: 1, revision: 1, lastKnownRootPath: projDir,
  payload: {
    workbenchDocument: {
      version: 1, title: '真实任务', updatedAt: 1,
      contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '产品：一款给通勤族的保温杯，316 不锈钢，12 小时保温，杯盖一键弹开单手可开。' }] }] },
    },
    timeline: null,
    generationCanvas: { nodes: [], edges: [], selectedNodeIds: [], groups: [] },
    storyboardPlan: null, storyboardPlanCommitted: false,
  },
}
for (const t of [path.join(projDir, 'project.json'), path.join(projDir, '.nomi', 'project.json')]) {
  fs.writeFileSync(t, JSON.stringify(project, null, 2))
}

// 这段提示词刻意写得**可核对**：三个结构要求 + 一条禁令。判定不靠感觉，靠这四条对着数。
const CUSTOM_PROMPT = [
  '本轮任务：写口播带货脚本。严格按下面的结构，不要写成产品说明或文案分析。',
  '1. 前三秒必须是一个钩子问句，直接戳中用户的困扰。',
  '2. 中段必须描述一个具体的通勤场景（有时间、地点、动作），不要泛泛而谈。',
  '3. 结尾必须给一个促单理由。',
  '全程用第二人称「你」跟观众说话。',
  '禁止使用「首先」「其次」「然后」「总之」这类书面连接词。',
].join('\n')

const ASK = '给这个保温杯写一段口播'

const { app, win } = await launchNomiApp({ name: 'r16-custom-prompt', tempRoot, settingsDir, projectsDir, settleMs: 1500 })

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
const composer = () => win.locator('footer textarea').first()

/**
 * 发一句话并等模型把话说完。
 *
 * 完成信号必须用「停止键变回发送键」（由 turn 控制器的 sending 驱动），**不能**用「气泡文本不再变」——
 * 首跑就栽在这：pending 态气泡的文本恒为作者名「Nomi」，所谓「连续几次不变」在模型还没吐第一个字时
 * 就满足了，于是拿着 4 个字的作者名当产出去做判定，四条断言全红，看起来像功能坏了，其实是等待写错了。
 */
const stopButton = () => win.getByRole('button', { name: '停止生成' })

async function ask(text, tag) {
  await composer().fill(text)
  await win.waitForTimeout(300)
  await win.keyboard.press('Meta+Enter').catch(() => {})
  await win.waitForTimeout(600)
  if ((await composer().inputValue()).trim()) {
    await win.keyboard.press('Enter').catch(() => {})
  }
  // 先确认这一轮真的起飞了（停止键出现），再等它落地（停止键消失）。
  await stopButton().waitFor({ state: 'visible', timeout: 20000 })
  await stopButton().waitFor({ state: 'detached', timeout: 240000 })
  await win.waitForTimeout(800)
  await snap(tag)
  // 取最后一条 assistant 气泡的正文（剥掉作者名前缀，别把「Nomi」算进产出）。
  return await win.evaluate(() => {
    const nodes = [...document.querySelectorAll('.workbench-creation-ai__messages > *')]
    const last = nodes.length ? (nodes[nodes.length - 1].textContent || '').trim() : ''
    return last.replace(/^Nomi\s*/, '').trim()
  })
}

try {
  await win.evaluate(() => {
    for (const k of ['nomi:splash:v1', 'nomi:journey-tour:v1', 'nomi:canvas-gesture-hint:v1']) localStorage.setItem(k, 'seen')
  })
  await win.reload()
  await win.waitForTimeout(1600)
  for (let i = 0; i < 5; i += 1) {
    await win.keyboard.press('Escape').catch(() => {})
    const s = win.locator('button,[role="button"],a', { hasText: /跳过|完成|知道了|开始创作/ }).first()
    if ((await s.count()) > 0) await s.click({ timeout: 1000 }).catch(() => {})
  }
  const card = win.locator('[data-project-card]', { hasText: project.name }).first()
  await card.waitFor({ state: 'visible', timeout: 10000 })
  await card.hover()
  const cont = card.getByText('继续创作', { exact: false }).first()
  if ((await cont.count()) > 0) await cont.click(); else await card.dblclick()
  await win.waitForTimeout(2000)
  const creation = win.getByRole('button', { name: '创作', exact: true })
  if (await creation.isVisible().catch(() => false)) await creation.click()
  await win.getByLabel('创作区', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await win.waitForTimeout(1200)

  // ── 对照组：默认「通用」提示词下问同一句 ──
  console.log('\n【对照组】通用提示词下跑一次…')
  const baseline = await ask(ASK, '01-baseline-general')
  console.log(`  产出 ${baseline.length} 字`)
  record('对照组拿到真实产出', baseline.length > 40, `通用模式下模型回了 ${baseline.length} 字（真模型、真额度）`)

  // ── 新建自定义提示词 ──
  await win.evaluate(() => window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'ai' } })))
  await win.waitForTimeout(1600)
  await win.getByText('系统提示词', { exact: true }).first().scrollIntoViewIfNeeded().catch(() => {})
  await win.waitForTimeout(500)
  await win.getByRole('button', { name: /新建/ }).first().click()
  await win.waitForTimeout(900)
  await win.locator('[data-settings-field="system-prompt-name"]').first().fill('口播带货体')
  await win.locator('[data-settings-field="system-prompt"]').first().fill(CUSTOM_PROMPT)
  await win.waitForTimeout(1600)
  await snap('02-custom-created')
  await win.keyboard.press('Escape').catch(() => {})
  await win.waitForTimeout(1000)

  // ── 选中它 ──
  await picker().first().click()
  await win.waitForTimeout(700)
  await win.locator('[data-prompt-option]', { hasText: '口播带货体' }).first().click()
  await win.waitForTimeout(800)
  const chip = (await picker().first().innerText()).trim()
  record('自定义提示词已选中', chip.includes('口播带货体'), `chip 显示「${chip}」`)

  // ── 实验组：同一句话再跑一次 ──
  console.log('\n【实验组】自定义提示词下跑同一句…')
  const treated = await ask(ASK, '03-custom-output')
  console.log(`  产出 ${treated.length} 字`)

  console.log('\n──────── 两次产出全文 ────────')
  console.log('\n【通用】\n' + baseline)
  console.log('\n【口播带货体】\n' + treated)

  // ── 对着提示词里那四条硬要求逐条数 ──
  const hasHook = /[？?]/.test(treated.slice(0, 60))
  const secondPerson = (treated.match(/你/g) || []).length >= 3
  const noBookish = !/首先|其次|然后|总之/.test(treated)
  const differs = treated.trim() !== baseline.trim()

  record('① 开头是钩子问句', hasHook, hasHook ? '前 60 字内出现问句' : '开头没有问句')
  record('② 全程第二人称', secondPerson, `出现「你」${(treated.match(/你/g) || []).length} 次（要求 ≥3）`)
  record('③ 没用被禁的书面连接词', noBookish, noBookish ? '未出现 首先/其次/然后/总之' : '出现了被禁的连接词')
  record('④ 与对照组产出不同', differs, differs ? '两次产出不一样 —— 提示词确实改变了行为' : '两次一模一样，提示词没起作用')

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
