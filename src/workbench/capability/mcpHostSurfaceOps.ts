// 外部 MCP 宿主打开模型设置；供应商与预填由持久 handoff 驱动。

/** 未处理返回 null，让 capabilityApplyHandler 继续走它自己的 switch。 */
export function handleMcpHostSurfaceOp(op: string, data: Record<string, unknown>): Record<string, unknown> | null {
  if (op === 'integration.open-credentials' || op === 'settings.open-model-provider') {
    window.dispatchEvent(new CustomEvent('nomi-open-settings', { detail: { tab: 'models' } }))
    return {
      opened: true,
      ...(typeof data.provider === 'string' && data.provider.trim() ? { provider: data.provider.trim() } : {}),
    }
  }
  return null
}
