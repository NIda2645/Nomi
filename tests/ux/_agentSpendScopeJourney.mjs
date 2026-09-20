// Extend the original spend walk: real Agent tools and original single-slot UI.
// This supplier has no durable execution adapter. No confirmation or media claim here.
import { clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_IMAGE_MODEL, FIXTURE_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import { APPROVAL_CARD, CANVAS_PANEL, COMPOSER, COMPOSER_PERMISSION, INTERVENTION_REJECT,
  createRuntimeWalk, hasToolResult, openCanvas, permissionTier, readProject, recorded, sendCanvas,
  waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'

/** @param {Awaited<ReturnType<typeof createRuntimeWalk>>} walk */
export async function checkSpendScopeJourney(walk, win) {
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1', 'zh-CN'))
  await win.reload({ waitUntil: 'domcontentloaded' })
  await clickOrFail(win.getByRole('button', { name: '返回项目库', exact: true }), '回原项目库建立独立 CJ1 项目')
  const { projectId, projectRoot } = await walk.newProject()
  await openCanvas(win)
  const panel = win.locator(CANVAS_PANEL)
  await clickOrFail(panel.locator(COMPOSER_PERMISSION), '退出前段全自动档')
  await clickOrFail(panel.locator(permissionTier('safe-auto')), '原权限菜单选择确认付费')
  await expect(panel.locator(COMPOSER)).toHaveAttribute('data-approval-mode', 'safe-auto')
  await expect(panel.locator(COMPOSER)).toHaveAttribute('data-spend-policy', 'confirm')
  const card = panel.locator(`${APPROVAL_CARD}[data-kind="spend"]`)
  const input = card.locator('[data-composer-host="panel"] [contenteditable="true"]')
  const size = card.locator('[data-parameter-chip="size"]')
  const pager = card.locator('[data-v4-block="pager"]')
  const graph = async () => {
    const canvas = (await readProject(win, projectId)).payload.generationCanvas
    return { nodes: canvas.nodes, edges: canvas.edges, groups: canvas.groups ?? [] }
  }
  const runs = () => win.evaluate(id => window.nomiDesktop.productionRuns.list(id), projectId)
  const readRun = operationId => win.evaluate(({ projectId, operationId }) => window.nomiDesktop.productionRuns.read(projectId, operationId), { projectId, operationId })
  const pending = async () => {
    const read = await win.evaluate(id => window.nomiDesktop.productionRuns.pendingSpend(id), projectId)
    expect(read.surface).toBe('ready')
    return read.rows
  }
  let turn = 0
  const toolTurn = async (name, args) => {
    const id = `CJ1_TOOL_${++turn}`, done = `${id}_DONE`
    const request = walk.fixture.expectText({ label: id, match: body => flattenRequestText(body).includes(id),
      reply: { type: 'tool', id, name, args } })
    const result = walk.fixture.expectText({ label: done, match: body => hasToolResult(body, id), reply: { type: 'text', text: done } })
    await sendCanvas(win, `${id}：执行这一条分镜操作，保留其他草稿。`)
    await recorded(request.received, id)
    await recorded(result.received, done)
    await waitForV4TurnIdle(win, { panel: CANVAS_PANEL, settledBy: panel.getByText(done, { exact: true }) })
  }
  const draft = async shots => {
    const before = new Set((await runs()).map(run => run.runId))
    await toolTurn('draft_shots', { shots })
    await expect.poll(async () => (await runs()).filter(run => !before.has(run.runId)).length).toBe(1)
    // IDs come from the real host; create schema intentionally forbids caller shotId.
    return (await runs()).find(run => !before.has(run.runId)).runId
  }
  const present = async (operationId, shotIds) => {
    await toolTurn('generate', { operationId, shotIds })
    await expect.poll(async () => (await pending()).find(row => row.operationId === operationId)?.shots.map(shot => shot.shotId)).toEqual(shotIds)
    await expect(card).toBeVisible()
  }
  const setScope = async scope => {
    const radio = pager.getByRole('radio', { name: scope === 'all' ? '全部' : '逐镜', exact: true })
    await clickOrFail(radio, `原付款卡范围 ${scope}`)
    await expect(radio).toHaveAttribute('aria-checked', 'true')
  }
  const pageTo = async index => {
    const current = /([1-3])\/3/.exec(await pager.innerText())
    expect(current, 'Pagination belongs to the three requested shots, not the 33-item plan').toBeTruthy()
    for (let step = 0; step < (index + 3 - Number(current[1])) % 3; step++) await clickOrFail(pager.locator('[data-v4-control="pager-next"]'), '原三卡翻页')
    await expect(pager).toContainText(`${index}/3`)
  }
  const makeShot = (index, role = 'shot') => ({ role, title: `CJ1 ${role} ${index}`, prompt: `CJ1_${role}_${index} 原始画面`,
    ...(role === 'anchor' ? { storyboard: { kind: 'character', carrier: 'visual' } } : {}),
    taskKind: 'text_to_image', candidate: { providerId: FIXTURE_VENDOR, modelId: FIXTURE_IMAGE_MODEL }, parameters: { size: '1024x1024' } })
  const baselineGraph = await graph()
  const operationId = await draft(Array.from({ length: 33 }, (_, index) => makeShot(index + 1, index < 3 ? 'anchor' : 'shot')))
  const originalShots = (await readRun(operationId)).generationPlan.shots
  expect(originalShots).toHaveLength(33)
  expect(originalShots.filter(shot => shot.role === 'anchor')).toHaveLength(3)
  const requestedIds = originalShots.slice(0, 3).map(shot => shot.shotId)
  // draft_shots on the canvas creates 33 media nodes and the existing shot table.
  // generate only presents the three requested confirmations; it must reuse them.
  await expect.poll(async () => (await graph()).nodes.length).toBe(baselineGraph.nodes.length + 34)
  const draftedGraph = await graph()
  const baselineIds = new Set(baselineGraph.nodes.map(node => node.id))
  const createdNodes = draftedGraph.nodes.filter(node => !baselineIds.has(node.id))
  expect(createdNodes.filter(node => node.kind === 'shot_table')).toHaveLength(1)
  expect(createdNodes.filter(node => node.kind === 'image').map(node => node.prompt).sort())
    .toEqual(originalShots.map(shot => shot.candidate.prompt).sort())
  await present(operationId, requestedIds)
  expect(await graph()).toEqual(draftedGraph)
  const initialGraph = await graph()
  const presentedShots = originalShots.map(shot => ({ ...shot, included: requestedIds.includes(shot.shotId) }))
  expect((await readRun(operationId)).generationPlan.shots).toEqual(presentedShots)
  await expect(card.locator('[data-v4-price="total"]')).toContainText('0.90')
  await setScope('each')
  await pageTo(2)
  await expect(input).toHaveText('CJ1_anchor_2 原始画面')
  const editedPrompt = 'CJ1 第二卡独立草稿，不串其他镜头'
  await input.fill(editedPrompt)
  await pageTo(3)
  await expect(input).toHaveText('CJ1_anchor_3 原始画面')
  await pageTo(2)
  await expect(input).toHaveText(editedPrompt)
  await setScope('all')
  await clickOrFail(size.locator('button').first(), '原全部范围尺寸控件')
  await clickOrFail(win.getByRole('option', { name: '1536x1024', exact: true }).first(), '全部三卡修改尺寸')
  await expect(size).toHaveAttribute('data-parameter-chip-value', '1536x1024')
  await setScope('each')
  await expect(input).toHaveText(editedPrompt)
  await expect(size).toHaveAttribute('data-parameter-chip-value', '1536x1024')
  expect(await graph()).toEqual(initialGraph)
  expect((await readRun(operationId)).generationPlan.shots).toEqual(presentedShots)
  expect(walk.fixture.images).toHaveLength(0)
  await walk.snap('cj1-three-of-33-pager-and-two-edit-layers')

  const otherOperationId = await draft([makeShot(99)])
  const otherShots = (await readRun(otherOperationId)).generationPlan.shots
  await present(otherOperationId, otherShots.map(shot => shot.shotId))
  await expect.poll(async () => (await pending()).map(row => row.operationId)).toEqual([operationId, otherOperationId])
  await expect(input).toHaveText(editedPrompt)
  await expect.poll(async () => (await graph()).nodes.length).toBe(initialGraph.nodes.length + 1)
  const bothGraph = await graph()
  await walk.snap('cj1-two-real-pending-first-stays-visible')
  await clickOrFail(card.locator(INTERVENTION_REJECT), '关闭第一笔，原介入槽依序显示第二笔')
  await expect.poll(async () => (await pending()).map(row => row.operationId)).toEqual([otherOperationId])
  await expect(input).toHaveText('CJ1_shot_99 原始画面')
  await expect(size).toHaveAttribute('data-parameter-chip-value', '1024x1024')
  expect(await graph()).toEqual(bothGraph)
  await walk.snap('cj1-second-operation-has-own-draft')
  const proof = await proveProbe(card, 'Second pending really appears before dismissal')
  await clickOrFail(card.locator(INTERVENTION_REJECT), '关闭第二笔')
  await expectAbsent(card, { provenBy: proof, message: 'Both dismissed operations leave the slot' })
  await present(operationId, requestedIds)
  await setScope('each')
  await pageTo(2)
  await expect(input).toHaveText(editedPrompt)
  await expect(size).toHaveAttribute('data-parameter-chip-value', '1536x1024')
  await setScope('all')
  await expect(size).toHaveAttribute('data-parameter-chip-value', '1536x1024')
  expect((await pending())[0].shots.map(shot => shot.shotId)).toEqual(requestedIds)
  expect((await readRun(operationId)).generationPlan.shots).toEqual(presentedShots)
  expect((await readRun(operationId)).jobs).toHaveLength(0)
  expect((await readRun(otherOperationId)).jobs).toHaveLength(0)
  expect(await graph()).toEqual(bothGraph)
  expect(walk.fixture.images).toHaveLength(0)
  await walk.snap('cj1-same-three-shot-scope-restores-both-draft-layers')
  walk.report.spendScopeJourney = { projectId, projectRoot, operationId, otherOperationId, requestedIds, planItems: 33,
    pendingOrder: [operationId, otherOperationId], graphCounts: { nodes: bothGraph.nodes.length, edges: bothGraph.edges.length, groups: bothGraph.groups.length },
    verified: ['three-of-33', 'shot-pagination', 'each-and-all-edit-layers', 'two-pending-sequential-slot', 'close-isolation', 'same-operation-scope-and-draft-recovery'],
    mediaSubmissions: 0, boundary: 'Real Electron UI/Agent tools/storage with text loopback. No confirmation execution, generated-history, next-execution-batch or arbitrary pending navigation claim.' }
}
