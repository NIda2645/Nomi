// 九条铁律的**监视器**（全功能走查的唯一一份）。剧本只管像用户一样操作；每一步收尾，监视器把九条铁律全核一遍。
//
// 三条纪律：
//   1. 违反不中断剧本：记下 `{铁律, 剧本, 步骤, 模块, 证据}` 继续走，跑完出汇总（用户要的是「水下的设计问题」的证据，
//      一条剧本红在第一处就停，后面的证据就永远拿不到）。
//   2. 证据只从真相源读：供应商收到了什么 = 夹具记账；后台状态 = 落盘的 Run / 项目 / Agent 转录；用户看见了什么 = DOM。
//      不灌 store、不直调桥去伪造状态（读桥只用 App 自己暴露给渲染层的只读口：项目读、待确认付费读）。
//   3. 上限和时限只从登记处读（invariants.mjs 的 loadLimits），读不到就报错。
//
// 剧本的操作与判据分开：剧本声明「这一步是用户动作、允许哪些面变化」「这一下是用户点头（范围是什么）」，
// 其余一律由监视器按铁律判。
import fs from 'node:fs'
import path from 'node:path'

import { expectNoCjkInEnglishDom, waitForVisualQuiescence } from '../_assert.mjs'
import { readProductionRuns } from '../_paidRun.mjs'
import {
  FIXTURE_API_KEY, FIXTURE_API_KEY_B, FIXTURE_APIMART_API_KEY, FIXTURE_APIMART_VENDOR, FIXTURE_IMAGE_MODEL_B_LABEL,
  FIXTURE_IMAGE_MODEL_LABEL, FIXTURE_IMAGE_VENDOR_B, FIXTURE_TEXT_MODEL_LABEL, FIXTURE_VENDOR,
} from '../agent-runtime-fixture.mjs'
import { laneMessages, readLaneTranscripts } from '../agent-lane-observer.mjs'
import { appFramesOf, classifyEgress, REQUIRED_GUARD_LAYERS, vendorHostsOf } from './egress.mjs'
import { INVARIANTS, invariantById, loadDictionaries, loadLimits, UI_LOCALES, uiText, uiTextPattern } from './invariants.mjs'
import { ensurePageProbe, readPageProbe } from './pageProbe.mjs'
import { DESIGN_ROOTS, rootOfRule } from './rules.mjs'

/** 夹具模型的显示名（只有中文 labelZh）：EN 界面上看到它们不是漏译。 */
const FIXTURE_MODEL_LABELS = new Set([FIXTURE_TEXT_MODEL_LABEL, FIXTURE_IMAGE_MODEL_LABEL, FIXTURE_IMAGE_MODEL_B_LABEL])

/**
 * 监视器认得的「界面状态话」（铁律 4 要去后台核真假的那些）：每一类是词典里的哪条文案。
 * 中英两份都从词典读（invariants.mjs loadDictionaries），不在这里写原话——第一版手写的英文认法
 * （「budget exhausted」「may already have been submitted」「stopped the remaining shots」）和产品真实英文一条都对不上，
 * 英文界面那一档于是对这些话全瞎。两种语言都认：英文界面里冒出一句中文状态话，照样要核它说得对不对（漏译另由铁律 7 判）。
 */
/** 界面上说「因为什么停了」的那几句 → Run 记下的停下原因必须是它（run.stop.reason）。 */
const STOP_CLAIM_REASON = Object.freeze({
  'budget-exhausted': 'budget',
  'raise-budget': 'budget',
  'stopped-after-failure': 'failed',
  'stopped-for-recovery': 'restart_recovery',
})
const UI_CLAIM_TEXTS = Object.freeze([
  Object.freeze({ claim: 'maybe-submitted', key: 'agentToolFailure.generation_execution_failed' }),
  Object.freeze({ claim: 'budget-exhausted', key: 'generationCommon.production.canvasLanding.stoppedBudget' }),
  Object.freeze({ claim: 'raise-budget', key: 'generationCommon.production.canvasLanding.raiseBudget' }),
  Object.freeze({ claim: 'stopped-after-failure', key: 'generationCommon.production.canvasLanding.stoppedAfterFailure' }),
  Object.freeze({ claim: 'stopped-for-recovery', key: 'generationCommon.production.canvasLanding.stoppedForRecovery' }),
  // 返工 / 续拍没做成时「这是 Nomi 自己的问题」那一句：说它的那一刻，就有一种失败在源头没被分类（2026-09-29 起没有笼统的「稍后再试」）。
  Object.freeze({ claim: 'action-internal-error', key: 'generationCommon.production.canvasLanding.actionFailure.internalError' }),
  Object.freeze({ claim: 'stopped-remaining', key: 'generationCommon.production.canvasLanding.stoppedManual' }),
  Object.freeze({ claim: 'queued', key: 'generationCommon.production.canvasLanding.queued', anchored: true }),
])
/** 切家提示：「某某家：失败原因。建议」——点名了一家供应商，说它失败了、原因是什么。 */
const PROVIDER_FAILED_KEY = 'generationCommon.node.providerFailed'
/** 「参数不被接受」这一类失败原因（classifyGenerationError 的 input 类）。 */
const INPUT_REJECTED_REASON_KEY = 'generationCommon.observability.error.input.reason'
/** 错误卡上给供应商原话挂的标签（「服务商原话：」）：标明了的原话不算中文界面里混进英文。 */
const PROVIDER_MESSAGE_LABEL_KEY = 'generationCommon.error.providerMessage'

export function uiClaimPatterns(dictionaries = loadDictionaries()) {
  return UI_CLAIM_TEXTS.flatMap(({ claim, key, anchored }) => UI_LOCALES.map((locale) => ({
    claim, key, locale, source: uiTextPattern(uiText(locale, key, dictionaries), { anchored: Boolean(anchored) }),
  })))
}

export function providerFailedPatterns(dictionaries = loadDictionaries()) {
  return UI_LOCALES.map((locale) => ({ locale, pattern: new RegExp(uiTextPattern(uiText(locale, PROVIDER_FAILED_KEY, dictionaries), { anchored: true })) }))
}

const normalizePrompt = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

/** 页内观察者 250ms 采一次面、React 提交再加一帧：一步收尾后这么久里冒出来的面变化仍算这一步的（测量误差，不是产品时限）。 */
const ATTRIBUTION_GRACE_MS = 1000

/** 一笔供应商提交里真正发出去的参考图张数（apimart 扁平 body / kie input / openai 兼容 extra_body 三种形状）。 */
export function sentReferenceCount(body) {
  const pick = (value) => (Array.isArray(value) ? value.filter(Boolean).length : value ? 1 : 0)
  const input = body?.input && typeof body.input === 'object' ? body.input : {}
  return pick(body?.image_urls) || pick(body?.input_urls) || pick(body?.reference_images) || pick(body?.image)
    || pick(body?.first_frame_url) + pick(body?.last_frame_url)
    || pick(input.image_urls) || pick(input.input_urls) || pick(body?.extra_body?.image)
}

function sentParams(body) {
  const input = body?.input && typeof body.input === 'object' ? body.input : {}
  return {
    model: body?.model ?? null,
    size: body?.size ?? input.size ?? body?.aspect_ratio ?? input.aspect_ratio ?? null,
    resolution: body?.resolution ?? input.resolution ?? null,
    duration: body?.duration ?? input.duration ?? null,
  }
}

/** 这一笔是哪一家发的：夹具里每家一把不同的钥匙（Authorization 头）。 */
function vendorOfAuthorization(authorization) {
  const value = String(authorization ?? '')
  if (value.endsWith(FIXTURE_API_KEY_B)) return FIXTURE_IMAGE_VENDOR_B
  if (value.endsWith(FIXTURE_API_KEY)) return FIXTURE_VENDOR
  if (value.endsWith(FIXTURE_APIMART_API_KEY)) return FIXTURE_APIMART_VENDOR
  return null
}

function isRatio(value) {
  return typeof value === 'string' && /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(value.trim())
}

/**
 * @param {object} options
 * @param {string} options.playbook   剧本 id
 * @param {string} options.variant    变体 id（「乱用」那一档）
 * @param {string} options.outputDir  证据目录（截图 + 快照 + violations.json）
 * @param {() => import('playwright').Page} options.getWin
 * @param {import('playwright').ElectronApplication} options.app
 * @param {object} options.fixture    agent-runtime-fixture 句柄（供应商记账）
 * @param {object} options.egress     egress.mjs 的 startEgressWatch 句柄
 * @param {string} options.projectId
 * @param {string} options.projectRoot
 * @param {string} options.settingsDir
 * @param {'zh-CN'|'en'} options.locale
 * @param {() => string[]} [options.mainLogTail]
 */
