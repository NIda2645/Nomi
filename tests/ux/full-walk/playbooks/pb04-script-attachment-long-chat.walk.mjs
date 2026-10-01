#!/usr/bin/env node
// 剧本 PB04 · 「给 Agent 传一个 txt 剧本，然后跟它来回改好几轮」
//
// 已知问题（0.22.1）：给 Agent 传 txt 附件，发出后附件没了，Agent 也没读。
// 已知问题（0.22.3）：Agent 一回合输入 token 到几十万（读剧本 + 写剧本来回），撞上下文窗口直接失败。
//
// 真实创作者会做的事：
//   A. 在 Agent 输入框点「+」挂上自己的剧本 txt，问它「一共几场」；
//   B. 回到创作页，让它把剧本扩写进文稿，再一场一场地收紧（每一场都是：读全文 → 改 → 写回），来回几轮。
// 乱用：一回合里让它连着改两场（这正是真实模型会做的：读、写、再读、再写）。
//
// 大脑怎么说话（照真模型）：请求里真的有剧本内容，它就照着答；没有，它就说「没看到附件内容」。
// 铁律 8 的用量来自夹具按**真实请求内容**报回的 usage（中文每字约 1 token），监视器从 Agent 转录里读。
import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from '../../_assert.mjs'
import { stationTimeout } from '../../_station-budget.mjs'
import { flattenRequestText } from '../../agent-runtime-fixture.mjs'
import {
  CANVAS_PANEL, COMPOSER, COMPOSER_ADD_FILE, COMPOSER_CHIP, CREATION_PANEL, expandResidentPanel, sendCanvas, sendCreation,
} from '../../agent-runtime-walk-support.mjs'
import { scriptTurn } from '../brain.mjs'
import { startPlaybook } from '../launch.mjs'
import { laneMessages, readLaneTranscripts } from '../../agent-lane-observer.mjs'

const pb = await startPlaybook({
  id: 'pb04-script-attachment-long-chat',
  needs: ['loopbackProvider', 'fixtureTextModel'],
  seed: () => ({ nodes: [], groups: [], edges: [] }),
  // 给夹具一个真实的上下文窗口（NOMI_PB04_CONTEXT_LIMIT）：超了就回 400「超出窗口」，复现用户反馈的那条路。缺省不设（与以往逐字相同）。
  ...(process.env.NOMI_PB04_CONTEXT_LIMIT ? { fixtureOptions: { contextLimitTokens: Number(process.env.NOMI_PB04_CONTEXT_LIMIT) } } : {}),
})
const { smoke, fixture, monitor, outputDir } = pb
const EN = pb.locale === 'en'
const win = () => smoke.win
const ROUNDS = Number(process.env.NOMI_FULL_WALK_PB04_ROUNDS || 3)

// ── 用户自己的剧本文件（一句暗号行，用来判「模型到底收没收到内容」）─────────────────────
const MARKER = '【剧本暗号：海港清晨-4271】'
const scene = (index, lines) => [`第${index}场 · 海港`, ...Array.from({ length: lines }, (_, line) =>
  `${index}-${line + 1}　清晨的渔港，雾还没散。老渔民阿福把缆绳一圈圈绕在木桩上，远处的汽笛声压着浪头，他回头看了一眼空荡荡的码头，像是在等一个不会回来的人。`)].join('\n')
const SCRIPT_FILE = path.join(outputDir, '剧本-海港清晨.txt')
fs.writeFileSync(SCRIPT_FILE, [MARKER, scene(1, 12), scene(2, 12), scene(3, 12)].join('\n\n'))
const SCRIPT_NAME = path.basename(SCRIPT_FILE)
/** 大脑「扩写」出来的全文：三场，每场 60 行（约一万五千字——一份真实的短片剧本）。 */
const LONG_SCRIPT = [scene(1, 60), scene(2, 60), scene(3, 60)].join('\n\n')

