#!/usr/bin/env node
// 剧本 PB07 · 「生成失败有几种，每一种说的都是真话」
//
// 已知问题（0.22.1，pb06 抓到「原因说错」之后的同一类）：失败原因只按 HTTP 状态码归类（400 一律「参数不被接受」），
// 结果已经送达却读不出来也被说成「服务商失败」并劝人换一家，完整可显示的图（IEND 之后带了尾数据）被本机判成解码失败。
// 真实创作者会遇到的三件事，依次发生在同一张卡上：
//   ① 供应商回「参数不对」（真的参数错误，不是模型下线）→ 卡上仍说「参数不被接受」——修复不能把这一类也改没；
//   ② 供应商说成功、给的字节读不出来 → 卡上说「生成的文件没能读出来」；运行记录里记着它发给了谁；
//      屏上不出现「切到另一家」这类劝换供应商的提示（结果已经送达，失败在本机，换一家不是解法）；
//   ③ 供应商说成功、给的是一张完整的 PNG（IEND 之后带了尾数据）→ 图照常落地成功（这一类以前被判 decode_failed）。
//
// 零花费：两家本机回环供应商（第二家只是为了让「切家提示」有资格出现——② 里它不出现才有证明力）；三笔都发给第一家。
// 夹具里「坏」的定义与宿主的落地判据是同一个（见 tests/ux/agent-runtime-fixture.mjs 的 undecodableJpegBytes / pngWithTrailingBytes）。
import { DEFAULT_TIMEOUT_MS, expect, expectAbsent, proveProbe } from '../../_assert.mjs'
import { panCanvasUntilInside } from '../../_canvasHit.mjs'
import { stationTimeout } from '../../_station-budget.mjs'
import { FIXTURE_IMAGE_MODEL, FIXTURE_VENDOR } from '../../agent-runtime-fixture.mjs'
import { clickNodeGenerate, zoomOutUntilVisible } from '../actions.mjs'
import { uiText } from '../invariants.mjs'
import { startPlaybook } from '../launch.mjs'

process.env.NOMI_WALK_UNPRICED_MODEL = '1'
// 卡片标题与提示词是用户自己写的内容：英文界面那一档就用英文写（界面漏译才是要抓的，用户写中文不是）。
const SEED_EN = process.env.NOMI_FULL_WALK_LOCALE === 'en'
const LOCALE = SEED_EN ? 'en' : 'zh-CN'
const reasonOf = (kind) => uiText(LOCALE, `generationCommon.observability.error.${kind}.reason`)
const CARD = 'kinds-card'
/** 一句真的参数错误（OpenAI 兼容形状：type=invalid_request_error、param 指向出错的参数、code 为 null）。 */
const PARAM_ERROR = "Invalid value for 'size': 4096x4096 is not supported by this model. Supported sizes are 1024x1024 and 1024x1536."

const base = { categoryId: 'shots', references: [], runs: [] }
const pb = await startPlaybook({
  id: 'pb07-failure-kinds',
  needs: ['loopbackProvider'],
  fixtureOptions: { extraImageVendor: true },
  seed: () => ({
    nodes: [{
      ...base, id: CARD, kind: 'image', title: SEED_EN ? 'Harbor at dusk' : '黄昏的港口', prompt: SEED_EN ? 'A quiet harbor at dusk, warm lamps on the water, cinematic' : '黄昏的安静港口，水面上有暖色的灯，电影感', position: { x: 200, y: 140 }, status: 'idle', history: [],
      meta: { modelKey: FIXTURE_IMAGE_MODEL, modelVendor: FIXTURE_VENDOR, imageModel: FIXTURE_IMAGE_MODEL, imageModelVendor: FIXTURE_VENDOR },
    }],
    groups: [],
    edges: [],
  }),
})
const { smoke, fixture, monitor } = pb
const win = () => smoke.win
const node = async () => ((await monitor.readProject())?.payload?.generationCanvas?.nodes ?? []).find((entry) => entry.id === CARD)
const card = () => win().locator(`[data-node-id="${CARD}"]`).first()
const toast = () => win().locator('.mantine-Notification-root')
const switchNotice = () => toast().filter({ hasText: /切到|Switch to/ })
// 三笔提交的结局按顺序排好：参数错误 → 读不出来 → 带尾数据的完整 PNG。
fixture.setMediaBehavior(({ index }) => {
  if (index === 0) return { reject: { status: 400, json: { error: { message: PARAM_ERROR, type: 'invalid_request_error', param: 'size', code: null } } } }
  if (index === 1) return { corruptResult: true }
  return { trailingBytesResult: true }
})
/** 打开项目时画布把唯一一张卡放得很大、标题与原因在窗口外：像人一样先缩小、再把整张卡（标题、原因、建议、按钮）拖进舞台再看。 */
const showWholeCard = async () => {
  await zoomOutUntilVisible(win(), card())
  // 顶栏压着舞台上沿：给卡留出一条顶边，标题行与原因（状态条）才不被顶栏盖住。
  await panCanvasUntilInside(win(), card(), { margin: { top: 110 } })
}
/** 这一次运行的记录：新起的那一条（id 不是上一次的），落盘后的样子。 */
const newRun = async (previousRunId) => {
  const run = (await node())?.runs?.[0]
  return run && run.id !== previousRunId ? run : null
}

