// 能力核 · MCP 画布方案确认的会话级信任 + 文案（见 plan 2026-08-18-t1-elicitation-first-plan-confirm）。
//
// 批量加节点（≥2 = 一套「方案」，免费可撤）在声明 elicitation 的客户端上改「聊天里问一次」：
// 首次某项目问过并批准 → 本会话对该项目记一次信任，后续批量直接放行（不再问、不弹 App 卡）。
// 信任**纯内存**、挂在协议实例（= 一条 MCP 连接/会话）闭包里，连接断随进程亡，不持久化；
// 按 projectId 隔离（每连接一个协议实例故 session 天然分开，键只需 projectId）——换项目要重新问。
// 逻辑单拎在此，避免把 mcpProtocol.ts 顶过 800 行门（R9）。

/** 一条 MCP 会话内的画布方案信任集（projectId 粒度）。协议实例各持一个，互不共享。 */
export function createPlanTrustStore() {
  const trusted = new Set<string>()
  return {
    /** 该项目本会话是否已批准过批量方案（批准过 → 后续不再问）。 */
    isTrusted(projectId: string): boolean {
      return projectId ? trusted.has(projectId) : false
    },
    /** 真人在聊天里批准某项目的方案后调用：记下信任。空 projectId 不记（无从隔离）。 */
    trust(projectId: string): void {
      if (projectId) trusted.add(projectId)
    },
  }
}

export type PlanTrustStore = ReturnType<typeof createPlanTrustStore>

/**
 * 方案确认的聊天弹框文案（zh-CN，跟现有 elicit 提示口吻）。
 * 讲清三件：做什么（往画布加 N 个节点）、免费可撤、批准后本会话该项目不再问。
 * locale 管道是后续任务，这里只出中文（与现有 spend/gate elicit 的默认中文一致）。
 */
export function planConfirmElicit(nodeCount: number): { message: string; title: string; description: string } {
  return {
    message: `往画布加 ${nodeCount} 个节点（免费、可随时撤销）。批准后本次会话在这个项目里继续加节点就不再打断你。`,
    title: '确认加到画布',
    description: '这是免费可逆的编辑：确认后把这批节点加到画布，并允许本会话在该项目继续编辑画布而不再逐次询问。',
  }
}
