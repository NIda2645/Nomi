#!/usr/bin/env node
// 真实用户任务 · **真花钱**那条腿（R13 四件真实：真应用 / 真面板输入 / 真工具轨迹 / 真模型真素材）。
//
//   node tests/ux/agent-spend-real-image.paid.mjs
//
// 为什么非要花这一次钱：`agent-spend-full-auto.walk.mjs` 的供应商是 loopback 夹具，它证得到
// 「档位改变了宿主的行为」，证不到「档位代答之后图真的出来了」——那台夹具上封印那步必然被拒。
// 2026-09-18 修完 `draft_shots` 丢 `candidate` 的根因之后，必须有人亲眼看见两件事在真供应商上成立：
//
//   ① 「只问花钱」（safe-auto）档：问一句 → 报价卡出现 → 点确认 → 真图落到画布上；
//   ② 「全自动」（project）档：同一句话 → **一张卡都不出** → 真图照样落到画布上，
//      而模型的回执说的是「档位替你答了、已经开跑」，不是「有张卡在等你」。
//
// 大脑：这台机器上已配好的 DeepSeek（便宜档）。生图：APIMart 最便宜那个图模型。
// 两家的凭据都是**真实目录里的 safeStorage 密文**原样拷进隔离副本（同机解得开）——
// 明文 key 从头到尾不落任何文件、不进报告、不回显（与 `agent-spend-r30.mjs` 同一手法）。
// 隔离副本里只留这一个图模型：模型从 `list_models` 里点谁，都只能点到它，花销可预期。
//
// zh / en 各留一张真截图：① 在中文界面走，② 走之前从设置里把界面切成 English（真人怎么切就怎么切）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from './_assert.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER_PERMISSION, INTERVENTION_CONFIRM, PERMISSION_POPOVER,
  V4_FLOW, chooseAssistantModel, createRuntimeWalk, openCanvas, permissionTier, readProject, sendCanvas,
} from './agent-runtime-walk-support.mjs'

// 这条走查**真的花钱**：文件名带 `.paid`，而且在 CI 里当场拒跑。防线建在最早能拦住的那层（R17）——
// 靠「谁都记得别在 CI 里跑它」是拦不住的，一次忘记的代价是真实账单。
if (process.env.CI) {
  throw new Error('agent-spend-real-image.paid.mjs 会真的调用供应商并扣费，不在 CI 里跑；'
    + '零额度那一档是 tests/ux/agent-spend-full-auto.walk.mjs。')
}

const REAL_CATALOG = path.join(os.homedir(), 'Library', 'Application Support', 'Nomi', 'model-catalog.json')
const BRAIN_VENDOR = 'api-deepseek-com'
const BRAIN_MODEL = 'deepseek-chat'
const BRAIN_LABEL = 'DeepSeek Chat'
const PAID_VENDOR = 'apimart'
/** APIMart 图模型里最便宜的那一个（本条 lane 的付费上限 $1，两张图远在其内）。 */
const PAID_MODEL = 'z-image-turbo'

// 真人会点名模型（「用 XX 生成」），而这正好是本条 lane 要证的那条路：
// 模型把 `candidate{providerId,modelId}` 填进 `draft_shots` → 宿主按它花钱。
// 隔离副本里只发布了这一个图模型，所以点名的和能用的是同一个。
const ASK_PAID = '用 Z-Image Turbo 生成一张日出海面的图，16:9 横构图。'
const ASK_AUTO = 'Make one more image with Z-Image Turbo: the same sea at dusk, 16:9 wide shot.'

