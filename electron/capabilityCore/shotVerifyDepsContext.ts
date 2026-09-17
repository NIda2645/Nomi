import type { ShotVerifyDeps } from './shotVerifyOrchestrate'

/**
 * 审片环 deps 工厂（可选注入，由传输层提供）。**默认不传 = 行为逐字节不变**（batchPlanPreview 渲染层路径、
 * 纯 CLI 评测路径都不受影响）。传了 → 生成成功后 core 调一次 verifyAndMaybeRetry 并把 outcome 挂返回。
 * 领域策略住 shotVerifyOrchestrate（纯）、传输层只注入 deps、core 只透传 outcome——三层干净（方案 §3/§9）。
 *
 * ctx 是 core 在生成时算出的真实上下文（复用首发 grantId + 同 nodeId + 同模型/参数/参考重试的原料）。
 */
export type ShotVerifyDepsContext = {
  projectId: string
  grantId: string
  nodeId: string
  vendor: string
  modelKey: string
  generationKind: string
  nodeKind: string
  basePrompt: string
  params: Record<string, unknown>
  references: string[]
  /** 给判分模型铸**它自己的**令牌（理由见 `shotVerifyDeps.ts` 的 `confirmJudgeSpend`）。 */
  confirmJudgeSpend: (judge: { vendor: string; modelKey: string }) => Promise<string | null>
}
export type MakeVerifyDeps = (ctx: ShotVerifyDepsContext) => ShotVerifyDeps
