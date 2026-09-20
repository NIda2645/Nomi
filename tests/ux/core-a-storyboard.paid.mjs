#!/usr/bin/env node
/* global process, localStorage, console */
// Opt-in real-provider acceptance. All writes/spend use the original UI/runner.
// NOMI_CORE_A_LIVE=1 node tests/ux/core-a-storyboard.paid.mjs [--packaged /absolute/Nomi] [--first-frame] [--resume-report /absolute/report.json]
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { expect } from '@playwright/test'
import { require as tsxRequire } from 'tsx/cjs/api'
import { launchNomiApp, repoRoot } from './_launchApp.mjs'
import { prepareIsolation, createBlankProject, readProjectPayload, realCatalogPath } from '../../evals/lib/isoApp.mjs'
import { AGENT_PANEL, DOCUMENT, chooseAssistantModel, expandResidentPanel, sendCreation, waitForV4TurnIdle, stopRuntimeApp } from './agent-runtime-walk-support.mjs'
import { laneMessages, readLaneTranscripts } from './agent-lane-observer.mjs'
import { proveProbe, expectAbsent } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'

assert.ok(!process.env.CI, 'Paid acceptance is forbidden in CI')
assert.equal(process.env.NOMI_CORE_A_LIVE, '1', 'Explicit NOMI_CORE_A_LIVE=1 is required; this journey spends real provider credit')
const { values } = parseArgs({ options: { packaged: { type: 'string' }, 'first-frame': { type: 'boolean', default: false }, 'resume-report': { type: 'string' }, 'verify-only': { type: 'boolean', default: false }, 'output-dir': { type: 'string' } } })
if (values.packaged) assert.ok(path.isAbsolute(values.packaged), '--packaged requires an absolute executable path')
const resumed = values['resume-report'] ? JSON.parse(fs.readFileSync(path.resolve(values['resume-report']), 'utf8')) : null
if (values['verify-only']) assert.ok(resumed?.firstFrame?.referenceProof && values['first-frame'], '--verify-only requires a completed first-frame receipt and --first-frame')
const tempRoot = resumed ? path.resolve(resumed.tempRoot) : fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-core-a-paid-'))
// Never prepareIsolation on resume: that owner intentionally deletes its target.
const iso = resumed ? (resumed.isolation ?? { projectsDir: path.join(tempRoot, 'projects'), settingsDir: path.join(tempRoot, 'settings'), chromiumDir: path.join(tempRoot, 'chromium'), capabilityDir: path.join(tempRoot, 'capability') }) : prepareIsolation(tempRoot)
if (resumed) {
  assert.equal(resumed.mode, values.packaged ? 'packaged' : 'source-build')
  assert.ok(resumed.projectId && resumed.runId && resumed.projectRoot)
  const relative = path.relative(iso.projectsDir, path.resolve(resumed.projectRoot))
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Resume project must belong to the original isolation')
  for (const directory of Object.values(iso)) {
    assert.ok(path.resolve(directory).startsWith(`${tempRoot}${path.sep}`))
    assert.ok(fs.statSync(directory).isDirectory())
  }
}
// Prove that this script copied the real catalog, including encrypted credentials,
// without changing prices, enabling models, or substituting provider endpoints.
if (!resumed) assert.ok(fs.readFileSync(realCatalogPath()).equals(fs.readFileSync(path.join(iso.settingsDir, 'model-catalog.json'))))
const catalog = JSON.parse(fs.readFileSync(path.join(iso.settingsDir, 'model-catalog.json'), 'utf8'))
const textModel = catalog.models.find(model => model.vendorKey === 'apimart' && model.modelKey === 'deepseek-v3.2' && model.enabled)
const imageModel = catalog.models.find(model => model.vendorKey === 'apimart' && model.modelKey === 'z-image-turbo' && model.enabled)
assert.ok(textModel && imageModel, 'Configured apimart deepseek-v3.2 and z-image-turbo must both be enabled')
const outputDir = path.resolve(values['output-dir'] || path.join(repoRoot, '.tmp', `core-a-storyboard-paid-${Date.now()}`))
fs.mkdirSync(outputDir, { recursive: true })
const report = { outputDir, tempRoot, mode: values.packaged ? 'packaged' : 'source-build', startedAt: new Date().toISOString(), launches: [], rounds: [], screenshots: [], results: [], platform: process.platform, windows: 'unverified', agentCost: 'unknown' }
report.isolation = iso
if (resumed) {
  report.resume = { from: path.resolve(values['resume-report']), previousStatus: resumed.status, previousResults: resumed.results ?? [] }
  report.rounds = resumed.rounds ?? []
  report.cancel = resumed.cancel
}
const options = {
  name: 'core-a-storyboard-paid', tempRoot, userDataDir: iso.chromiumDir, projectsDir: iso.projectsDir,
  settingsDir: iso.settingsDir, capabilityDir: iso.capabilityDir,
  ...(values.packaged ? { executablePath: values.packaged } : {
    initialLocalStorage: { 'nomi:locale:v1': 'zh-CN', 'nomi:splash:v1': 'seen', 'nomi:journey-tour:v1': 'seen', 'nomi:canvas-gesture-hint:v1': 'seen' },
  }),
  env: { NOMI_RENDERER_URL: '', VITE_DEV_SERVER_URL: '', NOMI_DESKTOP_DEV: '', NOMI_E2E_PRODUCTION_FIXTURE: '0', NOMI_DISABLE_AUTO_UPDATE: '1' },
}
const { createProductionRunRepository } = tsxRequire('../../electron/productionRun/productionRunRepository.ts', import.meta.url)
let gui, win, projectRoot, projectId, runId, repository, failure
const editedPrompt = 'A small white ceramic cup beside a sunlit window, warm morning light, clean editorial photograph, no text.'
const keyframePrompt = 'Static wide composition: one white ceramic cup on a wooden table beside a sunlit window, warm morning light, no text.'
const run = () => repository.read(projectId, runId)
const nodes = () => readProjectPayload(projectRoot)?.payload?.generationCanvas?.nodes ?? []
const boundNodes = () => nodes().filter(node => node.meta?.storyboardDesignId === runId)
const execution = () => ({ jobs: run()?.jobs ?? [], nodes: nodes().map(node => ({ id: node.id, runs: node.runs ?? [], result: node.result ?? null, taskId: node.progress?.taskId ?? null })) })
const identity = () => boundNodes().map(node => ({ nodeId: node.id, resultId: node.result?.id ?? null })).sort((a, b) => a.nodeId.localeCompare(b.nodeId))
const editor = () => win.locator(`[data-creation-run-editor="${runId}"]`)
const dialog = () => win.locator('[data-spend-confirm-dialog]')
function completedResults() {
  return nodes().filter(node => node.result?.id && node.meta?.storyboardDesignId).map(node => ({
    runId: node.meta.storyboardDesignId, nodeId: node.id, resultId: node.result.id, taskId: node.result.taskId ?? null,
    cost: node.result.provenance?.cost ?? 'unknown', costSource: 'result.provenance.cost', type: node.result.type,
  }))
}
function assertRemainingImage() {
  validateDraft()
  const shots = run().generationPlan.editorial.shots
  const done = boundNodes().filter(node => node.result?.url)
  assert.equal(done.length, 1, 'Resume/batch requires exactly one existing completed image')
  assert.equal(done[0].meta.shotId, shots[0].shotId, 'Only the first shot may already be complete')
  assert.equal(done[0].result.type, 'image')
  assert.ok(done[0].result.id && done[0].result.taskId)
  assert.equal(done[0].runs?.length, 1)
  assert.equal(done[0].runs[0].status, 'success')
  assert.equal(done[0].result.provenance?.provider, 'apimart')
  assert.equal(done[0].result.provenance?.modelKey, 'z-image-turbo')
  const pending = boundNodes().filter(node => node.meta.shotId === shots[1].shotId)
  assert.ok(pending.length <= 1)
  for (const node of pending) {
    assert.ok(!node.result && !node.runs?.length && !node.progress?.taskId, 'Remaining shot must never have been submitted')
  }
  assert.equal(nodes().filter(node => node.runs?.length || node.result).length, 1, 'No unrelated paid task may exist before continuation')
}
async function snap(label) {
  const file = path.join(outputDir, `${label}.png`)
  await win.screenshot({ path: file })
  report.screenshots.push(file)
}
async function start() {
  gui = await launchNomiApp(options)
  win = gui.win
  win.setDefaultTimeout(stationTimeout({ operations: 2 }))
  const info = await gui.app.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath(), userData: app.getPath('userData'), pid: process.pid }))
  assert.equal(info.packaged, Boolean(values.packaged))
  assert.equal(info.userData, iso.chromiumDir)
  assert.ok(win.url().startsWith('file:'), 'Acceptance must use the built application')
  if (!values.packaged) {
    assert.equal(path.resolve(info.appPath), repoRoot)
    info.buildStamp = JSON.parse(fs.readFileSync(path.join(repoRoot, 'dist', 'build-stamp.json'), 'utf8'))
    assert.deepEqual(info.buildStamp, JSON.parse(fs.readFileSync(path.join(repoRoot, 'dist-electron', 'build-stamp.json'), 'utf8')))
  }
  report.launches.push(info)
}
async function openPlan() {
  if (!win.url().includes(`projectId=${projectId}`)) {
    await win.locator('[data-project-card]').first().click()
  }
  await win.getByRole('button', { name: /^(创作|Create)$/ }).click()
  const treeToggle = win.locator('[data-creation-resource-tree-toggle]:visible')
  await expect(treeToggle).toBeVisible()
  if (await treeToggle.getAttribute('data-creation-resource-tree-toggle') === 'expand') await treeToggle.click()
  await win.locator(`[data-storyboard-run-id="${runId}"]`).click()
  await expect(editor()).toBeVisible()
  const collapse = win.locator('[data-creation-resource-tree-toggle="collapse"]:visible')
  if (await collapse.isVisible()) await collapse.click()
}
function trajectory() {
  if (!projectRoot) return { calls: [], results: [] }
  const calls = [], results = []
  for (const session of readLaneTranscripts(projectRoot)) for (const message of laneMessages(session)) {
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const part of message.content) if (part.type === 'toolCall') calls.push({ id: part.id, name: part.name, args: part.arguments })
    }
    if (message.role === 'toolResult') results.push({ id: message.toolCallId, name: message.toolName, isError: message.isError === true,
      text: (message.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n') })
  }
  return { calls, results }
}
function validateDraft() {
  const draft = run().generationPlan
  assert.equal(draft.shots.length, 2, 'Exactly two image shots are authorized')
  for (const shot of draft.shots) {
    assert.equal(shot.candidate.providerId, 'apimart')
    assert.equal(shot.candidate.modelId, 'z-image-turbo')
    assert.equal(shot.candidate.mode, 'text_to_image')
    assert.equal((shot.candidate.references ?? []).length, 0)
  }
  assert.equal(draft.editorial?.shots.length, 2, 'The original runner must read exactly the authorized two image shots')
  for (const shot of draft.editorial.shots) {
    assert.equal(shot.modelVendor, 'apimart')
    assert.equal(shot.modelKey, 'z-image-turbo')
    assert.equal(shot.shotKind, 'image')
    assert.ok(!shot.keyframe?.enabled)
    assert.equal((shot.anchorIds ?? []).length, 0)
    assert.equal(Object.values(shot.referenceBindings ?? {}).flat().length, 0)
  }
  assert.equal((draft.editorial?.anchors ?? []).length, 0)
}
async function approve(label) {
  assert.equal(values['verify-only'], false, 'Read-only verification cannot approve spending')
  validateDraft()
  await expect(dialog()).toBeVisible()
  report[label] = await dialog().innerText() // Real quotation; no fixture price or inferred final cost.
  await snap(label)
  await dialog().getByRole('button', { name: '生成', exact: true }).click()
}
async function assertRestored(expected) {
  await openPlan()
  await expect(editor().locator('[data-storyboard-prompt-block] [contenteditable="true"]').first()).toHaveText(editedPrompt)
  await expect(editor().locator('[data-storyboard-frame="done"]')).toHaveCount(2)
  await expect.poll(identity).toEqual(expected)
  await expect(editor().locator('[data-storyboard-frame] img')).toHaveCount(2)
  for (const img of await editor().locator('[data-storyboard-frame] img').all()) {
    await expect.poll(() => img.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  }
}
// Optional second paid journey: original row -> original two-wave confirmation.
async function firstFrameJourney() {
  assert.equal(values['verify-only'], false, 'Read-only verification cannot create or submit a new journey')
  const model = catalog.models.find(item => item.vendorKey === 'apimart' && item.modelKey === 'doubao-seedance-2.0' && item.enabled)
  assert.ok(model, 'The configured Seedance 2.0 model must be enabled')
  const imageRunId = runId
  const documentId = run().origin.sourceDocument.documentId
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'zh-CN'))
  await win.reload({ waitUntil: 'domcontentloaded' })
  await openPlan()
  await win.locator('[data-creation-resource-tree-toggle="expand"]:visible').click()
  await win.locator(`button[data-document-id="${documentId}"]:not([data-storyboard-id])`).click()
  await expandResidentPanel(win)
  await chooseAssistantModel(win, textModel.labelZh)
  await win.keyboard.press('Escape')
  const priorRuns = new Set(repository.list(projectId).map(item => item.runId))
  const before = trajectory()
  await sendCreation(win, '请新建另一个独立分镜方案，只含1镜视频，不修改已有图片方案。镜头为窗前白瓷杯缓慢推进镜头。使用apimart/doubao-seedance-2.0，taskKind=image_to_video，modeId=i2v，variantId=fast，parameters和分镜params均包含model=doubao-seedance-2.0-fast、duration=4、resolution=480p、generate_audio=false；durationSec=4。首帧keyframe.enabled=true，keyframe.modelVendor=apimart，modelKey=z-image-turbo，modeId=t2i，params={size:"16:9",resolution:"1K"}，prompt描述窗前白瓷杯的静态构图。没有任何锚卡、anchorIds、外部参考图或referenceBindings。仅创建草稿，不执行、不报价、不申请付费，创建后停止。')
  await waitForV4TurnIdle(win, { panel: AGENT_PANEL, doneTimeout: stationTimeout({ turns: 2 }) })
  const after = trajectory()
  const calls = after.calls.filter(call => !before.calls.some(item => item.id === call.id))
  const results = after.results.filter(result => calls.some(call => call.id === result.id))
  const created = repository.list(projectId).filter(item => !priorRuns.has(item.runId))
  report.rounds.push({ purpose: 'optional-first-frame', calls, results, succeeded: created.length === 1 && results.some(result => result.name === 'draft_shots' && !result.isError) })
  assert.equal(created.length, 1, 'Exactly one new first-frame plan must exist')
  runId = created[0].runId
  const validate = () => {
    const plan = run().generationPlan
    assert.equal(plan.shots.length, 1)
    assert.equal(plan.editorial?.shots.length, 1)
    assert.equal((plan.editorial.anchors ?? []).length, 0)
    const candidate = plan.shots[0].candidate, shot = plan.editorial.shots[0]
    assert.equal(candidate.providerId, 'apimart')
    assert.equal(candidate.modelId, 'doubao-seedance-2.0')
    assert.equal(candidate.mode, 'image_to_video')
    assert.equal(candidate.modeId, 'i2v')
    assert.equal((candidate.references ?? []).length, 0)
    assert.equal(shot.shotKind, 'video')
    assert.equal(shot.modelVendor, 'apimart')
    assert.equal(shot.modelKey, 'doubao-seedance-2.0')
    assert.equal(shot.modeId, 'i2v')
    assert.equal(shot.durationSec, 4)
    for (const params of [candidate.parameters, shot.params]) {
      assert.equal(params.model, 'doubao-seedance-2.0-fast')
      assert.equal(params.duration, 4)
      assert.equal(params.resolution, '480p')
      assert.equal(params.generate_audio, false)
    }
    assert.equal((shot.anchorIds ?? []).length, 0)
    assert.equal(Object.values(shot.referenceBindings ?? {}).flat().length, 0)
    assert.equal(shot.keyframe.enabled, true)
    assert.equal(shot.keyframe.modelVendor, 'apimart')
    assert.equal(shot.keyframe.modelKey, 'z-image-turbo')
    assert.equal(shot.keyframe.modeId, 't2i')
    assert.deepEqual(shot.keyframe.params, { size: '16:9', resolution: '1K' })
  }
  validate()
  await openPlan()
  await editor().getByRole('textbox', { name: '镜 1 首帧图提示词', exact: true }).fill(keyframePrompt)
  await expect.poll(() => run().generationPlan.editorial.shots[0].keyframe.prompt).toBe(keyframePrompt)
  validate()
  assert.equal(boundNodes().filter(node => node.result || node.runs?.length).length, 0)
  await editor().locator('[data-storyboard-row="1"] [data-storyboard-generate-state]').click()
  await expect(dialog()).toBeVisible()
  await expect.poll(() => boundNodes().length).toBe(2)
  const pending = boundNodes()
  const keyframe = pending.find(node => node.meta?.storyboardKeyframe === true)
  const video = pending.find(node => node.kind === 'video')
  assert.ok(keyframe && video)
  const edges = readProjectPayload(projectRoot).payload.generationCanvas.edges
  const dependency = edges.filter(edge => edge.target === video.id)
  assert.equal(dependency.length, 1)
  assert.ok(dependency.some(edge => edge.source === keyframe.id && edge.mode === 'first_frame'))
  assert.equal(video.meta.shotId, keyframe.meta.shotId)
  const quote = await dialog().innerText()
  assert.match(quote, /2\s*(张|个|项|次|份)/, 'Original confirmation must cover both media tasks')
  report.firstFrame = { runId, imageRunId, quote, keyframeNodeId: keyframe.id, videoNodeId: video.id }
  await snap('zh-first-frame-quote')
  validate()
  await dialog().getByRole('button', { name: '生成', exact: true }).click()
  await expect.poll(() => boundNodes().filter(node => node.result?.url).length, { timeout: stationTimeout({ turns: 3 }) }).toBe(2)
  await verifyFirstFrameResults(keyframePrompt)
}
async function verifyFirstFrameResults(keyframePrompt) {
  const done = boundNodes()
  assert.equal(done.length, 2)
  const frameDone = done.find(node => node.id === report.firstFrame.keyframeNodeId)
  const videoDone = done.find(node => node.id === report.firstFrame.videoNodeId)
  assert.ok(frameDone?.result?.url && videoDone?.result?.url)
  const plan = run().generationPlan
  assert.equal(plan.shots.length, 1)
  assert.equal(plan.editorial.shots.length, 1)
  assert.equal(plan.editorial.shots[0].keyframe.prompt, keyframePrompt)
  for (const params of [plan.shots[0].candidate.parameters, plan.editorial.shots[0].params, videoDone.result.provenance?.params?.extras]) {
    assert.equal(params.resolution, '480p')
    assert.equal(params.duration, 4)
    assert.equal(params.generate_audio, false)
    assert.equal(params.model, 'doubao-seedance-2.0-fast')
  }
  const dependency = readProjectPayload(projectRoot).payload.generationCanvas.edges.filter(edge => edge.target === videoDone.id)
  assert.equal(dependency.length, 1)
  assert.equal(dependency[0].source, frameDone.id)
  assert.equal(dependency[0].mode, 'first_frame')
  assert.equal(videoDone.meta.refSnapshot?.[frameDone.id], frameDone.result.id, 'Video must consume this exact keyframe result version')
  assert.ok(videoDone.runs[0].startedAt >= frameDone.runs[0].completedAt, 'Video wave starts after the keyframe completes')
  report.firstFrame.referenceProof = { edges: dependency, sourceResultId: frameDone.result.id, refSnapshot: videoDone.meta.refSnapshot, videoProvenance: videoDone.result.provenance }
  const serializedParams = JSON.stringify(videoDone.result.provenance?.params ?? {})
  assert.ok([frameDone.result.url, frameDone.result.providerUrl].filter(Boolean).some(url => serializedParams.includes(url)), 'Actual video provenance must include the generated keyframe URL')
  for (const node of done) {
    assert.equal(node.runs.length, 1, 'No retry or extra media task is authorized')
    assert.ok(node.result.taskId)
    report.results.push({ nodeId: node.id, resultId: node.result.id, taskId: node.result.taskId, cost: node.result.provenance?.cost ?? 'unknown', costSource: 'result.provenance.cost', type: node.result.type })
  }
  // Inspect the actual persisted files with the existing ffprobe owner in Node.
  // Playwright's Electron evaluate context supports neither require nor dynamic import.
  const { probeMediaMetadata } = tsxRequire('../../electron/export/mediaProbe.ts', import.meta.url)
  report.firstFrame.media = []
  for (const rawUrl of [frameDone.result.url, videoDone.result.url]) {
    const url = new URL(rawUrl)
    assert.equal(url.protocol, 'nomi-local:')
    assert.equal(url.hostname, 'asset')
    const [ownerId, ...parts] = url.pathname.slice(1).split('/').map(decodeURIComponent)
    assert.equal(ownerId, projectId)
    const filePath = fs.realpathSync(path.resolve(projectRoot, ...parts))
    const relative = path.relative(fs.realpathSync(projectRoot), filePath)
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative))
    report.firstFrame.media.push({ projectId, filePath, probe: await probeMediaMetadata(filePath) })
  }
  await openPlan()
  assert.ok(report.firstFrame.media[0].probe.width > 0 && report.firstFrame.media[0].probe.height > 0, 'Real first-frame bytes must decode')
  const videoProbe = report.firstFrame.media[1].probe
  assert.equal(videoProbe.kind, 'video')
  assert.ok(videoProbe.width > 0 && videoProbe.height > 0 && videoProbe.durationSeconds > 0)
  assert.ok(Math.abs(videoProbe.durationSeconds - 4) < 0.5, 'Provider output must match the authorized four seconds')
  // The vendor documents a resolution preset, not an exact pixel-size mapping.
  // Preserve the actual dimensions and mismatch; do not resize the product or
  // infer exact-pixel compliance from the locally recorded execution parameters.
  report.firstFrame.resolution = {
    requestedPreset: '480p', width: videoProbe.width, height: videoProbe.height,
    exactShortEdgeMatch: Math.min(videoProbe.width, videoProbe.height) === 480,
    pixelMapping: 'not-defined-in-provider-documentation',
    source: 'https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation.md',
    checkedAt: '2026-09-20',
  }
  assert.equal(videoProbe.hasAudio, false)
  const saved = identity()
  const executionBefore = execution()
  await snap('zh-first-frame-real-video')
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await stopRuntimeApp(gui.app)
  gui = undefined
  await start()
  await openPlan()
  await expect(editor().getByRole('textbox', { name: 'Keyframe image prompt for shot 1', exact: true })).toHaveValue(keyframePrompt)
  await expect(editor().locator('[data-storyboard-frame="done"]')).toHaveCount(1)
  await expect.poll(identity).toEqual(saved)
  assert.deepEqual(execution(), executionBefore)
  await snap('en-first-frame-cold-restored')
}

