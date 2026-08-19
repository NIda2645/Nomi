// 能力核 · MCP 付费生成的会话级信任 + 文案（见 plan 2026-08-19-session-scoped-spend-trust.md）。
//
// 治用户原话「那这样反复去软件确认 不是太麻烦了」——重点在**反复**。某项目首次付费生成照旧问真人，
// 批准后本会话该项目后续生成不再逐次问。信任**纯内存**、挂协议实例（= 一条 MCP 连接/会话）闭包，
// 连接断随进程亡、不持久化；按 projectId 隔离（每连接一个协议实例故 session 天然分开）。
//
// 与 mcpPlanTrust 刻意**不合并**：方案门免费可撤、无计数无阈值；付费门要计数 + 再问 + 授权范围披露。
// 共同点只有一个 Set<projectId>（8 行），为它造抽象层会做出带一半没人用的参数的东西（P1 的反面）。
//
// 与渲染层的 lightSuppressed 也不是一回事：那是「全局 + 渲染层会话 + 仅用户直发轻确认」，
// 且注释明写 agent 不可 light 抑制。本模块是「按项目 + MCP 会话 + agent 驱动」，三个轴都不同。

/**
 * 一次批准最多免问几次，之后再确认一次。
 *
 * 为什么要这个上限：用户选的是「会话级信任」而非「额度包」，所以**不引入用户要理解的配额概念**；
 * 但「一次批准换无限花钱」意味着跑飞的 agent 循环能把额度烧干。这是安全上限、不是用户要管的配额——
 * 20 次够覆盖一次正常创作会话（一集分镜十几个镜头），又把单次批准的最坏损失钉死在 20 次生成内。
 */
export const SPEND_TRUST_REASK_AFTER = 20

/** 一条 MCP 会话内的付费信任集（projectId 粒度）。协议实例各持一个，互不共享。 */
export function createSpendTrustStore() {
  // projectId → 自上次真人批准以来，已「免问放行」的次数。没有键 = 该项目本会话从没批准过。
  const passesSinceApproval = new Map<string, number>()
  return {
    /** 该项目本会话已批准过、且还没用满免问额度 → 这次不必再问。 */
    isTrusted(projectId: string): boolean {
      if (!projectId) return false
      const used = passesSinceApproval.get(projectId)
      return used !== undefined && used < SPEND_TRUST_REASK_AFTER
    },
    /** 真人批准后记信任；重新批准 = 免问计数归零（重新给满额度）。空 projectId 不记（无从隔离）。 */
    trust(projectId: string): void {
      if (projectId) passesSinceApproval.set(projectId, 0)
    },
    /** 免问放行一次 → 计数 +1。只对已信任项目有意义；没批准过的项目不该走到这里。 */
    countPass(projectId: string): void {
      if (!projectId) return
      const used = passesSinceApproval.get(projectId)
      if (used !== undefined) passesSinceApproval.set(projectId, used + 1)
    },
    /** 该项目本会话曾批准过吗——用来分辨「首次问」还是「用满额度后再问」，决定文案。 */
    hasApprovedBefore(projectId: string): boolean {
      return projectId ? passesSinceApproval.has(projectId) : false
    },
  }
}

export type SpendTrustStore = ReturnType<typeof createSpendTrustStore>

/**
 * 付费确认的聊天弹框文案。**必须说清它在授权什么**：
 * 用户以为批的是「这一张」，实际批的是「本会话这个项目往后都不问」——不写明就是骗同意（D4「缺口明着标」）。
 * reask=true 是用满免问额度后的那一问，要讲清为什么又来问，否则用户以为坏了。
 */
export function spendConfirmElicit(costHint: string, reask: boolean): {
  message: string
  title: string
  description: string
} {
  const scope = `批准后，本会话在这个项目里的后续生成不再逐次询问（最多 ${SPEND_TRUST_REASK_AFTER} 次，之后会再确认一次）。`
  return {
    message: reask
      ? `本会话在这个项目已免问生成 ${SPEND_TRUST_REASK_AFTER} 次，按上限再确认一次。\n${costHint}\n${scope}\n继续吗？`
      : `${costHint}\n${scope}\n确认现在生成吗？`,
    title: '确认生成',
    description: `确认后将消耗模型额度生成；取消则不生成、不花费。${scope}`,
  }
}