let harnessError = null
try {
  await monitor.step('打开项目（从项目库）', () => smoke.openProject(), { surfaces: ['*'], critical: true })
  await monitor.step('展开 Agent 面板', () => expandResidentPanel(win()), { surfaces: ['agentPanel', 'rightPanel'] })

  // ── A：挂附件问一句 ────────────────────────────────────────────────────────────────
  await monitor.step('点「+」挂上剧本 txt', async () => {
    const chooser = win().waitForEvent('filechooser', { timeout: stationTimeout() })
    await clickOrFail(win().locator(`${CANVAS_PANEL} ${COMPOSER_ADD_FILE}`), '输入框的「+」（添加文件）')
    await (await chooser).setFiles(SCRIPT_FILE)
    await expect(win().locator(`${CANVAS_PANEL} ${COMPOSER} ${COMPOSER_CHIP}`).filter({ hasText: SCRIPT_NAME.slice(0, 6) }),
      '输入框里挂上了附件签').toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    // 上传是本机导入（落进项目素材），等它落定再发——真人也是看到签不转了才按发送。
    await expect.poll(() => fs.existsSync(path.join(smoke.project.projectRoot, 'assets')) && fs.readdirSync(path.join(smoke.project.projectRoot, 'assets'), { recursive: true })
      .some((name) => String(name).endsWith('.txt')), { message: '附件落进了项目素材', timeout: DEFAULT_TIMEOUT_MS }).toBe(true)
    // 后面每一步都建立在「附件挂上了」之上：它没成，读附件、长对话的证据都不可信（会把没导进来算成产品没发给模型），剧本就此停下。
  }, { surfaces: [], critical: true })

  const askTurn = scriptTurn(fixture, {
    label: 'pb04-attachment',
    marker: 'PB04-附件',
    steps: [{
      text: ({ body }) => (flattenRequestText(body).includes(MARKER)
        ? '读到了：一共三场，都在海港。'
        : '我没有看到附件的内容，能再发一次或者直接贴进来吗？'),
    }],
  })
  await monitor.step('用户：读一下我传的剧本，一共几场？', async () => {
    monitor.recordAttachment({ name: SCRIPT_NAME, marker: MARKER, userMarker: 'PB04-附件' })
    await sendCanvas(win(), 'PB04-附件：这是我的剧本，读一下，告诉我一共几场？')
  }, { surfaces: [] })
  await monitor.step('等 Agent 回答', async () => { await askTurn.done }, { user: false, surfaces: [] })

  // ── B：创作页里长对话 ──────────────────────────────────────────────────────────────
  await monitor.step('切到创作页', async () => {
    await clickOrFail(win().locator('.nomi-stepper__step[data-mode="creation"]').first(), '顶栏「创作」')
    await expect(win().locator(`${CREATION_PANEL} ${COMPOSER}`)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  }, { surfaces: ['workspaceMode', 'agentPanel', 'rightPanel', 'canvasViewport', 'storyboardTable'] })

  const writeTurn = scriptTurn(fixture, {
    label: 'pb04-write',
    marker: 'PB04-扩写',
    steps: [
      { name: 'write_script', args: { content: LONG_SCRIPT, where: 'end' } },
      { text: '扩写好了，写进了文稿末尾。' },
    ],
  })
  await monitor.step('用户：把剧本扩写成完整版写进文稿', () => sendCreation(win(), 'PB04-扩写：把海港这个剧本扩写成完整的三场，写进文稿。'), { surfaces: [] })
  await monitor.step('等扩写写进文稿', async () => { await writeTurn.done }, { user: false, surfaces: [] })

  for (let round = 1; round <= ROUNDS; round += 1) {
    const marker = `PB04-收紧${round}`
    const turn = scriptTurn(fixture, {
      label: `pb04-tighten-${round}`,
      marker,
      steps: [
        // 真模型改稿的样子：先读全文，改一场写回；再读一遍全文确认，再改下一场。
        { name: 'read_script', args: {} },
        { name: 'write_script', args: ({ previous }) => ({ content: `【第${round}轮收紧 · 前一半】\n${String(previous ?? '').slice(0, 6000)}`, where: 'end' }) },
        { name: 'read_script', args: {} },
        { name: 'write_script', args: ({ previous }) => ({ content: `【第${round}轮收紧 · 后一半】\n${String(previous ?? '').slice(-6000)}`, where: 'end' }) },
        { text: `第 ${round} 轮改好了。` },
      ],
    })
    await monitor.step(`用户：第 ${round} 轮，一场一场收紧`, () => sendCreation(win(), `${marker}：再把剧本收紧一点，先改前面，再改后面。`), { surfaces: [] })
    await monitor.step(`等第 ${round} 轮改完`, async () => {
      await Promise.race([
        turn.done,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`第 ${round} 轮在 ${stationTimeout({ turns: 1 })}ms 内没说完`)), stationTimeout({ turns: 1 }))),
      ])
    }, { user: false, surfaces: [] })
  }
  await monitor.settle('长对话收尾')
} catch (error) {
  harnessError = error
  console.error('[full-walk] pb04 故障：', error?.stack ?? error)
}
// 用户反馈的两句话在这一场里各出现了几次（从 Agent 转录读，关 App 之前）：
//   · 「Assistant request exceeded the context window」——模型请求被供应商以「超出上下文窗口」拒掉；
//   · 「这一步的结果没对上账，先别按已完成算」——写入回执没拿到结果（capability_receipt_unresolved）及其后「已有未完成操作」的连环拒绝。
await monitor.screenshot('final-panel').catch(() => undefined)
try {
  const evidence = { contextOverflowRequests: fixture.requests.filter((request) => request.contextOverflow).length, contextWindowErrors: 0, receiptUnresolved: 0, receiptBlocked: 0 }
  for (const session of readLaneTranscripts(smoke.project.projectRoot)) {
    for (const message of laneMessages(session)) {
      if (message.role === 'assistant' && message.stopReason === 'error' && /context (window|length)/i.test(String(message.errorMessage ?? ''))) evidence.contextWindowErrors += 1
      if (message.role === 'toolResult' && message.isError) {
        const text = (Array.isArray(message.content) ? message.content : []).map((part) => part?.text ?? '').join(' ')
        if (/capability_receipt_unresolved/.test(text)) evidence.receiptUnresolved += 1
        if (/unfinished operation/.test(text)) evidence.receiptBlocked += 1
      }
    }
  }
  fs.writeFileSync(path.join(outputDir, 'user-reports-evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(`[pb04-evidence] ${JSON.stringify(evidence)}`)
} catch (error) { console.error('[pb04-evidence] 没取到：', error?.message ?? error) }
process.exit(await pb.finish(harnessError))