export function createInvariantMonitor(options) {
  const { playbook, variant, outputDir, getWin, fixture, egress, projectId, projectRoot, settingsDir, mainLogTail } = options
  let locale = options.locale
  const limits = loadLimits()
  fs.mkdirSync(outputDir, { recursive: true })
  const violations = []
  const seenViolationKeys = new Set()
  const steps = []
  const consents = []
  const notes = []
  const submissions = []
  const receiptsSeen = new Set()
  const tokenRows = []
  let tokenMessagesSeen = 0
  let egressSeen = 0
  let mediaSeen = { images: 0, videos: 0 }
  let lastCheckAt = Date.now()
  let surfaceCursor = 0
  let currentStep = null
  let probeInstalls = 0
  const started = Date.now()

  const win = () => getWin()

  async function ensureProbe() {
    try {
      const result = await ensurePageProbe(win())
      if (result === 'installed') probeInstalls += 1
      return true
    } catch (error) {
      notes.push({ at: Date.now(), kind: 'probe-unavailable', message: String(error?.message ?? error).split('\n')[0] })
      return false
    }
  }

  async function readProject() {
    try {
      return await win().evaluate((id) => window.nomiDesktop.projects.readAsync(id), projectId)
    } catch {
      const file = path.join(projectRoot, '.nomi', 'project.json')
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
    }
  }
  const readRuns = () => readProductionRuns(projectRoot)

  async function screenshot(name) {
    const file = path.join(outputDir, `${name}.png`)
    try {
      await win().screenshot({ path: file })
      return file
    } catch (error) {
      notes.push({ at: Date.now(), kind: 'screenshot-failed', name, message: String(error?.message ?? error).split('\n')[0] })
      return null
    }
  }

  /**
   * 记一条违反。`key` 用来去重：同一个事实在后面每一步都会被再看到一次，只记第一次。
   * 证据 = 当场截图 + 快照 JSON（请求报文 / 状态快照）。
   */
  async function violate({ invariant, rule, key, module, message, snapshot, step, kind = 'product' }) {
    const assigned = rootOfRule(rule)
    if (!assigned) throw new Error(`full-walk：规则 ${rule} 没在 RULE_ROOTS 登记底层设计问题（rules.mjs）——先登记再用`)
    const { root, cluster } = assigned
    const dedupe = `${invariant}|${rule}|${key ?? message}`
    if (seenViolationKeys.has(dedupe)) return null
    seenViolationKeys.add(dedupe)
    const index = String(violations.length + 1).padStart(2, '0')
    const base = `v${index}-inv${invariant}-${rule}`.replace(/[^a-zA-Z0-9_.-]+/g, '-')
    const shot = await screenshot(base)
    const snapshotFile = path.join(outputDir, `${base}.json`)
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot ?? {}, null, 2))
    const record = {
      // product = 产品行为违反铁律；harness = 零花费隔离被穿透（没花钱，但走查的前提不成立，要先堵）。
      kind,
      invariant, invariantTitle: invariantById(invariant).title['zh-CN'], rule,
      playbook, variant, step: step ?? currentStep?.label ?? '(步骤之间)',
      module, message, designRoot: root, designRootText: DESIGN_ROOTS[root], cluster,
      evidence: { screenshot: shot, snapshot: snapshotFile },
      at: new Date().toISOString(),
    }
    violations.push(record)
    console.log(`[full-walk] ✖ 铁律 ${invariant}（${rule}）@ ${record.step}：${message}`)
    return record
  }

  // ── 用户点头（铁律 1/2/3 的对账基准）────────────────────────────────────────────────────────

  /**
   * 付费卡上点确认之前调用：读下卡上此刻摆着的一切（宿主投影 = 卡的唯一输入 + DOM 上的标题 / 翻页 / 按钮字）。
   * 返回的 consent 在点完之后由监视器拿去对供应商收到的请求。
   */
  async function consentSpendCard(card, { label } = {}) {
    const read = await win().evaluate((id) => window.nomiDesktop.productionRuns.pendingSpend(id), projectId).catch(() => null)
    const pending = read?.surface === 'ready' ? read.rows?.[0] ?? null : null
    const dom = await card.evaluate((element) => {
      const text = (selector) => String(element.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()
      return {
        title: text('[data-v4-block="slot-title"]'),
        pager: text('[data-v4-block="pager"]'),
        confirmLabel: text('[data-v4-control="confirm"]'),
        text: String(element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200),
      }
    })
    const pagerMatch = /(\d+)\s*\/\s*(\d+)/.exec(dom.pager)
    const pageIndex = pagerMatch ? Number(pagerMatch[1]) - 1 : 0
    const declaredCount = Number(/(\d+)/.exec(dom.title)?.[1] ?? pending?.shots?.length ?? 1)
    const buttonCount = Number(/(\d+)\s*(镜|shots?)/i.exec(dom.confirmLabel)?.[1] ?? 0)
    // 同一镜在画布上那张占位卡此刻连着几张参考（用户在画布上看得见的那条线）。
    const canvas = (await readProject())?.payload?.generationCanvas ?? {}
    const canvasRefsOf = (nodeId) => (nodeId ? (canvas.edges ?? []).filter((edge) => edge.target === nodeId).length : 0)
    const allShots = (pending?.shots ?? []).map((shot) => ({
      shotId: shot.shotId, nodeId: shot.nodeId ?? null, index: shot.index, prompt: shot.prompt,
      providerId: shot.providerId, model: shot.modelId, params: shot.parameters ?? {}, refs: (shot.references ?? []).length,
      canvasRefs: canvasRefsOf(shot.nodeId),
    }))
    // 按钮承诺的范围：按钮上写了「N 镜」= N 镜（全部）；没写而卡在翻页 = 只有眼前这一页。
    const buttonScope = buttonCount > 1 || !pagerMatch ? allShots : allShots.filter((_, index) => index === pageIndex)
    const consent = {
      id: `c${consents.length + 1}`, kind: 'spend-card', at: Date.now(), step: currentStep?.label ?? null, label: label ?? null,
      operationId: pending?.operationId ?? null, runId: pending?.runId ?? null, dom, pageIndex,
      declaredCount, buttonCount: buttonCount || buttonScope.length, allShots,
      scope: buttonScope.map((shot) => ({ ...shot, remaining: 1, submissions: [] })),
    }
    consents.push(consent)
    fs.writeFileSync(path.join(outputDir, `${consent.id}-spend-card.json`), JSON.stringify(consent, null, 2))
    return consent
  }

  /** 用户自己在节点上点生成之前调用：读下这个节点此刻摆的模型 / 参数 / 参考（节点就是那张生成框的唯一输入）。 */
  async function consentNodeGenerate(nodeId, { count = 1, label } = {}) {
    const project = await readProject()
    const canvas = project?.payload?.generationCanvas ?? {}
    const node = (canvas.nodes ?? []).find((candidate) => candidate.id === nodeId)
    const incoming = (canvas.edges ?? []).filter((edge) => edge.target === nodeId)
    const meta = node?.meta ?? {}
    const consent = {
      id: `c${consents.length + 1}`, kind: 'node-generate', at: Date.now(), step: currentStep?.label ?? null, label: label ?? null, nodeId,
      scope: [{
        nodeId, prompt: node?.prompt ?? '', model: meta.modelKey ?? meta.imageModel ?? meta.videoModel ?? null, providerId: meta.modelVendor ?? null,
        params: { aspect_ratio: meta.aspect_ratio ?? meta.aspectRatio ?? null, resolution: meta.resolution ?? null, duration: meta.duration ?? null },
        refs: incoming.length + (Array.isArray(node?.references) ? node.references.length : 0),
        remaining: count, submissions: [],
      }],
      declaredCount: count, buttonCount: count,
    }
    consents.push(consent)
    fs.writeFileSync(path.join(outputDir, `${consent.id}-node-generate.json`), JSON.stringify({ consent, node, incoming }, null, 2))
    return consent
  }

  /**
   * 界面上声明的「默认模型」（Agent 面板模型弹层里的「图片默认 / 视频默认」，或设置页那四行）：
   * 用户看见它写着 X，之后 Agent 替他起草的这一类生成就该用 X（铁律 3）。
   */
  const declaredDefaults = {}
  function recordDeclaredDefault({ kind, vendorKey, modelKey, label, where }) {
    declaredDefaults[kind] = { vendorKey, modelKey, label, where, at: Date.now() }
  }

  /**
   * 用户给 Agent 附了一个文件、发出了一句话：界面上那颗附件签就是「这个文件跟着这句话一起给了 Agent」。
   * 核对两件事：模型真正收到的请求里有没有文件里的内容（暗号行）；发出之后，对话里那条用户消息还带不带着它。
   */
  const attachments = []
  function recordAttachment({ name, marker, userMarker }) {
    attachments.push({ name, marker, userMarker, sentAt: Date.now(), checked: false })
  }
  async function checkAttachments() {
    for (const attachment of attachments.filter((entry) => !entry.checked)) {
      const request = fixture.requests.find((entry) => (entry.at ?? 0) >= attachment.sentAt - 1000
        && JSON.stringify(entry.body?.messages ?? []).includes(attachment.userMarker))
      if (!request) continue
      attachment.checked = true
      const text = JSON.stringify(request.body?.messages ?? [])
      const users = (request.body?.messages ?? []).filter((message) => message.role === 'user')
      const lastUser = JSON.stringify(users.at(-1) ?? {})
      if (text.includes(attachment.marker)) {
        const at = text.indexOf(attachment.marker)
        notes.push({ at: Date.now(), kind: 'attachment-delivered', name: attachment.name, excerpt: text.slice(Math.max(0, at - 160), at + 80) })
      } else {
        await violate({
          invariant: 3, rule: 'attachment-not-sent-to-model', key: attachment.name,
          module: 'src/workbench/ai/composer/useComposerAttachments.ts → electron/agentLane/laneInputPreparation.ts（附件从输入框到模型可见内容这一段）',
          message: `输入框里挂着附件「${attachment.name}」，发出去的那一次模型请求里没有它的内容（暗号行没出现）${lastUser.includes(attachment.name) ? '，只有文件名' : ''}`,
          snapshot: { attachment, lastUserMessage: lastUser.slice(0, 4000), mentionsName: text.includes(attachment.name), mentionsLocalUrl: /nomi-local:\/\//.test(lastUser) },
        })
      }
      const bubbleHasChip = await win().evaluate((name) => {
        const bubbles = [...document.querySelectorAll('[data-v4-block="user"]')]
        const last = bubbles.at(-1)
        return Boolean(last && [...last.querySelectorAll('[data-v4-chip]')].some((chip) => String(chip.textContent ?? '').includes(name)))
      }, attachment.name).catch(() => null)
      if (bubbleHasChip === false) {
        await violate({
          invariant: 3, rule: 'attachment-gone-after-send', key: attachment.name,
          module: 'src/workbench/ai/v4（用户消息气泡不带附件签）',
          message: `发出之后，对话里那条用户消息不再带着附件「${attachment.name}」——用户没法确认它到底有没有跟着发出去`,
          snapshot: { attachment },
        })
      }
    }
  }

  /**
   * 全屏付费确认框（SpendConfirmDialog）上点了确认：框上写几张就是几笔。框里不逐镜列提示词，
   * 所以这里按「笔数」对账（anyPrompt），不按提示词。
   */
  async function consentDialog(dialog, { label } = {}) {
    const text = await dialog.evaluate((element) => String(element.innerText ?? '').replace(/\s+/g, ' ').trim()).catch(() => '')
    const count = Number(/(\d+)\s*(张|段|镜|个|images?|shots?|videos?)/i.exec(text)?.[1] ?? 1)
    const consent = {
      id: `c${consents.length + 1}`, kind: 'dialog', at: Date.now(), step: currentStep?.label ?? null, label: label ?? null,
      dom: { text: text.slice(0, 600) }, declaredCount: count, buttonCount: count,
      scope: [{ anyPrompt: true, prompt: '', params: {}, refs: null, remaining: count, submissions: [] }],
    }
    consents.push(consent)
    return consent
  }

  /** 用户切到「全自动」并在二次确认上点了头：之后 Agent 的提交都在这次授权里（开放式，不限镜数）。 */
  function consentFullAuto({ label } = {}) {
    const consent = { id: `c${consents.length + 1}`, kind: 'full-auto', at: Date.now(), step: currentStep?.label ?? null, label: label ?? null, openEnded: true, scope: [], submissions: [] }
    consents.push(consent)
    return consent
  }

  /**
   * 用户按了「暂停 / 停止」：他此刻收回了还没兑现的那部分授权。之后才**到达**供应商的提交（此前已经在路上的不算）
   * 不再被任何一次确认覆盖（铁律 1）。
   */
  function revokeConsents({ label } = {}) {
    const at = Date.now()
    for (const consent of consents) if (!consent.revokedAt) consent.revokedAt = at
    notes.push({ at, kind: 'consent-revoked', label: label ?? null })
  }
  async function flagIfRevoked(consent, submission, body) {
    if (!consent.revokedAt || (submission.at ?? 0) <= consent.revokedAt) return
    await violate({
      invariant: 1, rule: 'submitted-after-user-stopped', key: `${consent.id}|${submission.taskId ?? submission.at}`,
      module: 'electron/productionRun/multiShotBatchScheduler.ts（一轮派发循环里不再看 Run 状态，暂停之后同一轮剩下的镜照样提交）',
      message: `用户在 ${new Date(consent.revokedAt).toISOString().slice(11, 19)} 按了暂停，之后供应商又收到一笔：「${submission.prompt.slice(0, 30)}」`,
      snapshot: { consent: { id: consent.id, kind: consent.kind, revokedAt: consent.revokedAt }, submission, body },
    })
  }

  // ── 铁律 1 / 2 / 3：供应商收到的每一笔 ───────────────────────────────────────────────────

  async function checkSubmissions() {
    const fresh = []
    for (const [kind, list] of [['image', fixture.images], ['video', fixture.videos ?? []]]) {
      for (let index = mediaSeen[`${kind}s`]; index < list.length; index += 1) fresh.push({ kind, record: list[index] })
      mediaSeen[`${kind}s`] = list.length
    }
    fresh.sort((a, b) => (a.record.at ?? 0) - (b.record.at ?? 0))
    for (const { kind, record } of fresh) {
      const body = record.body ?? {}
      const prompt = normalizePrompt(body.prompt ?? body.input?.prompt)
      const submission = { kind, at: record.at, path: record.path, taskId: record.taskId ?? null, prompt, params: sentParams(body), refs: sentReferenceCount(body), behavior: record.behavior ?? null, vendor: vendorOfAuthorization(record.authorization) }
      submissions.push(submission)
      const before = consents.filter((consent) => consent.at <= (record.at ?? Date.now()))
      const matches = (entry) => {
        if (entry.anyPrompt) return true
        const shown = normalizePrompt(entry.prompt)
        return shown && (prompt === shown || prompt.includes(shown) || shown.includes(prompt))
      }
      let matched = null
      let exhausted = null
      for (const consent of [...before].reverse()) {
        for (const entry of consent.scope ?? []) {
          if (!matches(entry)) continue
          if (entry.remaining > 0) { matched = { consent, entry }; break }
          exhausted = exhausted ?? { consent, entry }
        }
        if (matched) break
      }
      if (matched) {
        matched.entry.remaining -= 1
        matched.entry.submissions.push(submission)
        submission.consent = matched.consent.id
        // 没带能区分供应商的钥匙（回环那家 authType 为 none）时，这一笔是哪一家发的 = 用户点头那一刻卡上选的那家。
        submission.vendor = submission.vendor ?? matched.entry.providerId ?? null
        await flagIfRevoked(matched.consent, submission, body)
        await compareShownWithSent(matched.consent, matched.entry, submission, body)
        continue
      }
      if (exhausted) {
        await violate({
          invariant: 2, rule: 'duplicate-submission', key: `${exhausted.consent.id}|${prompt}|${submissions.length}`,
          module: exhausted.consent.kind === 'spend-card' ? 'electron/productionRun（派发 / 重试）' : 'src/workbench/generationCanvas/runner/generationRunController.ts',
          message: `同一次确认（${exhausted.consent.id}）里同一镜被提交了不止一次：「${prompt.slice(0, 40)}」`,
          snapshot: { consent: exhausted.consent, submission, body },
        })
        continue
      }
      const openEnded = [...before].reverse().find((consent) => consent.openEnded)
      if (openEnded) {
        openEnded.submissions.push(submission)
        submission.consent = openEnded.id
        await flagIfRevoked(openEnded, submission, body)
        continue
      }
      await violate({
        invariant: 1, rule: 'submission-without-consent', key: `${record.taskId ?? record.at}`,
        module: '付费派发（没有任何一次用户确认覆盖这一笔）',
        message: `供应商收到一笔提交，却找不到覆盖它的用户确认：「${prompt.slice(0, 50)}」（${kind}）`,
        snapshot: { submission, body, consents },
      })
    }
  }

  async function compareShownWithSent(consent, entry, submission, body) {
    const sent = submission.params
    const problems = []
    if (entry.anyPrompt) return
    const declared = declaredDefaults[submission.kind]
    if (declared && consent.kind !== 'node-generate' && declared.at <= consent.at && sent.model && sent.model !== declared.modelKey) {
      // 「告诉过模型」= 请求里有一句**默认**的说法点到了这个模型（模型索引把所有可用模型都列一遍，列到不算告诉）。
      const told = fixture.requests.some((request) => {
        const text = JSON.stringify(request.body ?? {})
        return /(图片默认|视频默认|默认(的)?(图片|视频)?模型|default (image|video) model|(image|video) default)/i.test(text) && text.includes(declared.modelKey)
      })
      await violate({
        invariant: 3, rule: 'agent-ignores-declared-default', key: `${consent.id}|${submission.kind}`,
        module: told
          ? 'Agent 起草（模型被告知了默认，却没按它选）'
          : 'electron/agentLane/laneModelContext.ts formatLaneModelIndex（模型索引只标默认「模式」，从不告诉模型用户选的默认模型）+ electron/capabilityCore/semanticGenerationCandidate.ts（只在模型没点名时才补默认）',
        message: `${declared.where}写着「${declared.label}」，Agent 起草、用户确认后供应商收到的是 ${sent.model}${told ? '' : '（这一场里宿主没有任何一次把这个默认告诉模型）'}`,
        snapshot: { declared, consent: { id: consent.id, kind: consent.kind, shot: entry }, submission, toldModel: told },
      })
    }
    if (entry.model && sent.model && String(entry.model).toLowerCase() !== String(sent.model).toLowerCase()) {
      problems.push({ field: 'model', shown: entry.model, sent: sent.model })
    }
    const shownRatio = entry.params?.aspect_ratio
    if (isRatio(shownRatio) && isRatio(sent.size) && shownRatio !== sent.size) problems.push({ field: 'aspect_ratio', shown: shownRatio, sent: sent.size })
    const shownResolution = entry.params?.resolution
    if (shownResolution && sent.resolution && String(shownResolution).toLowerCase() !== String(sent.resolution).toLowerCase()) {
      problems.push({ field: 'resolution', shown: shownResolution, sent: sent.resolution })
    }
    const shownDuration = entry.params?.duration
    if (shownDuration !== null && shownDuration !== undefined && sent.duration !== null && sent.duration !== undefined && Number(shownDuration) !== Number(sent.duration)) {
      problems.push({ field: 'duration', shown: shownDuration, sent: sent.duration })
    }
    if (Number(entry.refs ?? 0) !== Number(submission.refs ?? 0)) problems.push({ field: 'references', shown: entry.refs ?? 0, sent: submission.refs ?? 0 })
    // 付费卡那一镜在画布上的占位卡：用户在画布上连了参考线，他看到的就是「这一镜带参考」。
    if (consent.kind === 'spend-card' && Number(entry.canvasRefs ?? 0) > Number(submission.refs ?? 0)) {
      problems.push({ field: 'references-on-canvas', shown: entry.canvasRefs, sent: submission.refs ?? 0 })
    }
    for (const problem of problems) {
      await violate({
        invariant: 3, rule: `sent-${problem.field}`, key: `${consent.id}|${entry.shotId ?? entry.nodeId}|${problem.field}`,
        module: problem.field === 'references-on-canvas'
          ? 'src/workbench/ai/v4/spendCardDraft.ts projectSpendNode（只认候选里的参考，resolveReferenceSlots(node, [], []) 不看画布连线）→ 制作 Run 候选'
          : problem.field === 'references'
            ? (consent.kind === 'spend-card' ? '付费卡 → 执行合同 → 出站请求（参考图在哪一层丢）' : 'src/workbench/generationCanvas/runner（画布直生成的参考槽编译）')
            : (consent.kind === 'spend-card' ? '付费卡投影 ↔ 执行合同编译' : '节点 composer ↔ 画布执行编译'),
        message: problem.field === 'references-on-canvas'
          ? `画布上这一镜的占位卡连着 ${problem.shown} 张参考图，确认付费卡后供应商收到 ${problem.sent} 张`
          : `${consent.kind === 'spend-card' ? '付费卡' : '节点'}上显示 ${problem.field}=${JSON.stringify(problem.shown)}，供应商收到的是 ${JSON.stringify(problem.sent)}`,
        snapshot: { consent, shown: entry, sent: submission, body },
      })
    }
  }

  /** 卡的范围自相矛盾（标题说 N 镜、按钮只发 1 镜）或发出去的镜数对不上卡上写的：在收尾 / settle 时判。 */
  async function checkConsentScopes() {
    for (const consent of consents.filter((entry) => entry.kind === 'spend-card' && !entry.scopeChecked)) {
      const sentCount = consent.scope.reduce((sum, entry) => sum + entry.submissions.length, 0)
      const others = submissions.filter((submission) => submission.consent !== consent.id && submission.at >= consent.at
        && consent.allShots.some((shot) => normalizePrompt(shot.prompt) && (submission.prompt.includes(normalizePrompt(shot.prompt)) || normalizePrompt(shot.prompt).includes(submission.prompt))))
      if (consent.declaredCount > 1 && consent.declaredCount !== sentCount + others.length) {
        await violate({
          invariant: 3, rule: 'card-scope-mismatch', key: consent.id,
          module: 'src/workbench/ai/v4/agentPanelSpendCard.ts（标题按整单计数） + useAgentPanelSpendConfirm.ts（逐镜只发当前页）',
          message: `付费卡标题写「${consent.dom.title}」（${consent.declaredCount} 镜），按钮是「${consent.dom.confirmLabel}」，点完供应商实际收到 ${sentCount + others.length} 镜`,
          snapshot: { consent, submissions: submissions.filter((submission) => submission.at >= consent.at) },
        })
      }
      consent.scopeChecked = true
    }
  }

  // ── 铁律 1（网络闸）────────────────────────────────────────────────────────────────────────

  async function checkEgress() {
    const entries = egress.read()
    const fresh = entries.slice(egressSeen)
    egressSeen = entries.length
    const classified = classifyEgress(fresh, vendorHostsOf(path.join(settingsDir, 'model-catalog.json')))
    for (const attempt of classified.vendor) {
      const frames = [...new Set([attempt, ...(attempt.callers ?? [])].flatMap((entry) => appFramesOf(entry.stack)))]
      await violate({
        invariant: 1, rule: 'egress-to-real-vendor', key: `${attempt.host}|${frames[0] ?? attempt.via}`,
        module: frames.length ? `主进程：${frames.slice(0, 3).join(' ← ')}` : attempt.via === 'chromium' ? `渲染层 / Chromium（${attempt.url ?? attempt.host}）` : `主进程（${attempt.via}，没抓到调用栈）`,
        message: `有请求打向真实供应商 ${attempt.host}（${attempt.vendorKey}）：${attempt.url ?? attempt.host}——已被网络闸（${attempt.via}）拦下，一分钱没花，但零花费走查不许发生`,
        kind: 'harness',
        snapshot: { attempt },
      })
    }
    for (const other of classified.other) notes.push({ at: other.at, kind: 'egress-other', host: other.host, via: other.via, url: other.url ?? null })
  }

  // ── 铁律 4：说的都是真的 ────────────────────────────────────────────────────────────────────

  /** 宿主递给模型的回执（夹具看得见每一次请求里的 tool 消息）。只核「说开始了」这一族。 */
  async function checkReceipts() {
    for (const request of fixture.requests) {
      const messages = request.body?.messages ?? []
      const names = new Map()
      for (const message of messages) {
        for (const call of message.tool_calls ?? []) names.set(call.id, call.function?.name)
      }
      for (const message of messages) {
        if (message.role !== 'tool' || receiptsSeen.has(message.tool_call_id)) continue
        receiptsSeen.add(message.tool_call_id)
        const name = names.get(message.tool_call_id)
        const text = typeof message.content === 'string' ? message.content
          : (message.content ?? []).map((part) => part.text ?? '').join('\n')
        if (name === 'generate' && /outcome may be unknown|could not be completed/i.test(text) && submissions.length === 0) {
          await violate({
            invariant: 4, rule: 'receipt-maybe-submitted-but-nothing-sent', key: message.tool_call_id,
            module: 'electron/agentLane/laneExtendedTools.ts（generate 失败一律按「提交结果未知」回给模型）',
            message: '宿主告诉模型「submission outcome may be unknown…Do not request payment or submit again」，而供应商一笔都没收到——模型据此会让用户去核对一笔根本不存在的扣费',
            snapshot: { receipt: text.slice(0, 2000), submissions: submissions.length, hostSaid: (mainLogTail?.() ?? []).filter((line) => /generation|production|capability|storyboard/i.test(line)).slice(-15) },
          })
          continue
        }
        if (name !== 'generate' || !/generation has started/i.test(text)) continue
        const operationId = /"operationId":"([^"]+)"/.exec(text)?.[1] ?? /operationId[=:]\s*"?([\w-]+)/.exec(text)?.[1]
        const run = readRuns().find((candidate) => candidate.runId === operationId || candidate.generationPlan?.operationId === operationId) ?? readRuns().at(-1)
        const shots = run?.generationPlan?.shots ?? []
        const excluded = shots.filter((shot) => shot.included === false)
        const withJobs = new Set((run?.jobs ?? []).map((job) => job.metadata?.shotId).filter(Boolean))
        const notStarted = shots.filter((shot) => shot.included === false || !withJobs.has(shot.shotId))
        if (shots.length > 1 && (excluded.length > 0 || notStarted.length > 0) && /no card is waiting|do not call generate again/i.test(text)) {
          await violate({
            invariant: 4, rule: 'receipt-claims-whole-draft-started', key: message.tool_call_id,
            module: 'electron/agentLane/laneExtendedTools.ts generateReceipt（approved 一支写死「generation has started / no card is waiting / do not call generate again」）',
            message: `宿主告诉模型「generation has started…No card is waiting…Do not call generate again for this draft」，而这份草稿 ${shots.length} 镜里有 ${notStarted.length} 镜没开拍（${excluded.length} 镜已被移出这一批）`,
            snapshot: { receipt: text.slice(0, 4000), runStatus: run?.status, shots: shots.map((shot) => ({ shotId: shot.shotId, included: shot.included ?? true, hasJob: withJobs.has(shot.shotId) })) },
          })
        }
      }
    }
  }

  /** 这一场配置里有的供应商 key（切家提示点名的是 key）：认「某某家：……」时只认真有这一家的，免得把随便一句「X: Y. Z」当成点名。 */
  function knownVendorKeys() {
    try {
      const catalog = JSON.parse(fs.readFileSync(path.join(settingsDir, 'model-catalog.json'), 'utf8'))
      return new Set((catalog.vendors ?? []).map((vendor) => vendor?.key).filter(Boolean))
    } catch { return new Set() }
  }

  /** 界面上的状态文字：出现时读后台对一对。toast 可能在步骤收尾前就自己关了，所以页内观察者记下的 toast 文字也一起核。 */
  async function checkUiClaims(probe) {
    let claims = []
    const patterns = uiClaimPatterns()
    const vendorFailed = providerFailedPatterns()
    const vendors = knownVendorKeys()
    const toastClaims = Object.values(probe?.toasts ?? {}).flatMap((toast) => (toast.texts ?? []).flatMap((text) => {
      const found = []
      for (const { claim, source } of patterns) {
        if (new RegExp(source).test(text) && !found.some((entry) => entry.claim === claim)) found.push({ claim, text: text.slice(0, 160), node: `toast:${toast.id}` })
      }
      // 「某某家：失败原因。建议」——这条提示点名了一家供应商，说它失败了、原因是什么。
      for (const { locale: textLocale, pattern } of vendorFailed) {
        const match = pattern.exec(text)
        if (!match?.groups || !vendors.has(match.groups.vendor)) continue
        found.push({ claim: 'vendor-failed', vendor: match.groups.vendor, reason: match.groups.reason, textLocale, text: text.slice(0, 200), node: `toast:${toast.id}` })
        break
      }
      return found
    }))
    try {
      claims = await win().evaluate((sources) => {
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
        const compiled = sources.map(({ claim, source }) => [claim, new RegExp(source)])
        const found = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode
          const text = String(node.nodeValue ?? '').trim()
          if (!text) continue
          const element = node.parentElement
          if (!element || !visible(element)) continue
          const claimed = new Set()
          for (const [claim, pattern] of compiled) {
            if (claimed.has(claim) || !pattern.test(text)) continue
            claimed.add(claim)
            const owner = element.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null
            found.push({ claim, text: text.slice(0, 160), node: owner })
          }
        }
        return found
      }, patterns.map(({ claim, source }) => ({ claim, source })))
    } catch { claims = [] }
    claims.push(...toastClaims)
    if (!claims.length) return
    const runs = readRuns()
    for (const claim of claims) {
      if (claim.claim === 'vendor-failed') {
        // 失败原因说对了没有：供应商原话说的是「模型下线 / 不可用」（夹具这一笔回的原话），提示给的原因却是「参数不被接受」——让用户去改比例 / 尺寸。
        const providerSaid = submissions.map((submission) => String(submission.behavior?.reject?.json?.error?.message ?? submission.behavior?.fail?.message ?? ''))
          .find((message) => /deprecated|no longer available|model_not_found|offline|不可用|下线/i.test(message))
        if (providerSaid && claim.reason === uiText(claim.textLocale, INPUT_REJECTED_REASON_KEY)) {
          await violate({
            invariant: 4, rule: 'failure-reason-misstated', key: `${claim.vendor}|reason`,
            module: 'src/workbench/observability/classifyError.ts classifyGenerationError（按 HTTP 400 / category=input 一律归成「参数不被接受」）',
            message: `供应商原话是「${providerSaid.slice(0, 60)}」（模型不可用），提示却说「${claim.text.slice(0, 50)}」——让用户去改比例 / 尺寸`,
            snapshot: { claim, providerSaid },
          })
        }
        // 它点名的那一家，真的有一笔失败吗？
        const failedHere = submissions.filter((submission) => submission.vendor === claim.vendor
          && (submission.behavior?.fail || submission.behavior?.reject || submission.behavior?.corruptResult))
        if (failedHere.length > 0 || !submissions.some((submission) => submission.vendor)) continue
        await violate({
          invariant: 4, rule: 'failure-blamed-on-wrong-vendor', key: `${claim.vendor}|${claim.node}`,
          module: 'src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts（换了模型之后，节点上旧的失败还在，提示按「现在选的这家」去点名）',
          message: `提示说「${claim.vendor}」失败了（「${claim.text.slice(0, 60)}」），而这一家一笔失败都没有——失败的是 ${[...new Set(submissions.filter((submission) => submission.behavior?.fail || submission.behavior?.reject).map((submission) => submission.vendor))].join('、') || '别的供应商'}`,
          snapshot: { claim, submissions: submissions.map(({ vendor, behavior, prompt, at }) => ({ vendor, behavior, prompt: prompt.slice(0, 40), at })) },
        })
        continue
      }
      if (claim.claim === 'maybe-submitted') {
        // 「原任务可能已经提交、勿再次付费」：供应商那边真的收到过吗？一笔都没有 = 这句话把一次没发出去的失败说成了可能扣过钱。
        if (submissions.length > 0) continue
        await violate({
          invariant: 4, rule: 'ui-maybe-submitted-but-nothing-sent', key: `${claim.claim}|${claim.text.slice(0, 40)}`,
          module: 'electron/agentLane/laneExtendedTools.ts / laneFailureFromDecision（generation_execution_failed 一律说「结果未知、勿再次付费」）',
          message: `界面说「${claim.text.slice(0, 60)}」，而这一场供应商一笔提交都没收到（网络闸也没拦到任何打向供应商的请求）`,
          snapshot: { claim, submissions: submissions.length, runs: runs.map((run) => ({ runId: run.runId, status: run.status, plan: run.generationPlan?.state ?? null, jobs: (run.jobs ?? []).map((job) => ({ status: job.status, errorCode: job.errorCode ?? null, providerTaskId: job.providerTaskId ?? null })) })), hostSaid: (mainLogTail?.() ?? []).filter((line) => /generation|production|capability|storyboard/i.test(line)).slice(-15) },
        })
        continue
      }
      if (STOP_CLAIM_REASON[claim.claim]) {
        // 「为什么停」是 Run 在停下那一刻记下的事实（run.stop.reason，electron/productionRun/productionRunLifecycle.ts applyRunStatus）：
        // 界面说的原因，后台得真有一个 Run 是因为它停的。
        const expected = STOP_CLAIM_REASON[claim.claim]
        if (runs.some((run) => run.stop?.reason === expected)) continue
        await violate({
          invariant: 4, rule: `ui-${claim.claim}`, key: `${claim.claim}|${claim.node}`,
          module: 'electron/shared/productionRunStop.ts runStopReason → electron/shared/productionShotPhase.ts deriveProductionShotState（界面说的停下原因与 Run 记下的不一致）',
          message: `界面说「${claim.text}」，而没有哪个 Run 记下的停下原因是 ${expected}`,
          snapshot: { claim, runs: runs.map((run) => ({ runId: run.runId, status: run.status, stop: run.stop ?? null, budget: run.budget ?? null })) },
        })
      } else if (claim.claim === 'action-internal-error') {
        const hostSaid = (mainLogTail?.() ?? []).filter((line) => /production-action|internal-error|production-run/i.test(line)).slice(-12)
        await violate({
          invariant: 4, rule: 'ui-action-internal-error', key: `${claim.claim}|${claim.node}`,
          module: 'electron/capabilityCore/appIntegrationProductionActions.ts productionShotActionFailureOf（这一种失败在源头没被分类）',
          message: `界面说「${claim.text.slice(0, 80)}」——返工 / 续拍撞上了一种还没有语义码的失败（主进程日志 production-action-internal-error 那一行就是它）`,
          snapshot: { claim, hostSaid, runs: runs.map((run) => ({ runId: run.runId, status: run.status, stop: run.stop ?? null })) },
        })
      } else if (claim.claim === 'stopped-remaining') {
        const run = runs.at(-1)
        const shots = run?.generationPlan?.shots ?? []
        const submitted = new Set((run?.jobs ?? []).filter((job) => job.providerTaskId).map((job) => job.metadata?.shotId))
        if (shots.length > 0 && shots.every((shot) => shot.included === false || submitted.has(shot.shotId))) {
          await violate({
            invariant: 4, rule: 'ui-stopped-remaining', key: `${claim.claim}|${run?.runId}`,
            module: 'electron/productionRun/multiShotBatchScheduler.ts（一轮就把所有镜交完）+ 急停文案',
            message: `界面说「${claim.text}」，而这批每一镜都已经交给了供应商——没有剩余可停`,
            snapshot: { claim, run: { runId: run?.runId, status: run?.status, jobs: run?.jobs } },
          })
        }
      } else if (claim.claim === 'queued' && claim.node) {
        const run = runs.find((candidate) => (candidate.generationPlan?.shots ?? []).some((shot) => shot.nodeId === claim.node))
        const shot = run?.generationPlan?.shots?.find((candidate) => candidate.nodeId === claim.node)
        if (run && shot && (shot.included === false || ['paused', 'cancelled', 'completed'].includes(run.status))) {
          await violate({
            invariant: 4, rule: 'ui-queued', key: `${claim.node}|${run.status}|${shot.included}`,
            module: 'electron/shared/productionShotPhase.ts + 画布落地投影',
            message: `节点说「${claim.text}」，而它所在的 Run 是 ${run.status}、这一镜 included=${shot.included ?? true}——没有队列会派它`,
            snapshot: { claim, run: { runId: run.runId, status: run.status }, shot },
          })
        }
      }
    }
  }

  // ── 铁律 5：不会永远转圈 ────────────────────────────────────────────────────────────────────

  async function checkSpinners(probe, { settleLabel = null } = {}) {
    if (!probe) return
    const now = Date.now()
    const project = await readProject()
    const nodes = project?.payload?.generationCanvas?.nodes ?? []
    const runs = readRuns()
    for (const spinner of Object.values(probe.spinners ?? {})) {
      const present = !spinner.gone
      const age = (spinner.gone ?? now) - spinner.firstSeen
      if (spinner.owner?.startsWith('node:')) {
        const node = nodes.find((candidate) => candidate.id === spinner.owner.slice(5))
        if (!node) continue
        const terminal = ['success', 'error'].includes(node.status)
        const active = ['running', 'queued'].includes(node.status)
        const phase = node.progress?.phase
        const deadline = phase ? limits.generationPhaseDeadline.value[phase] : null
        const since = node.progress?.updatedAt ?? spinner.firstSeen
        if (!terminal && !active) {
          // 节点自己没在跑（制作占位「排队中 / 已停」那一类）：它的时限不归节点登记表，按收场检查点判。
          if (settleLabel && present) {
            await violate({
              invariant: 5, rule: 'spinner-without-deadline', key: `${spinner.owner}|${spinner.desc}|${settleLabel}`,
              module: 'src/workbench/generationCanvas/nodes/ProductionShotOverlays.tsx / ProductionShotPlaceholder.tsx（制作占位的转圈没有登记时限）',
              message: `「${settleLabel}」时节点 ${node.id}（${node.status ?? '无状态'}）上的转圈还在（已 ${Math.round(age / 1000)}s）：「${spinner.context ?? ''}」`,
              snapshot: { spinner, node: { id: node.id, status: node.status, progress: node.progress }, runs: runs.map((run) => ({ runId: run.runId, status: run.status, jobs: (run.jobs ?? []).map((job) => ({ shotId: job.metadata?.shotId, status: job.status, errorCode: job.errorCode ?? null })) })) },
            })
          }
          continue
        }
        if (present && terminal && !node.runs?.some((run) => ['running', 'queued'].includes(run.status))) {
          const lingering = now - Math.max(spinner.firstSeen, node.runs?.[0]?.completedAt ?? 0)
          if (lingering > limits.savedFeedbackWindowMs.value) {
            await violate({
              invariant: 5, rule: 'spinner-on-finished-node', key: `${node.id}|${spinner.desc}`,
              module: 'src/workbench/generationCanvas/nodes（节点状态已终态，转圈没收）',
              message: `节点 ${node.id} 已是 ${node.status}，上面的转圈还在（${Math.round(lingering / 1000)}s）`,
              snapshot: { spinner, node: { id: node.id, status: node.status, progress: node.progress, runs: node.runs } },
            })
          }
        } else if (present && deadline && now - since > deadline.maxMs) {
          await violate({
            invariant: 5, rule: 'node-phase-deadline', key: `${node.id}|${phase}`,
            module: 'src/workbench/generationCanvas/runner/generationPhaseDeadline.ts（阶段时限没兑现）',
            message: `节点 ${node.id} 停在「${phase}」已 ${Math.round((now - since) / 1000)}s，超过登记时限 ${Math.round(deadline.maxMs / 1000)}s`,
            snapshot: { spinner, node: { id: node.id, status: node.status, progress: node.progress } },
          })
        }
        continue
      }
      if (spinner.kind === 'agent-running') {
        const lastModelActivity = Math.max(0, ...fixture.requests.map((request) => request.at ?? 0))
        const pendingCard = await win().locator('[data-v4-block="intervention"]').count().catch(() => 0)
        if (present && !pendingCard && lastModelActivity && now - lastModelActivity > limits.agentIdleMs.value) {
          await violate({
            invariant: 5, rule: 'agent-turn-idle', key: `agent|${spinner.firstSeen}`,
            module: 'electron/agentLane（回合无活动超过 LANE_IDLE_MS 仍在运行态）',
            message: `Agent 回合在运行态已 ${Math.round(age / 1000)}s，最后一次模型活动在 ${Math.round((now - lastModelActivity) / 1000)}s 前，也没有等人回答的卡`,
            snapshot: { spinner },
          })
        }
        continue
      }
      if (settleLabel && present) {
        await violate({
          invariant: 5, rule: 'spinner-without-deadline', key: `${spinner.owner}|${spinner.desc}|${settleLabel}`,
          module: spinner.owner === 'task-card' ? 'src/workbench/taskCenter（制作任务卡）' : spinner.owner?.startsWith('agent') ? 'src/workbench/ai/v4（Agent 面板）' : `页面（${spinner.owner}）`,
          message: `「${settleLabel}」时这个转圈还在（已 ${Math.round(age / 1000)}s），它没有登记时限，而它等的事已经结束（Run：${runs.map((run) => `${run.runId.slice(-6)}=${run.status}`).join('、') || '无'}）`,
          snapshot: { spinner, runs: runs.map((run) => ({ runId: run.runId, status: run.status, jobs: (run.jobs ?? []).map((job) => ({ shotId: job.metadata?.shotId, status: job.status })) })) },
        })
      }
    }
  }

  /**
   * 制作 Run 的过渡态（pausing）：它等的只是「在飞的那几镜收尾」。在飞的都收尾了、又过了调度器一轮（settle 已等过），
   * 它还停在 pausing，就是一个永远不会自己收场的状态——界面上那句「收尾后自动落停」也就永远不兑现。
   */
  const IN_FLIGHT_JOB = new Set(['submit_intent_persisted', 'submitting', 'provider_accepted', 'polling', 'retry_wait', 'downloading',
    'validating_technical', 'validating_content', 'reconciling', 'cancel_requested'])
  async function checkRunStates(settleLabel) {
    for (const run of readRuns()) {
      if (run.status !== 'pausing') continue
      const inFlight = (run.jobs ?? []).filter((job) => IN_FLIGHT_JOB.has(job.status))
      if (inFlight.length) continue
      await violate({
        invariant: 5, rule: 'run-stuck-pausing', key: run.runId,
        module: 'electron/productionRun/multiShotBatchScheduler.ts（多镜调度器从不把 pausing 收成 paused）/ productionRunDriverOps.ts（收尾函数只有旧驱动在调）',
        message: `「${settleLabel}」时 Run ${run.runId.slice(-8)} 仍是 pausing，而它的镜头没有一个还在飞（${(run.jobs ?? []).map((job) => job.status).join('、') || '无 job'}）——这个「暂停中」永远不会自己落到「已暂停」`,
        snapshot: { run: { runId: run.runId, status: run.status, revision: run.revision, jobs: (run.jobs ?? []).map((job) => ({ shotId: job.metadata?.shotId, status: job.status, errorCode: job.errorCode ?? null, providerTaskId: job.providerTaskId ?? null })) } },
      })
    }
  }

  // ── 铁律 6：用户没动的东西不会自己动 ────────────────────────────────────────────────────────

  async function checkSurfaces(probe) {
    if (!probe) return
    for (const change of probe.surfaces ?? []) {
      if (change.at <= surfaceCursor || change.at < started) continue
      surfaceCursor = Math.max(surfaceCursor, change.at)
      // 归因窗口：一步的动作收尾（t1）之后，页面还要一次 React 提交 + 一帧才把它画出来，页内观察者 250ms 采一次——
      // 这是**测量**的误差，不是产品的时限，所以只在这里给一个量级上够用的宽限。
      // 从最近的一步往回找：前一步的宽限期和下一步的开头会重叠，归给更晚开始的那一步。
      const step = [...steps].reverse().find((entry) => change.at >= entry.t0 && change.at <= (entry.t1 ?? Date.now()) + ATTRIBUTION_GRACE_MS)
      const allowed = step && (step.surfaces.includes(change.key) || step.surfaces.includes('*'))
      if (allowed) continue
      if (change.key === 'canvasViewport' && step?.user && step.surfaces.includes('canvasGesture')) continue
      const who = step ? (step.user ? `用户这一步「${step.label}」没有声明它` : `这一步「${step.label}」里用户没有动它`) : '两步之间没有任何用户动作'
      await violate({
        invariant: 6, rule: `surface-${change.key}`, key: `${change.key}|${change.from}|${change.to}|${step?.label ?? 'between'}`,
        module: change.key === 'storyboardTable' || change.key === 'workspaceMode'
          ? 'src/workbench/workbenchDocumentSlice.ts setStoryboardPlan（shouldReveal）/ generationCanvas/agent/applyCanvasToolCall.ts'
          : change.key === 'creationSelection'
            ? 'src/workbench/workbenchDocumentSlice.ts addStoryboardDesign（新建方案时顺手把 activeStoryboardId 设成它）← src/workbench/creation/storyboard/agentStoryboardDesign.ts upsertAgentStoryboardDesign（Agent 起草多镜落进创作页左栏）'
            : change.key === 'canvasViewport' ? '画布视口（谁在替用户挪视角）' : `面：${change.key}`,
        message: `「${change.key}」自己从「${change.from}」变成了「${change.to}」——${who}`,
        snapshot: { change, step: step ?? null, recentInputs: (probe.inputs ?? []).filter((input) => Math.abs(input.at - change.at) < 5000) },
      })
    }
  }

  // ── 铁律 7：看得见、关得掉 ────────────────────────────────────────────────────────────────

  async function checkOverlays() {
    let layers = []
    // 先等画面停稳再量：提示是从右边滑进来的，滑到一半量到的「伸出窗口」是动画，不是布局。
    // 停不下来（有东西一直在动）就照量——那时量到的就是用户此刻看到的。
    await waitForVisualQuiescence(win()).catch(() => undefined)
    try {
      layers = await win().evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.01
        const W = window.innerWidth
        const H = window.innerHeight
        const inside = (rect) => rect.left >= -1 && rect.top >= -1 && rect.right <= W + 1 && rect.bottom <= H + 1
        const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) } }
        const selectors = ['.mantine-Notification-root', '[role="dialog"]', '[role="alertdialog"]', '[data-v4-popover]', '[data-nomi-select-dropdown]', '[data-spend-confirm-dialog]']
        const seen = new Set()
        const out = []
        for (const selector of selectors) {
          for (const el of document.querySelectorAll(selector)) {
            if (seen.has(el) || !visible(el)) continue
            seen.add(el)
            const rect = el.getBoundingClientRect()
            if (rect.width < 2 || rect.height < 2) continue
            const closers = [...el.querySelectorAll('button[aria-label*="关闭"],button[aria-label*="lose" i],.mantine-Notification-closeButton,.mantine-CloseButton-root,[data-v4-control="slot-dismiss"]')]
              .filter(visible).map((button) => {
                const r = button.getBoundingClientRect()
                const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
                return { rect: rectOf(button), inViewport: inside(r), hittable: Boolean(at) && (at === button || button.contains(at)), label: button.getAttribute('aria-label') ?? '' }
              })
            out.push({ selector, text: String(el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), rect: rectOf(el), inViewport: inside(rect), closers, viewport: { width: W, height: H } })
          }
        }
        return out
      })
    } catch { return }
    for (const layer of layers) {
      const tag = `${layer.selector}|${layer.text.slice(0, 60)}|${layer.viewport.width}x${layer.viewport.height}`
      if (!layer.inViewport) {
        await violate({
          invariant: 7, rule: 'overlay-out-of-viewport', key: tag,
          module: layer.selector.includes('Notification') ? 'src/ui/toast.tsx（Mantine 通知容器 / 提示宽度）' : `弹出层 ${layer.selector}`,
          message: `弹出层伸出了窗口（${layer.viewport.width}×${layer.viewport.height}）：${JSON.stringify(layer.rect)}「${layer.text.slice(0, 60)}」`,
          snapshot: { layer },
        })
      }
      for (const closer of layer.closers) {
        if (closer.inViewport && closer.hittable) continue
        await violate({
          invariant: 7, rule: 'close-button-unreachable', key: `${tag}|${closer.label}`,
          module: layer.selector.includes('Notification') ? 'src/ui/toast.tsx' : `弹出层 ${layer.selector}`,
          message: `关闭钮${closer.inViewport ? '被别的东西盖住，点不到' : '在视口外'}（窗口 ${layer.viewport.width}×${layer.viewport.height}，钮 ${JSON.stringify(closer.rect)}）：「${layer.text.slice(0, 60)}」`,
          snapshot: { layer, closer },
        })
      }
    }
    if (locale === 'en') {
      try {
        await expectNoCjkInEnglishDom(win(), { message: 'EN 界面出现中文' })
      } catch (error) {
        const text = String(error?.message ?? error)
        // 夹具模型的显示名（目录里只给了 labelZh）是夹具自己的中文，不是界面漏译：只剩它们时记一笔，不判违反。
        const offenders = [...text.matchAll(/“([^”]*)”/g)].map((match) => match[1])
        // 去掉夹具模型名之后还剩中文，才是界面自己的字（「Switch to … · Fixture 图片 B」这种按钮里只有模型名是中文）。
        const residue = (value) => [...FIXTURE_MODEL_LABELS].sort((a, b) => b.length - a.length).reduce((rest, label) => rest.split(label).join(''), value)
        if (offenders.length && offenders.every((value) => !/[㐀-鿿]/.test(residue(value)))) {
          if (!notes.some((note) => note.kind === 'cjk-only-fixture-model-labels')) notes.push({ at: Date.now(), kind: 'cjk-only-fixture-model-labels', offenders })
          return
        }
        await violate({
          invariant: 7, rule: 'cjk-in-english-ui', key: text.split('\n').slice(1, 4).join('|'),
          module: 'i18n（硬编码中文 / 走错分支 / 缺 en 值）',
          message: text.split('\n')[0].slice(0, 200),
          snapshot: { detail: text.slice(0, 4000) },
        })
      }
    }
  }

  /** 7c：中文界面的提示 / 报错里原样出现供应商英文原话（6 个以上连续英文词）。toast 与就地的状态行（role=status/alert）都算。 */
  async function checkRawEnglish(probe) {
    if (locale !== 'zh-CN' || !probe) return
    const sentence = /[A-Za-z][A-Za-z'`’-]*(?:[\s,.:;()]+[A-Za-z][A-Za-z'`’-]*){5,}/
    const inline = await win().evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"]')]
      .filter((el) => el.getClientRects().length > 0 && !el.closest('[data-user-content]'))
      .map((el) => String(el.innerText ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => [])
    const sources = [...Object.values(probe.toasts ?? {}), { id: 'inline-status', texts: inline }]
    const labelledQuote = uiText('zh-CN', PROVIDER_MESSAGE_LABEL_KEY).trim()
    for (const toast of sources) {
      for (const text of toast.texts ?? []) {
        // 节点错误卡里「服务商原话：…」是**标明了**的原话，不算混入。
        if (text.includes(labelledQuote)) continue
        const match = sentence.exec(text)
        if (!match) continue
        await violate({
          invariant: 7, rule: 'raw-english-in-chinese-ui', key: `${toast.id}|${match[0].slice(0, 40)}`,
          module: toast.id === 'inline-status'
            ? 'src/workbench/production/productionShotActions.ts reportResult（把主进程的英文 message 原样拼在兜底文案前）'
            : 'src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts（providerFailed 把 classifyGenerationError 的原话拼进提示）',
          message: `中文界面的${toast.id === 'inline-status' ? '状态行' : '提示'}里原样出现英文原话：「${match[0].slice(0, 80)}」`,
          snapshot: { source: toast.id, text: text.slice(0, 400) },
        })
      }
    }
  }

  // ── 铁律 8：不白烧 token ─────────────────────────────────────────────────────────────────

  function readTranscriptMessages() {
    try {
      return readLaneTranscripts(projectRoot).flatMap((session) => laneMessages(session).map((message) => ({ session: session.laneName, message })))
    } catch (error) {
      notes.push({ at: Date.now(), kind: 'transcript-unreadable', message: String(error?.message ?? error).split('\n')[0] })
      return null
    }
  }

  /** 每一回合（一条用户输入到下一条之间）里所有模型请求的输入之和——用户在轨迹里看到的「一回合几十万」就是它。 */
  function tokenTurns(messages) {
    const turns = []
    for (const { session, message } of messages ?? []) {
      if (message.role === 'nomi.input' || message.role === 'user') {
        turns.push({ session, prompt: String(typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).slice(0, 60), requests: 0, inputSum: 0, maxInput: 0 })
      } else if (message.role === 'assistant' && message.usage && turns.length) {
        const turn = turns.at(-1)
        const input = Number(message.usage.input) || 0
        turn.requests += 1
        turn.inputSum += input
        turn.maxInput = Math.max(turn.maxInput, input)
      }
    }
    return turns
  }

  /** Agent 工具失败（转录里的 isError 结果）：逐条记进报告；「上一笔还没收场」这种卡死态判铁律 5。 */
  const toolFailuresSeen = new Set()
  async function checkAgentToolFailures(messages) {
    for (const { session, message } of messages ?? []) {
      if (message.role !== 'toolResult' || !message.isError) continue
      const id = `${session}|${message.toolCallId}`
      if (toolFailuresSeen.has(id)) continue
      toolFailuresSeen.add(id)
      const text = (message.content ?? []).map((part) => part?.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
      notes.push({ at: message.timestamp ?? Date.now(), kind: 'agent-tool-failed', tool: message.toolName, text: text.slice(0, 300) })
      if (!/already has an unfinished operation/i.test(text)) continue
      const receiptFile = path.join(projectRoot, '.nomi', 'project-agent-proposal-receipt.json')
      const receipt = fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : null
      await violate({
        invariant: 5, rule: 'agent-write-receipt-stuck', key: receipt?.operationId ?? text.slice(0, 80),
        module: 'electron/agentLane/laneDesktopTools.ts（write 得到 capability_receipt_unresolved 时既不放弃也不提交回执）+ electron/capabilityCore/projectAgentProposalReceiptStore.ts（preparing 没有时限、没有收场，之后每一次写都被「上一笔没收场」挡掉）',
        message: `Agent 的写操作回执停在「${receipt?.lifecycle ?? '?'}」再也不收场：之后的 ${message.toolName} 一律失败（「${text.slice(0, 80)}」）`,
        snapshot: { failure: text, receipt: receipt ? { lifecycle: receipt.lifecycle, revision: receipt.revision, operationId: receipt.operationId, summary: receipt.proposal?.summary } : null },
      })
    }
  }

  async function checkTokens() {
    const messages = readTranscriptMessages()
    if (!messages) return
    await checkAgentToolFailures(messages)
    const assistants = messages.filter(({ message }) => message.role === 'assistant' && message.usage)
    for (const { session, message } of assistants.slice(tokenMessagesSeen)) {
      const input = Number(message.usage.input) || 0
      tokenRows.push({ session, input, output: Number(message.usage.output) || 0, cacheRead: Number(message.usage.cacheRead) || 0, at: message.timestamp ?? null, model: `${message.provider}/${message.model}` })
      if (input > limits.agentInputTokensPerRequest.value) {
        await violate({
          invariant: 8, rule: 'input-tokens-over-budget', key: `${session}|${message.timestamp}|${input}`,
          module: 'electron/agentLane/laneContextBudget.mts（压缩没守住）/ laneTools.mts（工具结果没截断）',
          message: `一次模型请求的输入 ${input} token，超过上限 ${limits.agentInputTokensPerRequest.value}（${limits.agentInputTokensPerRequest.source}）`,
          snapshot: { session, usage: message.usage, limit: limits.agentInputTokensPerRequest },
        })
      }
    }
    tokenMessagesSeen = assistants.length
  }

  // ── 铁律 9：不显示没用的东西 ────────────────────────────────────────────────────────────────

  async function checkNuisance(probe) {
    if (!probe) return
    for (const pill of Object.values(probe.versionPills ?? {})) {
      if (!/^1\s*(版|versions?)$/i.test(pill.label)) continue
      await violate({
        invariant: 9, rule: '9a-single-version-pill', key: pill.node,
        module: 'src/workbench/generationCanvas/nodes/NodeResultStack.tsx（showSingleProductionAction → CardStackPeeks forceTrigger）',
        message: `节点 ${pill.node} 只有 1 版，却显示「${pill.label}」`,
        snapshot: { pill },
      })
    }
    const now = Date.now()
    for (const label of Object.values(probe.savedLabels ?? {})) {
      const shown = (label.gone ?? now) - label.firstSeen
      if (shown <= limits.savedFeedbackWindowMs.value + 400) continue
      await violate({
        invariant: 9, rule: '9b-saved-label-lingers', key: label.node,
        module: 'src/workbench/observability/useGenerationFeedback.ts（回执窗口过了没人再渲一帧）',
        message: `节点 ${label.node} 的「已保存到项目」挂了 ${Math.round(shown / 1000)}s，登记窗口是 ${limits.savedFeedbackWindowMs.value}ms（${limits.savedFeedbackWindowMs.source}）`,
        snapshot: { label },
      })
    }
    const failures = submissions.filter((submission) => submission.behavior?.fail || submission.behavior?.reject || submission.behavior?.corruptResult).length
    for (const toast of Object.values(probe.toasts ?? {})) {
      if (toast.maxOccurrences <= Math.max(1, failures)) continue
      await violate({
        invariant: 9, rule: '9c-repeated-toast', key: toast.id,
        module: 'src/workbench/generationCanvas/nodes/useNodeModelAutoSelect.ts（effect 每次重跑都 push 同一条提示）',
        message: `同一条提示叠到了「×${toast.maxOccurrences}」，而供应商那边只失败了 ${failures} 次`,
        snapshot: { toast, failures },
      })
    }
  }

  // ── 一次完整核对 ───────────────────────────────────────────────────────────────────────────

  async function check(label, { settleLabel = null } = {}) {
    await ensureProbe()
    const probe = await readPageProbe(win()).catch(() => null)
    await checkEgress()
    await checkSubmissions()
    await checkReceipts()
    await checkAttachments()
    await checkUiClaims(probe)
    if (settleLabel) await checkRunStates(settleLabel)
    await checkSpinners(probe, { settleLabel })
    await checkSurfaces(probe)
    await checkOverlays()
    await checkRawEnglish(probe)
    await checkTokens()
    await checkNuisance(probe)
    lastCheckAt = Date.now()
    return probe
  }

  /**
   * 一步。`user`：这是不是用户的动作；`surfaces`：这一步里允许变化的面（'*' = 都行，'canvasGesture' = 视口随手势动）。
   * 动作本身失败（点不到、等不到）记成**步骤失败**（不是铁律违反），默认继续走；`critical` 的步骤失败会让剧本停下。
   */
  async function step(label, action, { user = true, surfaces = [], critical = false } = {}) {
    await ensureProbe()
    const entry = { label, user, surfaces, t0: Date.now(), t1: null, ok: true, error: null }
    steps.push(entry)
    currentStep = entry
    console.log(`[full-walk] ▶ ${label}`)
    try {
      await action()
    } catch (error) {
      entry.ok = false
      entry.error = String(error?.stack ?? error).slice(0, 4000)
      const shot = await screenshot(`step-${String(steps.length).padStart(2, '0')}-FAIL`)
      entry.failShot = shot
      console.log(`[full-walk] ⚠ 步骤没走通：${label}：${String(error?.message ?? error).split('\n')[0]}`)
      // 主进程为什么拒 / 哪一步断了，常常只写在主进程日志里：步骤没走通时把尾巴留进报告。
      entry.mainLog = (mainLogTail?.() ?? []).slice(-40)
      if (critical) {
        entry.t1 = Date.now()
        await check(label).catch(() => undefined)
        currentStep = null
        throw error
      }
    }
    entry.t1 = Date.now()
    await check(label)
    currentStep = null
    return entry.ok
  }

  /**
   * 「此刻，用户发起的事都该收场了」的检查点。先按登记的节拍再给一轮机会（调度器一轮 + 付费卡 / 任务中心一拍），
   * 再判：没有登记时限、却还在转的，都算违反；卡的范围也在这里对账。
   */
  async function settle(label, { extraWaitMs = 0 } = {}) {
    const waitMs = limits.schedulerPollCapMs.value + limits.spendCardPollMs.value + extraWaitMs
    console.log(`[full-walk] ⏸ 收场检查点「${label}」（先等 ${waitMs}ms：调度器一轮 + 界面一拍）`)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    await checkConsentScopes()
    await check(label, { settleLabel: label })
  }

  function setLocale(next) { locale = next }

  async function finish({ error } = {}) {
    try { await check('收尾') } catch (checkError) { notes.push({ at: Date.now(), kind: 'final-check-failed', message: String(checkError?.message ?? checkError).split('\n')[0] }) }
    // 活体证明：页内观察者这一场到底看见了什么（没看见过一个转圈 / 一次面变化，「零违反」就不作数）。
    const probe = await readPageProbe(win()).catch(() => null)
    const now = Date.now()
    const probeSeen = probe ? {
      spinners: Object.values(probe.spinners ?? {}).map((spinner) => ({ owner: spinner.owner, kind: spinner.kind, desc: spinner.desc, durationMs: (spinner.gone ?? now) - spinner.firstSeen, stillThere: !spinner.gone }))
        .sort((a, b) => b.durationMs - a.durationMs).slice(0, 20),
      surfaceChanges: (probe.surfaces ?? []).length,
      trustedInputs: (probe.inputs ?? []).length,
      toasts: Object.values(probe.toasts ?? {}).length,
    } : null
    await checkConsentScopes().catch(() => undefined)
    const egressEntries = egress.read()
    const classified = classifyEgress(egressEntries, vendorHostsOf(path.join(settingsDir, 'model-catalog.json')))
    const report = {
      playbook, variant, locale, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started,
      completed: !error && steps.every((entry) => entry.ok),
      harnessError: error ? String(error?.stack ?? error).slice(0, 4000) : null,
      invariants: INVARIANTS.map((entry) => ({ id: entry.id, title: entry.title['zh-CN'], violations: violations.filter((violation) => violation.invariant === entry.id).length })),
      violations,
      steps: steps.map(({ label, user, ok, error: stepError, t0, t1, failShot, mainLog }) => ({ label, user, ok, error: stepError, durationMs: (t1 ?? Date.now()) - t0, failShot: failShot ?? null, ...(mainLog ? { mainLog } : {}) })),
      consents: consents.map((consent) => ({ ...consent, scope: consent.scope?.map(({ submissions: attached, ...rest }) => ({ ...rest, submissions: attached?.length ?? 0 })) })),
      submissions,
      egress: { guardReady: classified.guardReady, guardLayers: classified.guardLayers, guardErrors: classified.guardErrors, vendorAttempts: classified.vendor.length, otherHosts: [...new Set(classified.other.map((entry) => entry.host))] },
      tokens: tokenRows,
      tokenTurns: tokenTurns(readTranscriptMessages()),
      limits: Object.fromEntries(Object.entries(limits).map(([key, value]) => [key, { source: value.source, ...(typeof value.value === 'number' ? { value: value.value } : {}) }])),
      fixture: {
        textRequests: fixture.requests.length, images: fixture.images.length, videos: fixture.videos?.length ?? 0,
        // 计划外请求：App 自己发起、剧本没料到的调用。记下开头几句话，下一次给它配一个常驻应答（或者它本身就是发现）。
        unexpected: fixture.unexpected.map((record) => {
          const messages = record.body?.messages ?? []
          const textOf = (message) => (typeof message?.content === 'string' ? message.content : (message?.content ?? []).map((part) => part?.text ?? '').join(' '))
          return {
            path: record.path, at: record.at,
            system: textOf(messages.find((message) => message.role === 'system')).slice(0, 300),
            lastUser: textOf(messages.filter((message) => message.role === 'user').at(-1)).slice(0, 300),
            messageCount: messages.length,
          }
        }),
        standing: fixture.standingHits?.() ?? [],
      },
      probeInstalls,
      probeSeen,
      notes,
    }
    if (!classified.guardReady) {
      report.notes.push({ kind: 'guard-not-ready', message: `走查网络闸没报到，或该装的层没装全（要 ${REQUIRED_GUARD_LAYERS.join(' / ')}，装上的是 ${classified.guardLayers.join(' / ') || '无'}）：这一场「没漏到真供应商」不作数` })
    }
    fs.writeFileSync(path.join(outputDir, 'monitor-report.json'), JSON.stringify(report, null, 2))
    console.log(`[full-walk] ${playbook}/${variant}：${violations.length} 条违反，步骤 ${steps.filter((entry) => entry.ok).length}/${steps.length} 走通${error ? '，剧本中途故障' : ''}`)
    return report
  }

  return {
    step, settle, check, finish, setLocale,
    consentSpendCard, consentNodeGenerate, consentDialog, consentFullAuto, revokeConsents, recordDeclaredDefault, recordAttachment,
    violate, note: (entry) => notes.push({ at: Date.now(), ...entry }),
    readProject, readRuns, screenshot,
    get violations() { return violations },
    get steps() { return steps },
    get submissions() { return submissions },
    limits,
  }
}
