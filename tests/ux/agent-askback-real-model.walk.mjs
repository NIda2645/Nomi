#!/usr/bin/env node
// 「模型该不该先问一句」——**真模型、真应用、真素材**的整机走查（R13 第三档）。
//
// ── 它补的是哪一格 ──
//
// 2026-09-21 实测（`scratchpad/investigate-askback.md` §3.3）：16 句该反问的话，**反问卡触发 0/16**。
// 那次是真机跑出来的，但剧本没进仓库，于是「模型现在会不会问」在每一次提示词/工具面改动之后
// 都得靠人重跑一遍手工操作。这个文件把那次走查落成可重跑的脚本，**句子逐字照抄那 16 句**——
// 换一批句子再报一个好看的数字是自欺。
//
// ── 四件真实（R13，缺一条这条测试不成立）──
//
//   ① 真实应用    真 Electron（`launchNomiApp`），渲染层 / IPC / AgentLane / pi SDK / 落盘全走生产路径；
//   ② 真实页面输入 文稿敲进编辑器、指令打进 composer、模型从下拉里选、素材从素材库的文件选择器导入；
//   ③ 真实工具轨迹 工具调用从磁盘上的 lane transcript 读（`.nomi/agent-sessions/*.jsonl`），
//                 **不信 Agent 的自述**——它说「我问问你」和它真的调了 `ask_user` 是两件事；
//   ④ 真实素材    A11 那句「用素材库那张图做参考」要求库里真有一张图，取自登记表的 4K HEVC 抽帧。
//
// ── 它量五个数（这五个就是 PR 正文要写的）──
//
//   该问时问了       shouldAsk=true 的轮次里，真的调了 ask_user 的比例（对照：修复前 0/10）
//   不该问时没问     shouldAsk=false 的轮次里，**没有**调 ask_user 的比例（误问率的反面）
//   选项质量         2–4 个、互不重复、至多一个 recommended、没有「其它/让我说说」这种假选项
//   工具参数写对率   这一轮没有任何一次工具调用因为参数被拒
//   答后回合成功率   答完那张卡之后，这一轮有没有真的继续下去（而不是原地停住）
//
// ── 跑法（要花钱：真模型，18 轮对话，DeepSeek 便宜档约 ¥0.x）──
//
//   pnpm run build
//   export NOMI_REAL_MEDIA_DIR="/Users/aoqimin/Desktop/视频/"
//   node tests/ux/agent-askback-real-model.walk.mjs [--rounds 18] [--model "DeepSeek V3.2"] [--label run1]
import { stationTimeout } from './_station-budget.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'

import { closeNomiApp, launchNomiApp } from './_launchApp.mjs'
import { requireRealMediaAssets } from './fixtures/realMedia.mjs'
import { laneMessages, readLaneTranscripts } from './agent-lane-observer.mjs'
// 判据与它的阳性对照住 `askback-option-judges.mjs` / `.test.mjs`：一把尺子只能有一个家，
// 而且它得能在不起 App、不花额度的情况下被喂夹具（用户看到的那张卡就是那份夹具）。
import { asksPermissionForReversible, judgeAskOptions } from './askback-option-judges.mjs'
// 轨迹（每次调用的入参/返回/校验错误原文/第几次重试）落 JSONL：用户 2026-09-21 点名
// 「里面经常有重试、参数出错，这些轨迹都对我们后续优化有帮助」。
import { writeTrajectories } from './askback-trajectory.mjs'
import {
  CANVAS_PANEL, COMPOSER, COMPOSER_INPUT, COMPOSER_SEND, CREATION_PANEL, DOCUMENT, HISTORY_BUTTON,
  MODEL_POPOVER, COMPOSER_MODEL, THREAD_MENU, escapeForRegExp, expandResidentPanel,
} from './agent-runtime-walk-support.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const { values } = parseArgs({ options: {
  rounds: { type: 'string' }, model: { type: 'string' }, 'output-dir': { type: 'string' }, label: { type: 'string' },
} })

