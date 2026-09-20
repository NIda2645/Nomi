// Historical project COPY → original editor → cold restart → original MP4 export.
// Uses the existing packaged launcher; never opens or changes the source project.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { clickOrFail, expect, screenshotSettled } from './_assert.mjs'
import { createRuntimeWalk } from './agent-runtime-walk-support.mjs'
import { repoRoot } from './_launchApp.mjs'
import { stationTimeout } from './_station-budget.mjs'

const require = createRequire(import.meta.url)
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const inside = (root, file) => {
  const relative = path.relative(root, file)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

// Resolve existing ancestors before creating anything, including symlink aliases.
export function validateEvidenceDirectory(sourcePath, outputPath) {
  const sourceRoot = fs.realpathSync(sourcePath)
  const missing = []
  let ancestor = path.resolve(outputPath)
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor))
    ancestor = path.dirname(ancestor)
  }
  const outputDir = path.join(fs.realpathSync(ancestor), ...missing)
  assert(outputDir !== sourceRoot && !inside(sourceRoot, outputDir), 'Evidence must not write inside the source project')
  const canonicalRepo = fs.realpathSync(repoRoot)
  assert(outputDir !== canonicalRepo && !inside(canonicalRepo, outputDir), 'Evidence must be outside the source tree')
  assert(!fs.existsSync(outputDir), 'Use a new evidence directory; never overwrite a previous receipt')
  return { sourceRoot, outputDir }
}

export function assertNewSourceClip(before, after, media) {
  const oldIds = new Set(before.map(clip => clip.id))
  assert.equal(after.length, before.length + 1)
  const added = after.filter(clip => !oldIds.has(clip.id))
  assert.equal(added.length, 1, 'Identify the new clip by id, even when this source was already on the timeline')
  for (const id of oldIds) assert(after.some(clip => clip.id === id), 'Adding must retain existing clips')
  assert.equal(added[0].sourceNodeId, media.id)
  assert.equal(added[0].url, media.result.url)
  return added[0]
}

export function fileHashes(root) {
  const result = {}
  const visit = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, item.name)
      assert(!item.isSymbolicLink(), `Source/copy must not contain links: ${file}`)
      if (item.isDirectory()) visit(file)
      else {
        assert(item.isFile(), `Unsupported filesystem entry: ${file}`)
        result[path.relative(root, file)] = sha256(fs.readFileSync(file))
      }
    }
  }
  visit(root)
  return result
}

export function prepareOldProjectCopy(sourcePath, projectsDir) {
  const sourceRoot = fs.realpathSync(sourcePath)
  const sourceHashes = fileHashes(sourceRoot)
  const manifest = path.join('.nomi', 'project.json')
  const original = readJson(path.join(sourceRoot, manifest))
  assert.equal(original.version, 2, 'This journey covers an actual historical workspace v2, not invented migration states')
  const designs = Object.values(original.payload.storyboardDesignsByDocumentId ?? {}).flat()
  const design = designs.find(item => item.plan.shots.some(shot => !shot.prompt.includes('@[')))
  assert(design, 'Source needs an existing original storyboard design')
  const canvas = original.payload.generationCanvas
  const media = canvas.nodes.find(node => node.result?.type === 'image' && /\.jpe?g$/i.test(node.result.url))
  assert(media, 'Source must contain an existing real JPG result; SVG-only seeds do not qualify')
  const uri = new URL(media.result.url)
  assert.equal(uri.protocol, 'nomi-local:')
  assert.equal(uri.hostname, 'asset')
  const [projectId, ...assetParts] = uri.pathname.slice(1).split('/').map(decodeURIComponent)
  assert.equal(projectId, original.id)
  const mediaFile = path.resolve(sourceRoot, ...assetParts)
  assert(inside(sourceRoot, mediaFile), 'Source result must belong to the copied project')
  assert.equal(fs.readFileSync(mediaFile).subarray(0, 3).toString('hex'), 'ffd8ff', 'Result bytes must be JPEG')
  const copyRoot = path.resolve(projectsDir, 'historical-project-copy')
  assert(!inside(sourceRoot, copyRoot) && sourceRoot !== copyRoot, 'Copy must be separate from source')
  fs.mkdirSync(projectsDir, { recursive: true })
  fs.cpSync(sourceRoot, copyRoot, { recursive: true, errorOnExist: true, force: false })
  assert.deepEqual(fileHashes(copyRoot), sourceHashes, 'Open an exact byte copy, without rewriting ids, claims or paths')
  return { sourceRoot, sourceHashes, original, design, media, copyRoot, manifest }
}

