#!/usr/bin/env node
// 剧本 PB01 · 「让 Agent 画两张图，付费卡两页，我只在第 1 页点了『生成这张』」
//
// 已知问题（0.22.1）：点付费卡里的「仍要生成」就直接开跑，第二张卡还没确认；Agent 说「已经开始跑」。
// 这是一个真实创作者会做的事：让 Agent 起草两镜、在付费卡上翻一翻、在第 1 页按下去。
//
// 乱用：翻到第 2 页再翻回来才按；点完再点一下出好的那张图看看（节点角标）。
// 变体由跑器指派：base（中文）/ en（英文界面，同一条路）。
//
// 零花费：大脑与供应商都是本机夹具；目录里不种价（= 今天每一台干净装机），卡上不说价格的话，主按钮是「生成这张」。
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from '../../_assert.mjs'
import { findNodeHitPoint } from '../../_canvasHit.mjs'
import { stationTimeout } from '../../_station-budget.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR } from '../../agent-runtime-fixture.mjs'
import { APPROVAL_CARD, CANVAS_PANEL, INTERVENTION_CONFIRM, closeSpendCard, expandResidentPanel, sendCanvas } from '../../agent-runtime-walk-support.mjs'
import { clickVisiblePart } from '../actions.mjs'
import { operationIdOf, scriptTurn } from '../brain.mjs'
import { startPlaybook } from '../launch.mjs'

// 这条剧本的前提就是「目录里没有价目」（夹具读这个开关决定种不种价）。
process.env.NOMI_WALK_UNPRICED_MODEL = '1'

const pb = await startPlaybook({
  id: 'pb01-two-page-card',
  needs: ['loopbackProvider', 'fixtureTextModel', 'paidGenerationRoute'],
  seed: () => ({ nodes: [], groups: [], edges: [] }),
})
const { smoke, fixture, monitor } = pb
const EN = pb.locale === 'en'
const ASK = EN
  ? 'PB01: draw two images for me — shot 1, a white cat on the windowsill of a morning cafe; shot 2, the barista doing latte art.'
  : 'PB01：帮我画两张图——镜1，清晨咖啡馆窗台上趴着一只白猫；镜2，同一家店里咖啡师在拉花。'
const SHOTS = EN
  ? ['A white cat lying on the windowsill of a morning cafe, soft light', 'The same cafe, a barista pouring latte art behind the counter']
  : ['清晨咖啡馆的窗台上趴着一只白猫，柔和的晨光', '同一家咖啡馆，吧台后的咖啡师在拉花']
const card = () => smoke.win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)