const CASES = JSON.parse(fs.readFileSync(path.join(here, 'agent-askback-real-model.cases.json'), 'utf8'))
const ROUNDS = Number(values.rounds || CASES.cases.length)
const MODEL_LABEL = values.model || 'DeepSeek V3.2'
const LABEL = values.label || 'run'
const outputDir = path.resolve(repoRoot, values['output-dir'] || `tests/ux/shots/askback-real-model/${LABEL}`)
fs.mkdirSync(outputDir, { recursive: true })

const ASK_TOOL = 'ask_user'
const ARG_REJECTED = /Validation failed for tool|capability_input_invalid|generation_input_invalid|Unrecognized key\(s\)|must be (array|string|number|object)|Required/i

// ── ④ 真实素材 ────────────────────────────────────────────────────────────
const { assets } = requireRealMediaAssets(['video-4k-hevc-10bit', 'image-4k-png'])
const sourceVideo = assets.get('video-4k-hevc-10bit').file
const derivedSpec = assets.get('image-4k-png').spec
const mediaTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'askback-real-media-'))
const referenceImage = path.join(mediaTmp, 'reference-4k.png')
execFileSync(ffmpeg.path, ['-y', '-ss', '00:00:05', '-i', sourceVideo, '-frames:v', '1', referenceImage], { stdio: 'pipe' })
const referenceBytes = fs.statSync(referenceImage).size
if (referenceBytes < derivedSpec.minBytes) {
  throw new Error(`抽出来的参考帧只有 ${referenceBytes} 字节，登记表 image-4k-png 要求 ≥${derivedSpec.minBytes}`)
}

// ── ① 真实应用：隔离 profile + 本机真实 catalog（真模型、真 key；项目与浏览器状态全隔离）。
const { prepareIsolation } = await import(path.join(repoRoot, 'evals/lib/isoApp.mjs'))
const isoDir = path.join(os.tmpdir(), `askback-real-model-${Date.now()}`)
const iso = prepareIsolation(isoDir)

const report = {
  label: LABEL, model: MODEL_LABEL, rounds: ROUNDS,
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  baseline: '2026-09-21 修复前同样这 16 句：反问卡触发 0/16（scratchpad/investigate-askback.md §3.3）',
  startedAt: new Date().toISOString(), cases: [],
}

/** 这一轮的工具轨迹：从磁盘上的 lane transcript 读，不信面板文字、不信 Agent 自述。 */
function readRoundTrajectory(projectDir, seenToolCallIds, seenResultIds) {
  const calls = []
  const results = []
  for (const session of readLaneTranscripts(projectDir)) {
    for (const message of laneMessages(session)) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part?.type !== 'toolCall' || seenToolCallIds.has(part.id)) continue
          seenToolCallIds.add(part.id)
          calls.push({ id: part.id, name: part.name, args: part.arguments })
        }
      } else if (message.role === 'toolResult') {
        if (seenResultIds.has(message.toolCallId)) continue
        seenResultIds.add(message.toolCallId)
        const text = (Array.isArray(message.content) ? message.content : [])
          .filter((part) => part?.type === 'text').map((part) => part.text).join('\n')
        results.push({ id: message.toolCallId, name: message.toolName, isError: message.isError === true, text })
      }
    }
  }
  return { calls, results }
}

