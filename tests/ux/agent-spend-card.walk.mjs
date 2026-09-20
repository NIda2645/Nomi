#!/usr/bin/env node
// 真实用户任务（R13/R16）：**「帮我生成一张六棱柱」之后，钱这一步长什么样。**
//
// 只有远端供应商是 loopback 夹具（零额度）；SDK、IPC、ProductionRun、渲染层、落盘全是真的。
// 走查像真人一样点：在面板里打字、看卡、在卡上改参数、按那颗印着价的按钮——
// 不灌 store、不直调桥、不伪造待决状态。
//
// T7 双宿主邻接：真实 Agent draft→generate 出卡；真实键盘/参数输入；关闭不删节点或历史；
// 同一 operation 再 generate 恢复隔离草稿；ZH/EN 截图。远端仅零额度 loopback。
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect, expectAbsent, proveProbe } from './_assert.mjs'
import { FIXTURE_IMAGE_MODEL, FIXTURE_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import { checkSpendScopeJourney } from './_agentSpendScopeJourney.mjs'
import {
  APPROVAL_CARD, CANVAS_PANEL, COMPOSER_PERMISSION, INTERVENTION_CONFIRM, INTERVENTION_REJECT,
  PERMISSION_POPOVER, permissionTier,
  createRuntimeWalk, openCanvas, readProject, recorded, sendCanvas,
} from './agent-runtime-walk-support.mjs'

const ASK = 'S_SPEND_ASK：帮我生成一张六棱柱的图。'
const PLAN_CALL = 's-spend-plan-1'
const GENERATE_CALL = `${PLAN_CALL}-generate`
const PRICE_TOTAL = '[data-v4-price="total"]'

const walk = await createRuntimeWalk('spend-card')
let failure
try {
  let { win } = await walk.start({ first: true })
  const { projectId, name } = await walk.newProject()
  await openCanvas(win)
  await expect(win.locator(`${CANVAS_PANEL} [data-v4-block="composer"]`)).toHaveAttribute('data-spend-policy', 'confirm')

  // ① agent 建草稿。付费能力按设计不在模型工具面里（paidBoundary），所以它能做的只有建草稿——
  // 「这笔钱花不花」必须由面板上那张卡来问，这正是本走查要证明的东西。
  const planner = walk.fixture.expectText({
    label: 'the agent drafts a generation instead of spending on its own',
    match: (body) => flattenRequestText(body).includes('S_SPEND_ASK'),
    reply: { type: 'tool', id: PLAN_CALL, name: 'draft_shots', args: {
      // 20 动词：draft_shots 建草稿（落画布、不出卡），generate 才把报价卡摆到用户面前。
      shots: [{ prompt: '一个悬浮的六棱柱，柔和的演播室灯光', taskKind: 'text_to_image', candidate: { providerId: FIXTURE_VENDOR, modelId: FIXTURE_IMAGE_MODEL }, parameters: { size: '1024x1024' } }],
    } },
  })
  let operationId
  const plannerDoneDraft = walk.fixture.expectText({
    label: 'the draft result comes back with the host-generated operationId',
    match: (body) => {
      const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === PLAN_CALL)
      if (!result) return false
      operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
      return true
    },
    reply: { type: 'hold' },
  })
  const plannerDone = walk.fixture.expectText({
    label: 'the drafting turn completes through the same SDK turn',
    match: (body) => (body.messages ?? []).some((message) => message.role === 'tool' && message.tool_call_id === GENERATE_CALL),
    reply: { type: 'text', text: 'S_SPEND_DONE：草稿已就绪，等你确认。' },
  })
  await sendCanvas(win, ASK)
  await recorded(planner.received, 'generation draft request')
  await recorded(plannerDoneDraft.received, 'generation draft result')
  plannerDoneDraft.release({ type: 'tool', id: GENERATE_CALL, name: 'generate', args: { operationId } })
  await recorded(plannerDone.received, 'generation draft result')

  // 草稿落画布（一本账）：节点先出现，用户看得见 agent 到底要生成什么。
  await expect.poll(async () => {
    return (await readProject(win, projectId)).payload.generationCanvas.nodes.length
  }, { timeout: DEFAULT_TIMEOUT_MS }).toBe(1)
  const node = (await readProject(win, projectId)).payload.generationCanvas.nodes[0]
  expect(node.meta.modelKey, '落地的节点必须带 agent 定的模型身份').toBe(FIXTURE_IMAGE_MODEL)

  // 面板出卡。它是**介入槽**里的一张卡，不是居中弹窗——单轨化的可见证据。
  let card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  const cardProof = await proveProbe(card, 'The paid confirmation lives in the agent panel intervention slot')
  // 价格是宿主按目录 pricing 算出来的数字，不是标签。
  await expect(card.locator(PRICE_TOTAL)).toContainText('0.30')
  // 卡体就是画布节点那张生成框整件：提示词在卡上，不是留在画布上（v1 被打回的那个窟窿）。
  await expect(card).toContainText('六棱柱')
  await expect(card.locator('[data-parameter-summary]'), '付款卡沿用原参数 chips，不并存画布摘要 pill').toHaveCount(0)
  await walk.snap('spend-card-in-intervention-slot')
  await expect(win.locator('div.fixed.inset-0').filter({ hasText: '开始生成' }),
    'agent 代发的付费确认不许再弹居中卡').toHaveCount(0)

  // Existing pending spend keeps its explicit confirmation boundary when permission changes.
  await clickOrFail(win.locator(`${CANVAS_PANEL} ${COMPOSER_PERMISSION}`), '权限档选择器')
  await expect(win.locator(`${CANVAS_PANEL} ${PERMISSION_POPOVER}`)).toBeVisible()
  await clickOrFail(win.locator(`${CANVAS_PANEL} ${permissionTier('project')}`), '切到「全自动」')
  const switchCard = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="approval-reversible"]`)
  await expect(switchCard).toBeVisible()
  await clickOrFail(switchCard.locator(INTERVENTION_CONFIRM), '确认切到全自动')
  await expect(win.locator(`${CANVAS_PANEL} [data-v4-block="auto-mode"]`), '全自动档要有常驻提醒').toBeVisible()
  await expect(card, '付费卡在切档之后仍然等着人答——钱不因档位放行').toBeVisible()
  await expect(card.locator(PRICE_TOTAL), '让位回来之后价格一个字都没变——它没有倒计时，等多久都行').toContainText('0.30')
  expect(walk.fixture.images, '切档不提交待确认生成').toHaveLength(0)
  await walk.snap('spend-card-still-waiting-under-full-auto')


  const canvasParameters = win.locator('[data-composer-host="canvas"] [data-parameter-summary]')
  await expect(canvasParameters).toBeVisible()
  await expect.poll(() => canvasParameters.evaluate(button => {
    const rect=button.getBoundingClientRect()
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
    return Boolean(hit && button.contains(hit))
  }),{message:'The canvas parameter control must receive clicks above the bottom workspace docks'}).toBe(true)
  await clickOrFail(canvasParameters,'底部停靠区上方的画布参数控件')
  const canvasParameterPanel = win.locator('[data-agent-parameter-panel="true"]')
  await expect(canvasParameterPanel).toBeVisible()
  await clickOrFail(canvasParameterPanel.locator('[role="radio"][aria-checked="true"]:not([disabled])').first(),'保持原值并验证参数选项实际可点')
  await win.keyboard.press('Escape')

  const before = structuredClone((await readProject(win, projectId)).payload.generationCanvas.nodes)
  let input = card.locator('[data-composer-host="panel"] [contenteditable="true"]')
  await expect(input).toBeVisible()
  await expect.poll(() => input.evaluate(element => {
    const rect=element.getBoundingClientRect(), style=getComputedStyle(element)
    const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)
    return rect.width>0 && rect.height>0 && style.visibility==='visible' && Boolean(hit && element.contains(hit))
  })).toBe(true)
  await input.click()
  await win.keyboard.press('Meta+A')
  const draftPrompt = 'T7 isolated payment draft / 未批准草稿'
  await win.keyboard.insertText(draftPrompt)
  await expect(input).toHaveText(draftPrompt)
  let sizeChip = card.locator('[data-parameter-chip] button[aria-label="尺寸"]').first()
  await clickOrFail(sizeChip, '付款卡真实尺寸参数')
  await clickOrFail(win.getByRole('option', { name: '1536x1024', exact:true }).first(), '修改未批准尺寸')
  await expect(sizeChip).toContainText('1536x1024')
  expect((await readProject(win, projectId)).payload.generationCanvas.nodes, '未批准输入不得更改画布内容/历史').toEqual(before)
  expect(walk.fixture.images, '编辑未批准卡不发媒体请求').toHaveLength(0)
  await walk.snap('spend-card-zh-edited-isolated')

  await clickOrFail(card.locator(INTERVENTION_REJECT), '关闭付款卡，保留节点及草稿')
  await expectAbsent(card, {provenBy:cardProof,message:'关闭后付款卡退出介入槽'})
  expect((await readProject(win, projectId)).payload.generationCanvas.nodes, '关闭不删除节点、不改内容、不清历史').toEqual(before)
  expect(walk.fixture.images, '关闭不提交媒体').toHaveLength(0)
  const requestsBeforeCold = walk.fixture.requests.length
  await walk.stopApp()
  ;({ win } = await walk.start())
  expect(walk.report.launches[1].pid).not.toBe(walk.report.launches[0].pid)
  const projectCard = win.locator('[data-project-card="true"]').filter({hasText:name})
  await expect(projectCard).toBeVisible()
  await projectCard.hover()
  await clickOrFail(projectCard.getByRole('button',{name:/继续创作/}), '冷启动重开关闭确认卡的项目')
  await win.waitForFunction(id => location.href.includes(`projectId=${encodeURIComponent(id)}`),projectId)
  await openCanvas(win)
  card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
  input = card.locator('[data-composer-host="panel"] [contenteditable="true"]')
  sizeChip = card.locator('[data-parameter-chip] button[aria-label="尺寸"]').first()
  await expectAbsent(card,{provenBy:cardProof,message:'冷启动不会复活已关闭的旧确认卡'})
  // Existing projectV51ToV60Migration fills this derived renderer hint on reopen.
  // Keep the full-node comparison: no other field may change across dismissal/restart.
  const restoredNodes = before.map(node => ({ ...node, renderKind: 'shot-frame' }))
  expect((await readProject(win,projectId)).payload.generationCanvas.nodes).toEqual(restoredNodes)
  expect(walk.fixture.images,'冷启动不提交媒体').toHaveLength(0)
  expect(walk.fixture.requests,'冷启动不重新请求模型').toHaveLength(requestsBeforeCold)
  await walk.snap('spend-card-cold-closed-no-resurrection')
  const reopen = walk.fixture.expectText({label:'reopen the same generation operation',
    match:body=>flattenRequestText(body).includes('S_SPEND_REOPEN'),
    reply:{type:'tool',id:'spend-reopen',name:'generate',args:{operationId}}})
  const reopened = walk.fixture.expectText({label:'same operation reopening completes',
    match:body=>(body.messages??[]).some(message=>message.role==='tool' && message.tool_call_id==='spend-reopen'),
    reply:{type:'text',text:'S_SPEND_REOPEN_DONE：请确认保留的草稿。'}})
  await sendCanvas(win, 'S_SPEND_REOPEN：重新打开刚才同一笔生成的确认卡，不新建。')
  await recorded(reopen.received, 'same operation generate request')
  await recorded(reopened.received, 'same operation reopened')
  await expect(card).toBeVisible()
  await expect(input).toHaveText(draftPrompt)
  await expect(sizeChip).toContainText('1536x1024')
  expect((await readProject(win, projectId)).payload.generationCanvas.nodes).toEqual(restoredNodes)
  expect(walk.fixture.images, '重新展示未批准卡不提交').toHaveLength(0)
  await walk.snap('spend-card-zh-reopened-draft')
  // Locale preference only, no project/store mutation. Reload is an explicit renderer-remount case.
  await win.evaluate(() => localStorage.setItem('nomi:locale:v1','en'))
  await win.reload()
  await expect(card).toBeVisible()
  await expect(input).toHaveText(draftPrompt)
  await expect(card.locator('[data-parameter-chip]').filter({hasText:'1536x1024'}).first()).toBeVisible()
  await walk.snap('spend-card-en-reopened-draft')
  expect((await readProject(win, projectId)).payload.generationCanvas.nodes).toEqual(restoredNodes)
  expect(walk.fixture.images, '整场零媒体提交').toHaveLength(0)
  walk.report.verified = ['card-still-waits-under-full-auto', 'agent-draft-generate-real-card','real-keyboard-and-parameter-draft-only',
    'close-preserves-node-content-history','cold-process-reopen-no-old-card','same-operation-reopens-draft','zh-en-renderer-remount']
  await checkSpendScopeJourney(walk, win)
} catch (error) {
  failure = error
  process.exitCode = 1
} finally {
  await walk.finish(failure)
}
