#!/usr/bin/env node
// 剧本 PB09 · 「Agent 干活留下的工具收据，和服务商整条回错时面板上那一行」
//
// 已知问题（0.22.x）：
//   · 展开工具收据，里面整段摆着工具入参 / 回包（JSON，带操作 id、供应商路由键）；
//   · 服务商回一段原始 JSON 报错，面板那一行原样印出来，后面还拖着我们自己的 `[nomi-classified: …]` 标记。
// 真实创作者会做的事：让 Agent 往文稿里写一段 → 展开过程行看它做了什么 → 再让它改一遍，这一回服务商整条回错 → 看面板上说了什么、能做什么。
//
// 零花费：大脑与供应商都是本机夹具。「界面不许露出原始 JSON / 内部 id」由监视器（ui-leaked-internals）在每一步现场判，不在这里另写断言。
import { DEFAULT_TIMEOUT_MS, clickOrFail, expect } from '../../_assert.mjs'
import {
  COMPOSER, CREATION_PANEL, ERROR_BAR, PROCESS, expandResidentPanel, sendCreation,
} from '../../agent-runtime-walk-support.mjs'
import { scriptTurn } from '../brain.mjs'
import { startPlaybook } from '../launch.mjs'

const pb = await startPlaybook({
  id: 'pb09-agent-failure-and-receipts',
  needs: ['loopbackProvider', 'fixtureTextModel'],
  seed: () => ({ nodes: [], groups: [], edges: [] }),
})
const { smoke, fixture, monitor } = pb
const EN = pb.locale === 'en'
const win = () => smoke.win
// 用户自己写的话（界面语言之外的内容不是要抓的东西：英文那一档就用英文写）。
const MARK_WRITE = EN ? 'PB09-WRITE' : 'PB09-写稿'
const MARK_FAIL = EN ? 'PB09-FAIL' : 'PB09-报错'
const ASK_WRITE = EN ? 'PB09-WRITE: add one line about the harbor at dawn to the draft.' : 'PB09-写稿：往文稿里加一句海港清晨。'
const ASK_FAIL = EN ? 'PB09-FAIL: tighten the last line once more.' : 'PB09-报错：把最后一句再收紧一遍。'
const LINE = EN ? 'Dawn at the harbor, the fog has not lifted yet.' : '海港的清晨，雾还没散。'

let harnessError = null
try {
  await monitor.step('打开项目（从项目库）', () => smoke.openProject(), { surfaces: ['*'], critical: true })
  await monitor.step('展开 Agent 面板', () => expandResidentPanel(win()), { surfaces: ['agentPanel', 'rightPanel'] })
  await monitor.step('切到创作页', async () => {
    await clickOrFail(win().locator('.nomi-stepper__step[data-mode="creation"]').first(), 'top bar: creation')
    await expect(win().locator(`${CREATION_PANEL} ${COMPOSER}`)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
  }, { surfaces: ['workspaceMode', 'agentPanel', 'rightPanel', 'canvasViewport', 'storyboardTable'] })

  // ── 任务 1：让 Agent 写一段进文稿（读、写、再读），然后展开过程行看收据 ──────────────
  const writeTurn = scriptTurn(fixture, {
    label: 'pb09-write',
    marker: MARK_WRITE,
    steps: [
      { name: 'read_script', args: {} },
      { name: 'write_script', args: { content: LINE, where: 'end' } },
      { text: EN ? 'Added the line to the end of the draft.' : '写进了文稿末尾。' },
    ],
  })
  await monitor.step('用户：往文稿里加一句', () => sendCreation(win(), ASK_WRITE), { surfaces: [] })
  await monitor.step('等 Agent 写完', async () => { await writeTurn.done }, { user: false, surfaces: [] })
  await monitor.step('展开过程行和每条工具收据', async () => {
    await win().evaluate((selector) => document.querySelectorAll(selector).forEach((node) => { node.open = true }), `${CREATION_PANEL} ${PROCESS}, ${CREATION_PANEL} details[data-v4-block="tool"]`)
    await monitor.screenshot('tool-receipts-expanded')
  }, { user: false, surfaces: [] })

  // ── 任务 2：服务商整条回一段原始 JSON 报错（带它自己的路由键和操作号）──────────────
  const failTurn = scriptTurn(fixture, {
    label: 'pb09-fail',
    marker: MARK_FAIL,
    steps: [{ httpError: { status: 400, json: { error: {
      message: 'Upstream gateway refused the request (route apimart/gpt-image-1, trace op-4f2a9c1e-7b3d-4e8a-9c21-0d5e6f7a8b9c)',
      code: 'E7731', type: 'invalid_request_error',
    } } } }],
  })
  await monitor.step('用户：再改一遍（服务商这一次整条回错）', () => sendCreation(win(), ASK_FAIL), { surfaces: [] })
  await monitor.step('等服务商的报错落到面板上', async () => {
    await failTurn.done
    await expect(win().locator(`${CREATION_PANEL} ${ERROR_BAR}`).first(), 'the failure row stays in the panel').toBeVisible({ timeout: DEFAULT_TIMEOUT_MS })
    await monitor.screenshot('provider-error-row')
  }, { user: false, surfaces: [] })
  await monitor.settle('收尾')
} catch (error) {
  harnessError = error
  console.error('[full-walk] pb09 故障：', error?.stack ?? error)
}
process.exit(await pb.finish(harnessError))