let app, win, failure
try {
  ;({ app, win } = await launchNomiApp({ name: 'askback-real-model', userDataDir: iso.chromiumDir,
    projectsDir: iso.projectsDir, settingsDir: iso.settingsDir, capabilityDir: iso.capabilityDir }))
  const { dismissSplashIfPresent, createBlankProject } = await import(path.join(repoRoot, 'evals/lib/isoApp.mjs'))
  await dismissSplashIfPresent(win)
  const projectDir = await createBlankProject(win, iso.projectsDir)
  report.projectDir = projectDir

  const consent = win.getByRole('button', { name: '不分享', exact: true }).first()
  if (await consent.count()) { await consent.click({ timeout: stationTimeout({ operations: 2 }) }); await win.waitForTimeout(600) }

  // ② 真实页面输入 · 导入真实素材（A11 那句话要求库里真有一张图）
  await win.getByRole('button', { name: '生成', exact: true }).first().click({ timeout: stationTimeout({ operations: 2 }) })
  await win.waitForTimeout(2000)
  await win.getByRole('button', { name: '素材库', exact: true }).first().click({ timeout: stationTimeout({ operations: 2 }) })
  const uploadInput = win.locator('section[aria-label="素材库"] input[type="file"]').first()
  await uploadInput.waitFor({ state: 'attached', timeout: stationTimeout({ operations: 2 }) })
  await uploadInput.setInputFiles(referenceImage)
  const importDeadline = Date.now() + stationTimeout({ operations: 8 })
  let importedAssets = 0
  while (Date.now() < importDeadline) {
    const dir = path.join(projectDir, 'assets')
    importedAssets = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0
    if (importedAssets > 0) break
    await win.waitForTimeout(1000)
  }
  report.importedAssets = importedAssets
  if (importedAssets === 0) throw new Error('真实素材导入没落盘——A11 那一轮就不成立了')
  const closeLibrary = win.locator('section[aria-label="素材库"] button[aria-label*="关闭"]').first()
  if (await closeLibrary.count()) await closeLibrary.click({ timeout: stationTimeout({ operations: 1 }) }).catch(() => {})

  // ② 真实页面输入 · 文稿敲进编辑器
  await win.getByRole('button', { name: '创作', exact: true }).first().click({ timeout: stationTimeout({ operations: 2 }) })
  await win.waitForTimeout(1200)
  const doc = win.locator(DOCUMENT)
  await doc.waitFor({ state: 'visible', timeout: stationTimeout({ operations: 2 }) })
  await doc.fill(CASES.script)

  // ② 真实页面输入 · 模型从下拉里选（两个面各选一次：面板是分面的）
  async function pickModelOn(panel) {
    await expandResidentPanel(win)
    await win.locator(`${panel} ${COMPOSER_MODEL}`).click({ timeout: stationTimeout({ operations: 2 }) })
    await win.locator(`${panel} ${MODEL_POPOVER} [data-v4-model-row]`).first().locator('button').first()
      .click({ timeout: stationTimeout({ operations: 2 }) })
    const option = win.locator('[data-nomi-select-dropdown] [data-nomi-select-option-label]')
      .filter({ hasText: new RegExp(escapeForRegExp(MODEL_LABEL)) }).first()
    await option.click({ timeout: stationTimeout({ operations: 2 }) })
    await win.waitForTimeout(800)
  }
  await pickModelOn(CREATION_PANEL)
  await win.getByRole('button', { name: '生成', exact: true }).first().click({ timeout: stationTimeout({ operations: 2 }) })
  await win.waitForTimeout(1500)
  await pickModelOn(CANVAS_PANEL)

  /** 面板被模态挡住时解除；解除不了就明说（别让 30s 超时冒充产品结论）。 */
  async function ensureComposerUsable(panel) {
    const input = win.locator(`${panel} ${COMPOSER_INPUT}`)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const usable = await input.click({ trial: true, timeout: 3_000 }).then(() => true).catch(() => false)
      if (usable) return attempt
      await win.keyboard.press('Escape')
      await win.waitForTimeout(800)
    }
    return -1
  }

  const seenToolCallIds = new Set()
  const seenResultIds = new Set()
  let answeredOnce = false
  for (const item of CASES.cases.slice(0, ROUNDS)) {
    const panel = item.surface === 'creation' ? CREATION_PANEL : CANVAS_PANEL
    const row = { id: item.id, kind: item.kind, shouldAsk: item.shouldAsk, surface: item.surface, text: item.text }
    const started = Date.now()
    try {
      await win.getByRole('button', { name: item.surface === 'creation' ? '创作' : '生成', exact: true })
        .first().click({ timeout: stationTimeout({ operations: 2 }) })
      await win.waitForTimeout(1200)
      row.unblockedByEscape = await ensureComposerUsable(panel)
      if (row.unblockedByEscape === -1) throw new Error('这一轮开始前 composer 就不可用——仪器故障，不是产品结论')
      // 每一轮都是**新对话**：量的是「这句话单独说出来时它会怎么做」。
      await win.locator(`${panel} ${HISTORY_BUTTON}`).click({ timeout: stationTimeout({ operations: 2 }) })
      await win.locator(THREAD_MENU).getByRole('button', { name: '新对话', exact: true })
        .click({ timeout: stationTimeout({ operations: 2 }) })
      await win.waitForTimeout(500)
      const input = win.locator(`${panel} ${COMPOSER_INPUT}`)
      await input.waitFor({ state: 'visible', timeout: stationTimeout({ operations: 2 }) })
      await input.fill(item.text)
      await win.locator(`${panel} ${COMPOSER_SEND}`).click({ timeout: stationTimeout({ operations: 2 }) })
      const running = win.locator(`${panel} ${COMPOSER}[data-mode="running"]`)
      await running.waitFor({ state: 'visible', timeout: stationTimeout({ operations: 2 }) }).catch(() => {})

      // 有卡在等人的时候回合是**停着**的（审批闸在等），`running` 不会自己消失——所以这里像真人一样：
      // 看到卡就答，答完接着等，直到这一轮真的走完。run3 作废的原因正是没答卡：第一张卡之后 15 句全压在它后面。
      //   · 提问卡 → 点第一颗选项（没有选项就在卡上打一句）。**每一张都答**，不再「只答第一张、其余按停」——
      //     按停量不到「答完之后它走不走得下去」，而 2026-09-22 起同一回合里可能连着问两次；
      //   · 报价卡 → ×。真人不想花钱时就是这么做的；这条走查量的是「问不问」，不是出片，整场零生成额度。
      const questionCard = win.locator(`${panel} [data-v4-block="intervention"][data-kind="question"]`)
      const spendCard = win.locator(`${panel} [data-v4-block="intervention"][data-kind="spend"]`)
      const deadline = Date.now() + stationTimeout({ turns: 3 })
      let sawCard = false
      row.cardsAnswered = []
      while (Date.now() < deadline) {
        if (await questionCard.count() > 0) {
          if (!sawCard) await win.screenshot({ path: path.join(outputDir, `${item.id}-question-card.png`) }).catch(() => {})
          sawCard = true
          // 一张卡 1–3 题：单选点了自己往下走（480ms），多选 / 自己打字要按「继续 / 发送」。像人一样：
          // 能点的选项就点第一颗，「继续」亮着就按它；哪一下没点到不算仪器故障（卡可能正在翻题），下一圈再看。
          const tap = { timeout: stationTimeout({ operations: 1 }) }
          // 多题卡里**每一题都在 DOM 里**，只有 `data-active="true"` 的那一题点得动；`.first()` 不限定它，
          // 翻到第 2 题之后就会一直去点第 1 题那颗已经滑走的选项（run4 第三次起跑在 1/3 上卡了十几分钟）。
          const chip = questionCard.locator('[data-ask-question][data-active="true"] [data-v4-control="question-option"]').first()
          const proceed = questionCard.locator('[data-v4-control="ask-continue"]').first()
          // 先数再问：`isEnabled()` 会**等**元素出现，这一题一颗选项都没有时（卡上永远有自由输入那一行，
          // 选项却可以是零个）它要白等满一个默认动作超时才轮得到下面的打字支。
          const chipCount = await chip.count()
          // 「继续 / 发送」未作答时置灰走的是原生 `disabled`（`WorkbenchButton` 把 `disabled` 直接透给 `<button>`，
          // 见 src/design/actions.tsx），而 Playwright 1.60 的 `isEnabled()` = 原生 disabled ∪ aria-disabled 都算禁用，
          // 所以问它比自己写属性选择器稳：设计系统哪天把置灰换成 aria-disabled，这里也不用跟着改。
          if (await proceed.isEnabled().catch(() => false)) {
            await proceed.click(tap).then(() => row.cardsAnswered.push('question:continue')).catch(() => {})
          } else if (chipCount > 0 && await chip.isEnabled().catch(() => false)) {
            await chip.click(tap).then(() => row.cardsAnswered.push('question:chip')).catch(() => {})
          } else {
            const own = questionCard.locator('[data-ask-question][data-active="true"] [data-v4-control="question-answer"]').first()
            await own.fill('你定就好，按最稳妥的来').catch(() => {})
            await own.press('Enter').then(() => row.cardsAnswered.push('question:typed')).catch(() => {})
          }
          row.answeredByChip = true
          answeredOnce = true
          await win.waitForTimeout(1500)
          continue
        }
        if (await spendCard.count() > 0) {
          await win.screenshot({ path: path.join(outputDir, `${item.id}-spend-card.png`) }).catch(() => {})
          const confirmReject = spendCard.locator('[data-v4-control="confirm-reject"]')
          if (!await confirmReject.isVisible().catch(() => false)) await spendCard.locator('[data-v4-control="slot-dismiss"]').click({ timeout: stationTimeout({ operations: 2 }) }).catch(() => {})
          if (await confirmReject.isVisible().catch(() => false)) await confirmReject.click({ timeout: stationTimeout({ operations: 2 }) }).catch(() => {})
          row.cardsAnswered.push('spend:declined')
          await win.waitForTimeout(1500)
          continue
        }
        // 文稿方案的 `generate` 走的是分镜编辑器**原来那一套**花钱确认（一个居中的确认框 / 批量预览条），不是介入槽里的卡。
        // 2026-09-22 起这次等待不再受工具超时管——没人答它，回合就一直等着（run4 第四次起跑在这里等了十几分钟）。
        // 真人不想花钱时点「取消」；走查照做。
        const dialogCancel = win.locator('[data-confirm-dialog-cancel="true"]').first()
        const batchCancel = win.locator('[data-batch-plan-overlay] button').filter({ hasText: /取消|Cancel/ }).first()
        if (await dialogCancel.isVisible().catch(() => false)) {
          await win.screenshot({ path: path.join(outputDir, `${item.id}-editor-confirm.png`) }).catch(() => {})
          await dialogCancel.click({ timeout: stationTimeout({ operations: 1 }) }).then(() => row.cardsAnswered.push('editor-confirm:cancelled')).catch(() => {})
          await win.waitForTimeout(1500)
          continue
        }
        if (await batchCancel.isVisible().catch(() => false)) {
          await win.screenshot({ path: path.join(outputDir, `${item.id}-batch-preview.png`) }).catch(() => {})
          await batchCancel.click({ timeout: stationTimeout({ operations: 1 }) }).then(() => row.cardsAnswered.push('batch-preview:cancelled')).catch(() => {})
          await win.waitForTimeout(1500)
          continue
        }
        if (!await running.isVisible().catch(() => false)) break
        await win.waitForTimeout(1000)
      }
      row.questionCardVisible = sawCard
      // 判据写成**正向的**：「composer 回到 idle」——这一轮走完了、输入框还回来了。
      row.turnContinuedAfterAnswer = row.cardsAnswered.length > 0
        ? await win.locator(`${panel} ${COMPOSER}[data-mode="idle"]`).isVisible().catch(() => false) : undefined
      if (row.cardsAnswered.length > 0) await win.screenshot({ path: path.join(outputDir, `${item.id}-after-answer.png`) }).catch(() => {})
      await running.waitFor({ state: 'hidden', timeout: stationTimeout({ turns: 1 }) }).catch(() => {})
      await win.waitForTimeout(1200)
    } catch (roundError) {
      row.roundError = roundError.message
    }
    const { calls, results } = readRoundTrajectory(projectDir, seenToolCallIds, seenResultIds)
    row.ms = Date.now() - started
    row.toolCalls = calls.map((call) => call.name)
    row.firstTool = calls[0]?.name ?? null
    const askCalls = calls.filter((call) => call.name === ASK_TOOL)
    row.askedUser = askCalls.length > 0
    row.askCount = askCalls.length
    row.askArgs = askCalls.map((call) => call.args)
    row.optionQuality = askCalls.map((call) => judgeAskOptions(call.args))
    row.correct = row.askedUser === item.shouldAsk
    // ① 为一个**可撤销**的动作问「要不要」。判据：题目是征询许可的句式，而选项里
    //    没有两个真候选（真的指代不明时选项就是候选本身，题目不会是「要不要」）。
    row.askedForReversibleConfirmation = askCalls.some((call) => asksPermissionForReversible(call.args))
    row.rejectedArgs = results.filter((result) => ARG_REJECTED.test(result.text)).map((result) => result.name)
    row.argsOkFirstTry = calls.length > 0 && row.rejectedArgs.length === 0
    report.cases.push(row)
    console.log(`${item.id} shouldAsk=${item.shouldAsk} asked=${row.askedUser} card=${row.questionCardVisible === true} tools=[${row.toolCalls.join(',')}] ${row.ms}ms`)
    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  }

  const count = (predicate) => report.cases.filter(predicate).length
  const should = report.cases.filter((c) => c.shouldAsk)
  const shouldNot = report.cases.filter((c) => !c.shouldAsk)
  const allQualities = report.cases.flatMap((c) => c.optionQuality ?? [])
  report.summary = {
    rounds: report.cases.length,
    askedWhenShould: `${should.filter((c) => c.askedUser).length}/${should.length}`,
    didNotAskWhenShouldNot: `${shouldNot.filter((c) => !c.askedUser).length}/${shouldNot.length}`,
    questionCardRendered: `${count((c) => c.questionCardVisible === true)}/${report.cases.length}`,
    optionSets: allQualities.length,
    optionsInRange: `${allQualities.filter((q) => q.inRange).length}/${allQualities.length}`,
    optionsDistinct: `${allQualities.filter((q) => q.distinct).length}/${allQualities.length}`,
    atMostOneRecommended: `${allQualities.filter((q) => q.atMostOneRecommended).length}/${allQualities.length}`,
    fakeOptionSets: allQualities.filter((q) => q.fakeOptions.length > 0).length,
    // 09-21 用户点名的五条，各算一次失败
    askedForReversibleConfirmation: `${report.cases.filter((c) => c.askedForReversibleConfirmation).length}/${report.cases.filter((c) => c.askedUser).length}`,
    yesNoNestingSets: allQualities.filter((q) => q.yesNoNesting.length > 0).length,
    cancelOptionSets: allQualities.filter((q) => q.cancelOptions.length > 0).length,
    internalIdentifierSets: allQualities.filter((q) => q.internalIdentifiers.length > 0).length,
    labelTooLongSets: allQualities.filter((q) => q.labelsTooLong.length > 0).length,
    questionEchoSets: allQualities.filter((q) => q.questionEchoes.length > 0).length,
    argsOkFirstTry: `${count((c) => c.argsOkFirstTry)}/${report.cases.length}`,
    askToolArgsRejected: count((c) => (c.rejectedArgs ?? []).includes(ASK_TOOL)),
    answeredTurnContinued: report.cases.filter((c) => c.answeredByChip).map((c) => `${c.id}:${c.turnContinuedAfterAnswer}`),
    roundErrors: count((c) => c.roundError),
  }
  console.log('SUMMARY', JSON.stringify(report.summary))
} catch (error) {
  failure = error
  process.exitCode = 1
  report.error = error instanceof Error ? error.stack : String(error)
  if (win) await win.screenshot({ path: path.join(outputDir, 'failure.png') }).catch(() => {})
} finally {
  report.endedAt = new Date().toISOString()
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`report → ${pathToFileURL(path.join(outputDir, 'report.json')).href}`)
  if (app) await closeNomiApp(app).catch(() => {})
  if (report.projectDir && fs.existsSync(report.projectDir)) {
    // 轨迹先写：它要读隔离目录里那份 transcript，而这个目录马上就要被删掉。
    try {
      report.trajectories = writeTrajectories(outputDir, report, report.projectDir)
      console.log('trajectories →', path.join(outputDir, 'trajectories'))
    } catch (trajectoryError) {
      // 轨迹写不出来是**仪器**的问题，不该把整轮评测的数字一起判死；如实记进报告。
      report.trajectoryError = trajectoryError instanceof Error ? trajectoryError.message : String(trajectoryError)
    }
    const evidence = path.join(outputDir, 'evidence')
    fs.rmSync(evidence, { recursive: true, force: true })
    fs.mkdirSync(evidence, { recursive: true })
    for (const relative of ['.nomi/agent-sessions', '.nomi/project.json']) {
      const source = path.join(report.projectDir, relative)
      if (fs.existsSync(source)) fs.cpSync(source, path.join(evidence, path.basename(relative)), { recursive: true })
    }
  }
  fs.rmSync(mediaTmp, { recursive: true, force: true })
  fs.rmSync(isoDir, { recursive: true, force: true })
  if (failure) console.error(failure)
}
