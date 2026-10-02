// 付费卡「生成剩下 N 张」两条走查共用的那一段：
//   · `agent-spend-generate-remaining.walk.mjs`——长相、逐张语义（每张各一份授权、去掉的不算、只剩 1 张不画）；
//   · `agent-spend-stop-midway.walk.mjs`——跑到一半停下（正在发出 k/N、中途 ×）。
// 让夹具里的 Agent 起草 N 张图、再 `generate` 把它们摆上卡；以及两条走查都要认的那几句界面文字（按语言）。
// 只有远端供应商是 loopback 夹具（零额度）；SDK、IPC、ProductionRun、渲染层、落盘全是真的。
import { expect } from './_assert.mjs'
import { stationTimeout } from './_station-budget.mjs'
import { FIXTURE_APIMART_MODEL, FIXTURE_APIMART_VENDOR, flattenRequestText } from './agent-runtime-fixture.mjs'
import { APPROVAL_CARD, CANVAS_PANEL, recorded, sendCanvas } from './agent-runtime-walk-support.mjs'

export const BATCH = '[data-v4-control="batch"]'
export const TITLE = '[data-v4-block="slot-title"]'
const candidate = { providerId: FIXTURE_APIMART_VENDOR, modelId: FIXTURE_APIMART_MODEL }

export const COPY = {
  zh: {
    title: (count) => `生成这 ${count} 张图片`,
    batch: (count) => `生成剩下 ${count} 张`,
    ask: (tag, count) => `${tag}：画 ${count} 张渔港清晨，画完给我确认。`,
    sending: (total) => new RegExp(`正在发出 \\d+/${total} 张`),
    stopped: /发出了 (\d+) 张，剩下 (\d+) 张没发/,
  },
  en: {
    title: (count) => (count === 1 ? 'Generate this image' : `Generate these ${count} images`),
    batch: (count) => `Generate remaining ${count}`,
    ask: (tag, count) => `${tag}: draw ${count} harbour mornings and let me confirm.`,
    sending: (total) => new RegExp(`Sending \\d+ of ${total} images`),
    stopped: /Sent (\d+) of \d+ images; the other (\d+) were not sent/,
  },
}

/**
 * 每条走查一个起草器（`prefix` 区分两条走查的标签）：Agent 起草 `count` 张图、再 `generate` 把它们摆上卡
 * （`generate` 等用户答完卡才返回）。返回卡、operationId、「这一轮说完了」的等待，以及 Agent 收到的回执原文。
 */
export function createPresenter(prefix) {
  let round = 0
  return async function present(walk, win, count, locale) {
    round += 1
    const tag = `${prefix}_${round}`
    const planCall = `${prefix.toLowerCase().replace(/_/g, '-')}-${round}`
    const generateCall = `${planCall}-generate`
    const planner = walk.fixture.expectText({
      label: `the agent drafts ${count} image shots (${tag})`,
      match: (body) => flattenRequestText(body).includes(tag),
      reply: { type: 'tool', id: planCall, name: 'draft_shots', args: {
        shots: [...Array(count).keys()].map((index) => ({
          title: `${tag}-${index + 1}`, prompt: `${tag} 第 ${index + 1} 张：渔港清晨`, taskKind: 'text_to_image', candidate,
        })),
      } },
    })
    let operationId
    const drafted = walk.fixture.expectText({
      label: `the draft result carries the host-generated operationId (${tag})`,
      match: (body) => {
        const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === planCall)
        if (!result) return false
        operationId = /"operationId":"([^"]+)"/.exec(String(result.content))?.[1]
        return true
      },
      reply: { type: 'hold' },
    })
    let receipt = ''
    const turnDone = walk.fixture.expectText({
      label: `generate returns once the card is answered (${tag})`,
      match: (body) => {
        const result = (body.messages ?? []).find((message) => message.role === 'tool' && message.tool_call_id === generateCall)
        if (!result) return false
        receipt = String(result.content)
        return true
      },
      reply: { type: 'text', text: `${tag}_DONE` },
    })
    await sendCanvas(win, COPY[locale].ask(tag, count))
    await recorded(planner.received, `${tag} draft request`)
    // 草稿要落 count 个节点：33 张在这台机器上超过默认的 60 秒安全网，按工作量给。
    await recorded(drafted.received, `${tag} draft result`, stationTimeout({ operations: Math.max(4, count) }))
    drafted.release({ type: 'tool', id: generateCall, name: 'generate', args: { operationId } })
    const card = win.locator(`${CANVAS_PANEL} ${APPROVAL_CARD}[data-kind="spend"]`)
    await expect(card.locator(TITLE), `${tag}：卡上问的是这 ${count} 张`).toContainText(COPY[locale].title(count),
      { timeout: stationTimeout({ operations: Math.max(4, Math.ceil(count / 4)) }) })
    return { card, operationId, turnDone, tag, receipt: () => receipt }
  }
}
