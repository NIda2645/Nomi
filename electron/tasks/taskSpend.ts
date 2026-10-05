import { isComfyuiVendor } from '../catalog/types'
import { assertAndConsumeSpendGrant, assertAndConsumeQuotedSpend } from '../spendGrant'
import { quoteSpendLine } from '../spendQuote'
import { requestRendererDecision } from '../capabilityCore/rendererBridge'
import type { SpendQuoteInput } from '../shared/contracts/spendQuote'

/** Last paid-submit boundary, shared by mapped, custom, audio and fallback runners. */
export async function consumeTaskSpend(input: SpendQuoteInput & {
  grantId?: string
  nodeId?: string
  projectId?: string
}): Promise<void> {
  if (isComfyuiVendor({ key: input.vendorKey })) {
    assertAndConsumeSpendGrant(input.grantId, input.nodeId)
    return
  }
  const charge = quoteSpendLine(input)
  await assertAndConsumeQuotedSpend(input.grantId, input.nodeId, charge, async (quote) => {
    // 等的是人，不是渲染层：没有墙钟期限（2026-09-11 拍板，审批卡永不因空闲超时）。
    const reply = await requestRendererDecision('spend.confirm', {
      projectId: input.projectId,
      nodeId: input.nodeId,
      vendor: input.vendorKey,
      modelKey: input.modelKey,
      quote,
      intent: 'generation',
    }) as { confirmed?: boolean } | null
    return reply?.confirmed === true
  })
}

/** 一次任务在发出去之前要过的两道：付费闸（核销令牌）与「这一镜归谁」的认领。 */
export type TaskAdmission = { spendGate: typeof consumeTaskSpend; claimShot: boolean }

/** 令牌路（批量「生成全部」、附属付费口；发动机收敛第一刀第 3–4 步收走）：认领 + 核销内存令牌。 */
export const TOKEN_ADMISSION: TaskAdmission = { spendGate: consumeTaskSpend, claimShot: true }

/**
 * 单镜 Run 路（画布单节点 ↑）：批准已经住在 Run 的门上（主进程手势收据），在途与认领在准入口
 * （appIntegrationCanvasShot）做完——这里只执行同一段传输，不核令牌、不认领。唯一调用方 canvasTransportProvider。
 */
export const RUN_APPROVED_ADMISSION: TaskAdmission = { spendGate: async () => undefined, claimShot: false }