// Only the existing category migration's absent → shot-frame backfill is allowed.
// All other node fields, result/history, reference bindings, edges and groups stay exact.
export function assertCanvasPreserved(actual, original) {
  const normalized = structuredClone(actual.nodes)
  for (const node of normalized) {
    const before = original.nodes.find(item => item.id === node.id)
    if (before && !before.renderKind && before.categoryId === 'shots'
      && !['whiteboard', 'audio', 'character', 'scene'].includes(before.kind)
      && node.renderKind === 'shot-frame') delete node.renderKind
  }
  assert.deepEqual(normalized, original.nodes, 'Old graph nodes/results/history/bindings must survive')
  assert.deepEqual(actual.edges, original.edges)
  assert.deepEqual(actual.groups ?? [], original.groups ?? [])
}

async function hashLargeFile(file) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function main() {
  const args = process.argv.slice(2)
  const take = flag => {
    const index = args.indexOf(flag)
    assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `Required: ${flag} <absolute path>`)
    return args.splice(index, 2)[1]
  }
  const sourcePath = take('--source-project'), executable = take('--packaged'), outputPath = take('--output-dir')
  assert.equal(args.length, 0, 'Unknown arguments')
  for (const value of [sourcePath, executable, outputPath]) assert(path.isAbsolute(value), 'Use absolute paths')
  assert.equal(process.platform, 'darwin', 'This is the macOS candidate journey; Windows remains unverified')
  const { sourceRoot: source, outputDir } = validateEvidenceDirectory(sourcePath, outputPath)
  fs.mkdirSync(outputDir, { recursive: true })
  process.argv = [process.argv[0], process.argv[1], '--packaged', executable]
  const walk = await createRuntimeWalk('core-a-old-project')
  walk.report.outputDir = outputDir
  let copy, failure, win
  const snap = async label => {
    const file = path.join(outputDir, `${walk.report.screenshots.length + 1}-${label}.png`)
    await screenshotSettled(win, { path: file })
    walk.report.screenshots.push(file)
  }
  try {
    copy = prepareOldProjectCopy(source, path.join(walk.report.tempRoot, 'projects'))
    const { original, design, media, copyRoot, sourceHashes } = copy
    const readCopy = () => readJson(path.join(copyRoot, copy.manifest))
    const readDesign = () => readCopy().payload.storyboardDesignsByDocumentId[design.documentId].find(item => item.id === design.id)
    const originalCanvas = original.payload.generationCanvas
    const shot = design.plan.shots.find(item => !item.prompt.includes('@['))
    const editedPrompt = `${shot.prompt} 候选包副本保存验证。`
    const expectedPlan = structuredClone(design.plan)
    Object.assign(expectedPlan.shots.find(item => item.index === shot.index), { prompt: editedPrompt, promptSegments: [] })
    const appAsar = path.resolve(executable, '../../Resources/app.asar')
    walk.report.candidate = { executable, executableSha256: await hashLargeFile(executable), appAsar,
      appAsarSha256: await hashLargeFile(appAsar) }
    walk.report.source = { root: copy.sourceRoot, projectId: original.id, schema: original.version,
      manifestSha256: sourceHashes[copy.manifest], files: sourceHashes, updatedAt: original.updatedAt,
      boundary: 'Historical workspace v2 copy. No claim of legacy-v1, half-migrated or unsupported-format acceptance.' }
    walk.report.projectRoot = copyRoot
    walk.report.projectId = original.id
    walk.report.normalizationAllowance = 'projectV51ToV60Migration.ts: absent shots-category renderKind may become shot-frame; no other graph content change'
    const openOriginalEditor = async () => {
      const summaries = await win.evaluate(() => window.nomiDesktop.projects.listAsync())
      const project = summaries.find(item => item.id === original.id)
      assert(project, 'The copied historical project must be discovered by the packaged app')
      assert.equal(fs.realpathSync(project.rootPath), fs.realpathSync(copyRoot), 'The app must bind the COPY, never source')
      if (!win.url().includes(`projectId=${original.id}`)) {
        await clickOrFail(win.locator('[data-project-card]').filter({ hasText: original.name }), '打开旧项目副本')
      }
      await clickOrFail(win.getByRole('button', { name: '创作', exact: true }), '原创作区')
      const treeToggle = win.locator('[data-creation-resource-tree-toggle]:visible')
      await expect(treeToggle).toBeVisible()
      if (await treeToggle.getAttribute('data-creation-resource-tree-toggle') === 'expand') await clickOrFail(treeToggle, '展开原文稿侧栏')
      await clickOrFail(win.locator(`[data-storyboard-id="${design.id}"]`), '打开原分镜方案')
      const editor = win.locator('[data-storyboard-editor="true"]')
      await expect(editor).toBeVisible()
      await expect(editor.locator('[data-storyboard-bulkbar]')).toBeVisible()
      await expect(editor.locator('[data-storyboard-row]')).toHaveCount(design.plan.shots.length)
      return editor
    }
    ;({ win } = await walk.start({ first: true }))
    let editor = await openOriginalEditor()
    const prompt = editor.locator(`[data-storyboard-row="${shot.index}"] [data-storyboard-prompt-block] [contenteditable="true"]`).first()
    await expect(prompt).toHaveText(shot.prompt)
    await snap('historical-original-editor')
    await prompt.fill(editedPrompt)
    await expect.poll(() => readDesign().plan.shots.find(item => item.index === shot.index).prompt).toBe(editedPrompt)
    assert.deepEqual(readDesign().plan, expectedPlan, 'Editing one prompt preserves all author fields in every shot and anchor')
    assertCanvasPreserved(readCopy().payload.generationCanvas, originalCanvas)
    await snap('saved-original-editor')
    await walk.stopApp()
    ;({ win } = await walk.start())
    assert.notEqual(walk.report.launches[0].pid, walk.report.launches[1].pid, 'Cold restoration requires a new Electron process')
    editor = await openOriginalEditor()
    await expect(editor.locator(`[data-storyboard-row="${shot.index}"] [data-storyboard-prompt-block] [contenteditable="true"]`).first()).toHaveText(editedPrompt)
    assert.deepEqual(readDesign().plan, expectedPlan)
    assertCanvasPreserved(readCopy().payload.generationCanvas, originalCanvas)
    await snap('cold-restored-original-editor')

    // Original preview source card uses the same addGenerationNodeToTimelineEnd as canvas.
    await clickOrFail(win.getByRole('button', { name: '预览', exact: true }), '原预览区')
    const card = win.locator(`[data-testid="preview-source-shot"][data-node-id="${media.id}"]`)
    await expect(card).toBeVisible()
    await expect.poll(() => card.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
    const clipsBefore = readCopy().payload.timeline.tracks.flatMap(track => track.clips)
    await clickOrFail(card, '将旧项目真实 JPG 加入原时间轴')
    await expect.poll(() => readCopy().payload.timeline.tracks.flatMap(track => track.clips).length).toBe(clipsBefore.length + 1)
    const added = assertNewSourceClip(clipsBefore, readCopy().payload.timeline.tracks.flatMap(track => track.clips), media)
    walk.report.addedClipId = added.id
    await snap('old-jpg-on-original-timeline')
    const exportsDir = path.join(copyRoot, 'exports')
    const oldExports = new Set(fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir) : [])
    await clickOrFail(win.getByRole('button', { name: '导出 MP4', exact: true }).first(), '原 MP4 导出')
    const newExports = () => fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter(name => /\.mp4$/i.test(name) && !oldExports.has(name)) : []
    await expect.poll(() => newExports().length, { timeout: stationTimeout({ operations: 2 }) }).toBe(1)
    const exportPath = path.join(exportsDir, newExports()[0])
    const probe = () => {
      try {
        return JSON.parse(execFileSync(require('@ffprobe-installer/ffprobe').path,
          ['-v', 'error', '-show_streams', '-show_entries', 'format=duration', '-of', 'json', exportPath], { encoding: 'utf8', timeout: 10_000 }))
      } catch { return null } // A real export may have created its file before writing the MP4 trailer.
    }
    await expect.poll(() => {
      const data = probe()
      return Boolean(data?.streams?.some(stream => stream.codec_type === 'video') && Number(data?.format?.duration) > 0)
    }, { timeout: stationTimeout({ operations: 2 }) }).toBe(true)
    await snap('packaged-export-complete')
    assertCanvasPreserved(readCopy().payload.generationCanvas, originalCanvas)
    assert.deepEqual(readDesign().plan, expectedPlan)
    walk.report.export = { path: exportPath, sha256: await hashLargeFile(exportPath), probe: probe(), sourceNodeId: media.id, sourceResultId: media.result.id }
    walk.report.checks = { originalEditor: true, completeAuthorFields: true, graphAndResults: true, coldRestart: true, actualJpgDecoded: true, originalMp4Export: true }
    walk.report.unverified = ['Windows', 'Legacy-v1/half-migrated/unsupported project formats']
    assert.equal(walk.fixture.requests.length, 0, 'Opening/editing/exporting must not call an Agent supplier')
    assert.equal(walk.fixture.images.length, 0, 'Existing results must not regenerate')
  } catch (error) {
    failure = error
    if (win && !win.isClosed()) {
      try { await win.screenshot({ path: path.join(outputDir, 'FAIL.png') }) }
      catch (captureError) { console.error('Failure screenshot unavailable:', captureError.message) }
    }
  }
  try {
    await walk.stopApp()
    if (copy) {
      assert.deepEqual(fileHashes(copy.sourceRoot), copy.sourceHashes, 'Every source project file must remain untouched')
      walk.report.sourceUntouched = true
      walk.report.finalCopyFiles = fileHashes(copy.copyRoot)
    }
  } catch (error) { failure = failure ? new AggregateError([failure, error], 'Journey and preservation checks failed') : error }
  await walk.finish(failure)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