let harnessError = null
try {
  await monitor.step('打开项目（从项目库）', () => smoke.openProject(), { surfaces: ['*'], critical: true })
  await monitor.step('展开 Agent 面板', () => expandResidentPanel(smoke.win), { surfaces: ['agentPanel', 'rightPanel'] })

  const turn = scriptTurn(fixture, {
    label: 'pb01-draft',
    marker: 'PB01',
    steps: [
      { name: 'draft_shots', args: { shots: SHOTS.map((prompt) => ({ prompt, taskKind: 'text_to_image', candidate: { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }, parameters: { aspect_ratio: '16:9' } })) } },
      { name: 'generate', args: ({ previous }) => ({ operationId: operationIdOf(previous) }) },
      // 大脑照宿主给它的那句回执说话（真实模型也会这么复述）。被测的是那句回执本身，监视器从夹具请求里读。
      { text: EN ? 'Done — generation has started.' : '好的，已经开始生成了。' },
    ],
  })

  await monitor.step('用户：让 Agent 画两张图', () => sendCanvas(smoke.win, ASK), { surfaces: [] })
  await monitor.step('等 Agent 起草两镜、摆出付费卡', async () => {
    await expect(card(), 'Agent 起草完要在面板里摆一张付费卡').toBeVisible({ timeout: stationTimeout({ turns: 1 }) })
    await expect(card().locator('[data-v4-block="pager"]'), '两镜的卡有翻页器').toContainText('1/2')
  }, { user: false, surfaces: [] })

  await monitor.step('乱用：翻到第 2 页看一眼，再翻回第 1 页', async () => {
    await clickOrFail(card().locator('[data-v4-control="pager-next"]'), '付费卡「下一页」')
    await expect(card().locator('[data-v4-block="pager"]')).toContainText('2/2')
    await clickOrFail(card().locator('[data-v4-control="pager-prev"]'), '付费卡「上一页」')
    await expect(card().locator('[data-v4-block="pager"]')).toContainText('1/2')
  })

  await monitor.step('在第 1 页点「生成这张」', async () => {
    await monitor.consentSpendCard(card(), { label: '第 1 页的主按钮' })
    await clickOrFail(card().locator(INTERVENTION_CONFIRM), '付费卡主按钮（第 1 页）', { noWaitAfter: true })
  })

  // 付费卡逐镜（2026-09-30）：点了的生成，没点的留在卡上等人——卡不消失、只剩第 2 张；用户不想要它，就点 × 关掉。
  await monitor.step('卡还在、只剩第 2 张；点 × 关掉（第 2 张不生成）', async () => {
    await expect(card().locator('[data-v4-block="slot-title"]'), '卡还在、标题只数还没决定的第 2 张')
      .toContainText(EN ? 'Generate this image?' : '生成这 1 张图片？', { timeout: DEFAULT_TIMEOUT_MS })
    await closeSpendCard(card(), '关掉付费卡（第 2 张不生成）')
  })

  await monitor.step('等出图、等这一轮 Agent 说完', async () => {
    await expect.poll(() => fixture.images.length, { message: '供应商至少收到一笔', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
    await turn.done
    await expect(smoke.win.locator(`${CANVAS_PANEL} [data-v4-block="composer"][data-mode="running"]`), '这一轮落地').toHaveCount(0, { timeout: DEFAULT_TIMEOUT_MS })
    await expect.poll(async () => {
      const run = monitor.readRuns().at(-1)
      const nodeIds = (run?.generationPlan?.shots ?? []).map((shot) => shot.nodeId).filter(Boolean)
      const nodes = (await monitor.readProject())?.payload?.generationCanvas?.nodes ?? []
      return nodes.filter((node) => nodeIds.includes(node.id) && node.status === 'success').length
    }, { message: '至少一镜落成 success', timeout: stationTimeout({ operations: 4 }) }).toBeGreaterThan(0)
  }, { user: false, surfaces: [] })

  await monitor.settle('第 1 页那一镜生成完')

  await monitor.step('乱用：点一下出好的那张图', async () => {
    const run = monitor.readRuns().at(-1)
    const nodes = (await monitor.readProject())?.payload?.generationCanvas?.nodes ?? []
    const landed = (run?.generationPlan?.shots ?? []).map((shot) => nodes.find((node) => node.id === shot.nodeId)).find((node) => node?.status === 'success')
    if (!landed) throw new Error('找不到落地的那一镜')
    const point = await findNodeHitPoint(smoke.win, { nodeSelector: `[data-node-id="${landed.id}"]` })
    if (!point) throw new Error(`节点 ${landed.id} 在舞台上没有点得到的地方`)
    await smoke.win.mouse.click(point.x, point.y)
    await expect(smoke.win.locator(`[data-node-id="${landed.id}"]`).first()).toHaveAttribute('data-selected', 'true')
  }, { surfaces: [] })

  await monitor.step('停一会儿，看节点上挂着什么', async () => {
    await smoke.win.waitForTimeout(monitor.limits.savedFeedbackWindowMs.value + 1000)
  }, { user: false, surfaces: [] })

  // 乱用：点开「1 版」托盘，按「重拍这镜」——用户对这一张不满意，想再来一张。
  await monitor.step('乱用：打开版本托盘，按「重拍这镜」', async () => {
    const pill = smoke.win.locator('[data-card-stack-side] > button[aria-label]').first()
    await clickOrFail(pill, '节点旁的版本胶囊')
    const rerun = smoke.win.getByRole('button', { name: EN ? 'Re-film shot' : '重拍这镜' }).first()
    // 托盘从节点右边弹出，窄窗 / 英文长字时会伸到右侧 Agent 面板底下：按钮只露出一截。人会点露出来的那截。
    const hit = await clickVisiblePart(smoke.win, rerun, '托盘里的「重拍这镜」')
    if (hit.covered) {
      await monitor.violate({
        invariant: 7, rule: 'control-partly-covered', key: `rerun|${EN ? 'en' : 'zh'}`,
        module: 'src/workbench/generationCanvas/nodes/NodeResultStack.tsx（版本托盘贴着节点右边弹出，不避让右侧面板 / 画布边界）',
        message: `版本托盘里的「${EN ? 'Re-film shot' : '重拍这镜'}」只有 ${hit.reachable}/${hit.total} 个采样点点得到——其余被右侧面板盖住或伸出了画布`,
        snapshot: { hit },
      })
    }
    const spendCard = card()
    const dialog = smoke.win.locator('[data-spend-confirm-dialog]').first()
    // 结论也可能是托盘里那一行就地的状态字（节点自己的反馈位，role=status）。
    const toast = smoke.win.locator('.mantine-Notification-root, [data-node-result-stack] ~ [role="status"], [role="status"]').filter({ hasText: /\S/ }).first()
    await expect.poll(async () => (await spendCard.count()) + (await dialog.count()) + (await toast.count()),
      { message: '按下「重拍这镜」之后有个结论（付费卡 / 确认框 / 提示）', timeout: DEFAULT_TIMEOUT_MS }).toBeGreaterThan(0)
    if (await spendCard.count()) {
      await monitor.consentSpendCard(spendCard, { label: '重拍这镜的付费卡' })
      await clickOrFail(spendCard.locator(INTERVENTION_CONFIRM), '重拍付费卡的主按钮', { noWaitAfter: true })
    } else if (await dialog.count()) {
      await monitor.consentDialog(dialog, { label: '重拍这镜的确认框' })
      await clickOrFail(dialog.locator('[data-spend-confirm-action="confirm"]'), '重拍确认框「确认」', { noWaitAfter: true })
    }
  }, { surfaces: ['modal'] })
  await monitor.step('等重拍有个结果', async () => {
    await smoke.win.waitForTimeout(monitor.limits.schedulerPollCapMs.value)
  }, { user: false, surfaces: [] })

  await monitor.settle('收尾')
} catch (error) {
  harnessError = error
  console.error('[full-walk] pb01 故障：', error?.stack ?? error)
}
process.exit(await pb.finish(harnessError))