/** 隔离副本里装上真大脑 + 真生图供应商，并把夹具那个图模型摘掉（免得模型点到它，那条不花钱也出不了图）。 */
function seedRealVendors(settingsDir) {
  if (!fs.existsSync(REAL_CATALOG)) throw new Error(`真实 model-catalog.json 不存在（${REAL_CATALOG}）`)
  const source = JSON.parse(fs.readFileSync(REAL_CATALOG, 'utf8'))
  const file = path.join(settingsDir, 'model-catalog.json')
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'))
  const now = new Date().toISOString()
  const seeded = []
  const copyVendor = (vendorKey) => {
    const vendor = source.vendors.find((entry) => entry.key === vendorKey)
    const credential = source.apiKeysByVendor?.[vendorKey]
    if (!vendor) throw new Error(`真实目录里没有 ${vendorKey} 这家供应商`)
    if (credential?.enc !== 'safeStorage') throw new Error(`${vendorKey} 的凭据不是 safeStorage 密文——明文 key 本仓 fail-closed`)
    catalog.vendors.push({ ...vendor, enabled: true })
    catalog.apiKeysByVendor[vendorKey] = credential
  }
  // 大脑：真实目录里只有这家供应商与它的密钥，对话模型那一行是**合成**的（与 `agent-spend-r30.mjs` 同法）。
  copyVendor(BRAIN_VENDOR)
  catalog.models.push({
    vendorKey: BRAIN_VENDOR, modelKey: BRAIN_MODEL, labelZh: BRAIN_LABEL,
    kind: 'text', published: true, enabled: true, createdAt: now, updatedAt: now,
  })
  seeded.push(`${BRAIN_VENDOR}/${BRAIN_MODEL}`)
  // 生图：这一行必须**原样抄**真实目录（archetype / pricing / meta 决定请求形状和卡上的价）。
  copyVendor(PAID_VENDOR)
  const paidModel = source.models.find((entry) => entry.vendorKey === PAID_VENDOR && entry.modelKey === PAID_MODEL)
  if (!paidModel) throw new Error(`真实目录里没有 ${PAID_VENDOR}/${PAID_MODEL}`)
  // 目录价：**走查夹具数据，不是供应商报价的事实来源**（与 `agent-runtime-fixture.mjs` 的 0.30 同性质）。
  // 非有不可：付费闸的不变量是「价钱不知道就不许授权花钱」（`useAgentPanelSpendConfirm`：
  // `Cannot authorize paid generation without a known price`），而这台机器的 APIMart 目录行
  // 一条价都没填——用户在设置里没填过。少了它，卡上那颗「仍要生成」按下去必然被闸拒，
  // 真实花钱这条腿根本走不到。真正扣多少钱由 APIMart 按它自己的价目表算，与这里的数字无关。
  catalog.models.push({
    ...paidModel, published: true, enabled: true, createdAt: now, updatedAt: now,
    pricing: { cost: 0.1, enabled: true },
  })
  seeded.push(`${PAID_VENDOR}/${PAID_MODEL}`)
  // 真实目录里 APIMart 的任务映射（怎么发请求、怎么读回图）——没有它这家就只是个名字。
  const mappings = source.mappings.filter((entry) => entry.vendorKey === PAID_VENDOR && entry.modelKey === PAID_MODEL)
  if (mappings.length === 0) throw new Error(`真实目录里没有 ${PAID_VENDOR}/${PAID_MODEL} 的任务映射`)
  catalog.mappings.push(...mappings.map((entry) => ({ ...entry, enabled: true })))
  // 夹具那个图模型收起来：这一场里「哪个模型花钱」必须只有一个答案。
  for (const model of catalog.models) if (model.kind === 'image' && model.vendorKey !== PAID_VENDOR) model.published = false
  fs.writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`)
  return seeded
}

/**
 * 画布上这个项目现在有几张**真的出了图**的节点——按落盘产物 `result.url` 算，不按节点存在算。
 * 草稿节点建起来是免费副作用（`draft_shots` 就会建），只有 `result.url` 才证明供应商真的回了一张图。
 */
async function renderedShots(win, projectId) {
  const nodes = (await readProject(win, projectId)).payload.generationCanvas.nodes ?? []
  return nodes.filter((node) => typeof node?.result?.url === 'string' && node.result.url.length > 0).length
}

const walk = await createRuntimeWalk('spend-real-image')
const seeded = seedRealVendors(path.join(walk.report.tempRoot, 'settings'))
console.log(`[paid] 隔离副本装了：${seeded.join(' · ')}`)
let failure
try {
  const { win } = await walk.start({ first: true })
  // 宿主拒绝时那句**原话**只进 console（`useAgentPanelSpendConfirm` 的 `[spend-confirm] host refused`）；
  // 面板上只留一句给用户看的人话。走查要能说清「为什么没出图」，就得同时收着这两路。
  const consoleLines = []
  win.on('console', (message) => { consoleLines.push(`${message.type()}: ${message.text()}`.slice(0, 400)) })
  const { projectId } = await walk.newProject()
  await openCanvas(win)
  await chooseAssistantModel(win, BRAIN_LABEL, CANVAS_PANEL)

  // ═══ ① 「只问花钱」档（默认 safe-auto）：卡必须出来，点了才花钱 ═══
  await sendCanvas(win, ASK_PAID)
  const CARD_ANNOUNCEMENT = 'priced confirmation card in Nomi'
  const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  await expect(card, '「只问花钱」档下，真模型点名一个真模型之后，报价卡必须出现在槽里')
    .toBeVisible({ timeout: 180_000 })
  await walk.snap('paid-01-zh-spend-card-before-confirm')
  // 按下去之前先在真实 DOM 上架一个通知观察者：宿主要是拒了，它只会用一条活 6 秒的 toast 说话，
  // 去 locator 上现断言跟它的自动消失赛跑（与 `agent-spend-confirm-executes.walk.mjs` 同一手法）。
  await win.evaluate(() => {
    window.__nomiToastLog = []
    const record = () => {
      for (const node of document.querySelectorAll('[class*="mantine-Notification-root"]')) {
        const text = (node.textContent ?? '').trim()
        if (text && !window.__nomiToastLog.includes(text)) window.__nomiToastLog.push(text)
      }
    }
    record()
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true })
  })
  // `noWaitAfter`：这一下会触发主进程的落地链，默认的「等页面稳下来」会和它拉锯。
  await clickOrFail(card.locator(INTERVENTION_CONFIRM), '报价卡上那颗主按钮', { noWaitAfter: true })
  try {
    await expect.poll(() => renderedShots(win, projectId), { timeout: 180_000 }).toBeGreaterThanOrEqual(1)
  } catch (error) {
    const spoken = (await win.evaluate(() => window.__nomiToastLog ?? [])).join(' | ')
    const refused = consoleLines.filter((line) => line.includes('spend-confirm') || line.includes('refused') || line.includes('capab'))
    throw new Error(`点了确认之后图没出来。\n面板对用户说：${spoken || '（一个字都没说——那本身就是 bug）'}`
      + `\n宿主原话：${refused.join(' | ') || '（console 里也没有）'}\n${error}`)
  }
  await walk.snap('paid-02-zh-image-really-arrived')
  expect(walk.report.paidCalls >= 0, '付费调用计数存在').toBe(true)

  // ═══ 界面切成 English（真人走法：设置 → 通用 → English）═══
  await clickOrFail(win.getByRole('button', { name: /^(设置|Settings)$/ }).first(), '顶栏「设置」按钮')
  await clickOrFail(win.locator('[data-settings-tab-id="general"]'), '设置导航「通用」')
  await clickOrFail(win.locator('[data-settings-locale="en"]'), '语言分段控件「English」')
  await expect(win.locator('[data-settings-locale="en"][aria-pressed="true"]'), '界面已切到 English').toBeVisible()
  await clickOrFail(win.locator('[data-settings-close]'), '设置对话框「关闭」按钮')

  // ═══ ② 「全自动」档：同一件事，一张卡都不出，图照样出来 ═══
  await clickOrFail(win.locator(`${CANVAS_PANEL} ${COMPOSER_PERMISSION}`), 'permission tier picker')
  await expect(win.locator(`${CANVAS_PANEL} ${PERMISSION_POPOVER}`)).toBeVisible()
  await clickOrFail(win.locator(`${CANVAS_PANEL} ${permissionTier('project')}`), 'switch to full-auto')
  const switchCard = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="approval-reversible"]`)
  await expect(switchCard, 'switching tiers still asks once — that click is the authorisation').toBeVisible()
  await clickOrFail(switchCard.locator(INTERVENTION_CONFIRM), 'confirm full-auto')

  const before = await renderedShots(win, projectId)
  await sendCanvas(win, ASK_AUTO)
  await expect.poll(() => renderedShots(win, projectId), { timeout: 180_000 }).toBeGreaterThan(before)
  await expect(card, 'full-auto: no priced card may appear — the tier answered it').toHaveCount(0)
  // 图已经落盘 = 这一轮的活干完了，不再去等 composer 的「运行中」相：那一相在图出来之前就退了，
  // 等它只会等到一条自己造的红（2026-09-18 实测过一次）。
  await walk.snap('paid-03-en-full-auto-no-card-image-arrived')
  // 回执必须说「档位替你答了、已经在跑」，不能说「有张卡在等你」（T-ED-02 修的正是这一句）。
  // 判据按**条数**算，不按有没有：① 那一腿留下的那条公告仍然在对话流里（它当时是真的），
  // 全自动这一腿**不许再添一条**。这样既钉住了「不许说假话」，又不会被历史记录搅浑。
  await expect(win.locator(`${CANVAS_PANEL} ${V4_FLOW} [data-v4-block="errorbar"]`)
    .filter({ hasText: CARD_ANNOUNCEMENT }),
  'full-auto must not announce a card: the tier answered this spend, nothing is waiting for the user')
    .toHaveCount(1)

  walk.report.verified = ['safe-auto-card-then-real-image', 'full-auto-no-card-still-real-image']
  walk.report.seededVendors = seeded
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
