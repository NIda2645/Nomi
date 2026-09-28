// 文稿方案的 `generate`：用户在分镜编辑器那张花钱确认框上答完之后，结局要走到模型面（D5，2026-09-22）。
//
// ── 先红才有意义 ──
//
// 在此之前渲染层对确认和取消**一律**回 `{status:'presented'}`（`storyboardPresent.ts` 里那句
// 「Original confirmation returns void for both acceptance and cancellation」），结局被扔掉。
// 主进程读不到任何结论，`generate` 的回执只能落到 `generation_approval_unavailable`
// 「this host did not wait for his answer」——**错误形状**，模型据此重试、进熔断，
// 而用户明明刚刚答过。run5 实测：A1 一次、A3 两次，与各自答框次数一一对应
// （`docs/evidence/2026-09-22-askback-real-model-run5` 发现 ③）。
//
// 这里钉两半：① 主进程把渲染层的结局翻成**与报价卡那条路同一份**的 `GenerateUserDecision`；
// ② 同一份结果喂给真正的 `generate` 回执，三种结局都是**成功形状**。
// 阳性对照写在最后：真的没有人答（回包里没有 `decision`）仍然是那条 unavailable 的错误——
// 这一刀没有把「没人等」那一支一起抹平。
import { describe, expect, it, vi } from 'vitest'

import { presentStoryboardAuthoring } from './mcpGenerationMultiShot'
import { createExtendedLaneTools } from '../agentLane/laneExtendedTools'
import { GENERATE_USER_DECISION_KEY } from '../shared/agentLane/generateUserDecision'

const DESIGN_ID = 'design-1'
const CANDIDATE = { candidateId: 'cand-1', revision: 1, moduleId: 'generation.single-shot',
  providerId: 'fixture', modelId: 'fixture-image', mode: 'text_to_image', prompt: '一只橘猫', parameters: {}, references: [] }

/** 渲染层那一侧的回包。`decision` 缺席 = 旧渲染层 / 没有人答过。 */
function renderer(decision?: unknown) {
  return vi.fn(async (op: string) => {
    expect(op).toBe('storyboard.present')
    return { status: 'presented', designId: DESIGN_ID, shotIds: ['shot-1', 'shot-2'],
      ...(decision === undefined ? {} : { decision }) }
  })
}

const present = (decision?: unknown) => presentStoryboardAuthoring(
  { candidate: CANDIDATE as never, sourceDocumentId: 'doc-1' }, 'project-1', DESIGN_ID, undefined, renderer(decision))

/** 真正的 `generate` 回执（`laneExtendedTools.generateReceipt`），喂的是主进程刚拼出来的那份结果。 */
async function receiptFor(result: unknown) {
  const tool = createExtendedLaneTools({ execute: async () => ({ ok: true, result }) })
    .find(candidate => candidate.name === 'generate')!
  return tool.execute(tool.schema.parse({ operationId: DESIGN_ID }), {
    toolCallId: 'call-1', signal: new AbortController().signal,
  }) as Promise<{ ok: boolean; nextAction?: { kind: string; userSees: string }
    failure?: { code: string; message: string } }>
}

describe('文稿方案 generate：确认框的三种结局都走到模型面', () => {
  it('他点了确认 → approved，回执说「已经开跑」', async () => {
    const result = await present('started')
    expect(result).toMatchObject({ status: 'presented', shots: ['shot-1', 'shot-2'],
      [GENERATE_USER_DECISION_KEY]: { outcome: 'approved' } })
    const receipt = await receiptFor(result)
    expect(receipt.ok, '同意不是错误').toBe(true)
    expect(receipt.nextAction?.kind).toBe('job_running')
    expect(receipt.nextAction?.userSees).toMatch(/generation has started/)
  })

  it('他点了取消 / 关掉 / 点遮罩 → declined，成功形状的「他没同意这次」，草稿留着', async () => {
    const result = await present('declined')
    expect(result).toMatchObject({ [GENERATE_USER_DECISION_KEY]: { outcome: 'declined' } })
    const receipt = await receiptFor(result)
    expect(receipt.ok, '「他说不」不是错误——错误形状会让模型重试、进熔断、向用户报「出错了」').toBe(true)
    expect(receipt.nextAction?.kind).toBe('none')
    expect(receipt.nextAction?.userSees).toMatch(/closed the priced card without approving/)
    // 与 × 同一条边：收回的是这一次出价，草稿原样留着。
    expect(receipt.nextAction?.userSees).toMatch(/withdrew this quote, not the draft/)
    expect(receipt.nextAction?.userSees).toMatch(/[Nn]othing was (generated|spent)/)
  })

  it('范围里一张卡都没弹过 → nothing_to_generate，不编一个他没做过的决定', async () => {
    const result = await present('nothing-to-run')
    expect(result).toMatchObject({ status: 'nothing_to_generate' })
    expect(result).not.toHaveProperty(GENERATE_USER_DECISION_KEY)
    const receipt = await receiptFor(result)
    expect(receipt.ok).toBe(true)
    expect(receipt.nextAction?.kind).toBe('none')
    expect(receipt.nextAction?.userSees).toMatch(/already has a result/)
  })

  it('阳性对照：回包里真的没有结局（旧渲染层 / 没人答过）仍然是 unavailable 的错误', async () => {
    const result = await present(undefined)
    expect(result).toMatchObject({ status: 'presented' })
    expect(result).not.toHaveProperty(GENERATE_USER_DECISION_KEY)
    const receipt = await receiptFor(result)
    expect(receipt.ok).toBe(false)
    expect(receipt.failure?.code).toBe('generation_approval_unavailable')
    expect(receipt.failure?.message).toMatch(/did not wait for his answer/)
  })

  it('阳性对照：认不出的结局值不许被当成「他同意了」', async () => {
    const result = await present('maybe')
    expect(result).not.toHaveProperty(GENERATE_USER_DECISION_KEY)
    expect((await receiptFor(result)).failure?.code).toBe('generation_approval_unavailable')
  })
})