try {
  await start()
  if (resumed) {
    projectRoot = path.resolve(resumed.projectRoot)
    projectId = resumed.projectId
    runId = resumed.runId
    Object.assign(report, { projectRoot, projectId, runId })
    assert.equal(readProjectPayload(projectRoot).id, projectId)
    repository = createProductionRunRepository({ projectDirResolver: id => id === projectId ? projectRoot : null })
    validateDraft()
    assert.equal(run().generationPlan.editorial.shots[0].prompt, editedPrompt)
    const completedCount = boundNodes().filter(node => node.result?.url).length
    if (values['verify-only']) assert.equal(completedCount, 2, 'Read-only verification requires both original completed images; never submit missing work')
    if (completedCount === 1) assertRemainingImage()
    else {
      assert.equal(completedCount, 2, 'Resume requires one or two completed authorized images')
      assert.deepEqual(completedResults(), resumed.results, 'A completed-image resume must exactly match the saved provider receipts')
      assert.equal(nodes().filter(node => node.runs?.length || node.result).length, values['verify-only'] ? 4 : 2, 'Resume must contain exactly the authorized completed tasks')
      assert.equal(repository.list(projectId).length, values['verify-only'] ? 2 : 1, 'Do not create a duplicate first-frame plan on resume')
    }
    report.resume.completedBefore = completedResults()
    await openPlan()
    await expect(editor().locator('[data-storyboard-row="1"] [data-storyboard-frame]')).toHaveAttribute('data-storyboard-frame', 'done')
    await expect(editor().locator('[data-storyboard-frame="done"]')).toHaveCount(completedCount)
    const restoredImage = editor().locator('[data-storyboard-row="1"] [data-storyboard-frame] img')
    await expect.poll(() => restoredImage.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await snap('zh-resume-existing-paid-image')
  } else {
    projectRoot = await createBlankProject(win, iso.projectsDir)
    projectId = readProjectPayload(projectRoot).id
    assert.ok(projectId, 'The real project must have a persisted id')
    report.projectRoot = projectRoot
    report.projectId = projectId
    repository = createProductionRunRepository({ projectDirResolver: id => id === projectId ? projectRoot : null })
    const consent = win.getByRole('button', { name: '不分享', exact: true })
    if (await consent.isVisible()) await consent.click()
    await expect(win.locator(DOCUMENT)).toBeVisible()
    await win.locator(DOCUMENT).fill('清晨：第一镜，阳光穿过窗户照在桌上的白色陶瓷杯。第二镜，窗外一株绿色植物在晨光里。两张独立静态图片，不要视频，不要参考图。')
    await expandResidentPanel(win)
    await chooseAssistantModel(win, textModel.labelZh)
    await win.keyboard.press('Escape')
    const chosen = await win.evaluate(() => JSON.parse(localStorage.getItem('nomi.assistantModel') || 'null'))
    assert.equal(chosen?.vendorKey, 'apimart', 'UI must select the authorized provider')
    assert.equal(chosen?.modelKey, 'deepseek-v3.2')
    const requests = [
      '请读取当前文稿，创建一个恰好两镜的分镜方案草稿。每镜都是纯图片，taskKind=text_to_image，均使用已配置 apimart 的 z-image-turbo。不要视频、首帧、参考图或参考卡。不执行生成、不报价、不请求付费；只创建这一个两镜分镜草稿，完成后停止。',
      '上一轮尚未产生可选的两镜方案。请继续同一个任务：将当前文稿拆成恰好两镜图片分镜草稿，均使用 apimart/z-image-turbo，text_to_image，不要首帧或参考图。只创建草稿，不执行生成或付费。',
    ]
    for (let index = 0; index < requests.length; index++) {
      const before = trajectory()
      await sendCreation(win, requests[index])
      await waitForV4TurnIdle(win, { panel: AGENT_PANEL, doneTimeout: stationTimeout({ turns: 2 }) })
      const after = trajectory()
      const calls = after.calls.filter(call => !before.calls.some(prior => prior.id === call.id))
      const results = after.results.filter(result => calls.some(call => call.id === result.id))
      const created = repository.list(projectId)
      report.rounds.push({ round: index + 1, calls, results, createdRuns: created.map(item => item.runId), succeeded: created.length === 1 && results.some(result => result.name === 'draft_shots' && !result.isError) })
      assert.equal(nodes().filter(node => node.result || node.runs?.length).length, 0, 'Agent draft must not execute media')
      if (created.length) { assert.equal(created.length, 1); runId = created[0].runId; break }
    }
    assert.ok(runId, 'No real storyboard after the authorized maximum of two Agent rounds')
    report.runId = runId
    validateDraft()
    await openPlan()
    await expect(editor().locator('[data-storyboard-row]')).toHaveCount(2)
    await editor().locator('[data-storyboard-prompt-block] [contenteditable="true"]').first().fill(editedPrompt)
    await expect.poll(() => run().generationPlan.editorial?.shots[0].prompt).toBe(editedPrompt)
    await snap('zh-original-edited')
    const firstGenerate = () => editor().locator('[data-storyboard-row="1"] [data-storyboard-generate-state]')
    const beforeCancel = execution()
    await firstGenerate().click()
    const cancel = dialog().getByRole('button', { name: '取消', exact: true })
    const proof = await proveProbe(cancel, 'The original single-shot confirmation is present')
    await expect.poll(() => boundNodes().length).toBeGreaterThan(0)
    const materialized = boundNodes().map(node => node.id)
    await cancel.click()
    await expectAbsent(cancel, { provenBy: proof })
    assert.deepEqual(run().jobs ?? [], beforeCancel.jobs, 'Cancel must not schedule a Run job')
    for (const node of nodes()) {
      const prior = beforeCancel.nodes.find(item => item.id === node.id)
      assert.deepEqual(node.runs ?? [], prior?.runs ?? [], 'Cancel must not create a task/attempt')
      assert.deepEqual(node.result ?? null, prior?.result ?? null, 'Cancel must not create a result')
      assert.equal(node.progress?.taskId ?? null, prior?.taskId ?? null)
    }
    assert.deepEqual(boundNodes().map(node => node.id), materialized, 'Cancel preserves the materialized node')
    report.cancel = { nodesPreserved: materialized, newTasks: 0, newResults: 0 }
    await firstGenerate().click()
    await approve('zh-single-real-quote')
    await expect(editor().locator('[data-storyboard-row="1"] [data-storyboard-frame]')).toHaveAttribute('data-storyboard-frame', 'done', { timeout: stationTimeout({ operations: 12 }) })
    await expect.poll(() => boundNodes().filter(node => node.result?.url).length).toBe(1)
  }
  if (boundNodes().filter(node => node.result?.url).length !== 2) {
    const firstResult = identity().find(item => item.resultId)
    assertRemainingImage()
    await expect(editor().locator('[data-storyboard-frame="done"]')).toHaveCount(1)
    await expect(editor().locator('[data-storyboard-batch]')).toBeEnabled()
    await editor().locator('[data-storyboard-batch]').click()
    await approve('zh-batch-remaining-real-quote')
    await expect(editor().locator('[data-storyboard-frame="done"]')).toHaveCount(2, { timeout: stationTimeout({ operations: 12 }) })
    await expect.poll(() => boundNodes().filter(node => node.result?.url).length).toBe(2)
    assert.deepEqual(identity().find(item => item.nodeId === firstResult.nodeId), firstResult, 'Batch must not regenerate the completed first shot')
  }
  for (const node of boundNodes()) {
    assert.equal(node.runs?.length, 1, 'Exactly one paid attempt per authorized image; no automatic retry')
    assert.equal(node.runs[0].status, 'success')
    assert.equal(node.result?.type, 'image')
    assert.equal(node.result?.provenance?.provider, 'apimart')
    assert.equal(node.result?.provenance?.modelKey, 'z-image-turbo')
    assert.ok(node.result?.id && node.result?.taskId, 'Provider result/task identity must be persisted')
    report.results.push({ nodeId: node.id, resultId: node.result.id, taskId: node.result.taskId, cost: node.result.provenance?.cost ?? 'unknown', costSource: 'result.provenance.cost', type: node.result.type })
  }
  const expected = identity()
  await assertRestored(expected)
  await snap('zh-two-real-images')
  const completed = execution()
  await win.reload({ waitUntil: 'domcontentloaded' })
  await assertRestored(expected)
  assert.deepEqual(execution(), completed, 'Hot reload must not add tasks or replace results')
  await snap('zh-hot-restored')
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'en'))
  await stopRuntimeApp(gui.app)
  gui = undefined
  await start()
  await assertRestored(expected)
  assert.deepEqual(execution(), completed, 'Cold reopen must not add tasks or replace results')
  await snap('en-cold-restored')
  if (values['verify-only']) {
    report.firstFrame = structuredClone(resumed.firstFrame)
    runId = report.firstFrame.runId
    assert.deepEqual(completedResults(), resumed.results)
    await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'zh-CN'))
    await win.reload({ waitUntil: 'domcontentloaded' })
    await verifyFirstFrameResults(keyframePrompt)
    assert.deepEqual(completedResults(), resumed.results, 'Read-only verification must not add paid tasks')
  } else if (values['first-frame']) await firstFrameJourney()
} catch (error) {
  failure = error
  if (win && !win.isClosed()) { try { await snap('FAIL') } catch { /* Preserve original failure. */ } }
} finally {
  if (gui) { try { await stopRuntimeApp(gui.app) } catch (error) { failure ??= error } }
  if (projectRoot) report.results = completedResults() // Preserve actual paid output even when a later assertion fails.
  report.trajectory = trajectory()
  const completedCalls = report.trajectory.calls.filter(call => report.trajectory.results.some(result => result.id === call.id && !result.isError)).length
  report.toolSuccessRate = { successful: completedCalls, total: report.trajectory.calls.length }
  const draftCalls = report.trajectory.calls.filter(call => call.name === 'draft_shots')
  report.draftToolWriteRate = { successful: draftCalls.filter(call => report.trajectory.results.some(result => result.id === call.id && !result.isError)).length, total: draftCalls.length }
  report.roundSuccessRate = { successful: report.rounds.filter(round => round.succeeded).length, total: report.rounds.length }
  report.status = failure ? 'failed' : 'passed'
  report.error = failure ? String(failure.stack || failure) : undefined
  report.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`${report.status}: ${path.join(outputDir, 'report.json')}`)
  if (failure) { console.error(report.error); process.exitCode = 1 }
}