let harnessError = null
try {
  let noticeProof = null
  let firstRunId = null
  let secondRunId = null

  await monitor.step('打开项目（从项目库）', () => smoke.openProject(), { surfaces: ['*'], critical: true })

  await monitor.step('① 点 ↑ 生成（供应商回「参数不对」）', async () => {
    await monitor.consentNodeGenerate(CARD, { label: '第一次生成' })
    await clickNodeGenerate(win(), CARD)
    await expect.poll(async () => (await newRun(null))?.status, { message: '这一次落成失败', timeout: stationTimeout({ operations: 4 }) }).toBe('error')
    const run = await newRun(null)
    firstRunId = run.id
    // 运行记录里记着这一次发给了谁——失败提示与健康记账点名的是它，不是「失败时节点碰巧选着谁」。
    expect(run.attempt, '失败的运行记录里带着这一次发给了哪家的哪个模型').toEqual({ vendorKey: FIXTURE_VENDOR, modelKey: FIXTURE_IMAGE_MODEL })
    await expect(card(), '卡上说的是「参数不被接受」——真的参数错误，这条话不能被「按上游原话归类」带没').toContainText(reasonOf('input'), { timeout: DEFAULT_TIMEOUT_MS })
    // 这是服务商那一侧的失败，本场又有第二家可切：切家提示有资格出现。它出现，就是下一步「不该出现」的基线。
    noticeProof = await proveProbe(switchNotice(), '服务商这一侧的失败（参数错误）会弹出切家提示（本场有第二家可切）')
    await showWholeCard()
    await monitor.screenshot('param-error-card')
  }, { surfaces: ['modal', 'canvasGesture', 'canvasViewport'] })

  await monitor.step('② 再点 ↑ 生成（供应商说成功，给的字节读不出来）', async () => {
    await monitor.consentNodeGenerate(CARD, { label: '第二次生成' })
    await clickNodeGenerate(win(), CARD)
    await expect.poll(async () => (await newRun(firstRunId))?.status, { message: '第二次落成失败', timeout: stationTimeout({ operations: 4 }) }).toBe('error')
    const run = await newRun(firstRunId)
    secondRunId = run.id
    expect(run.attempt, '第二次失败的运行记录也带着它发给了谁').toEqual({ vendorKey: FIXTURE_VENDOR, modelKey: FIXTURE_IMAGE_MODEL })
    await expect(card(), '卡上说的是「生成的文件没能读出来」，不是「参数不被接受」，也不是「服务商失败」').toContainText(reasonOf('outputUnreadable'), { timeout: DEFAULT_TIMEOUT_MS })
    // 结果已经送达、失败在本机：不劝换一家。上一条（参数错误）的切家提示也已随节点状态变化收走，不留一句过期的话。
    await expectAbsent(switchNotice(), { provenBy: noticeProof, message: '读不出产物这件事不劝换一家（结果已送达，失败在本机）' })
    await showWholeCard()
    await monitor.screenshot('unreadable-file-card')
  }, { surfaces: ['modal', 'canvasGesture', 'canvasViewport'] })

  await monitor.step('③ 再点 ↑ 生成（供应商说成功，给的是带尾数据的完整 PNG）', async () => {
    await monitor.consentNodeGenerate(CARD, { label: '第三次生成' })
    await clickNodeGenerate(win(), CARD)
    await expect.poll(async () => (await newRun(secondRunId))?.status, { message: '第三次落成成功（这一类以前被判 decode_failed）', timeout: stationTimeout({ operations: 4 }) }).toBe('success')
    const landed = await node()
    expect(landed?.status, '节点落成 success').toBe('success')
    expect(landed?.result?.url, '产物落进了项目（nomi-local 地址），不是供应商给的原始地址').toMatch(/^nomi-local:\/\//)
    await expectAbsent(switchNotice(), { provenBy: noticeProof, message: '成功之后屏上没有劝换供应商的提示' })
    await monitor.screenshot('trailing-bytes-landed')
  }, { surfaces: ['modal', 'canvasGesture', 'canvasViewport'] })

  await monitor.settle('收尾')
} catch (error) {
  harnessError = error
  console.error('[full-walk] pb07 故障：', error?.stack ?? error)
}
process.exit(await pb.finish(harnessError))
