export type TelemetryStatus = 'disabled' | 'unconfigured' | 'configured'
export const TELEMETRY_RESULT_VALUES = ['success', 'failure', 'cancel'] as const
export type TelemetryResult = typeof TELEMETRY_RESULT_VALUES[number]
export type DurationBucket = '<1s' | '1-5s' | '>5s'
export type CapabilitySlot = 'text' | 'image' | 'image-edit' | 'video' | 'audio' | '3d'
/**
 * 生成失败的「类别码」形状（照 OpenTelemetry `error.type`：低基数的错误类别，不是消息）。
 * 取值只来自 `GenerationErrorKind`（src/workbench/observability/narrate.ts）这一张分类表；
 * 主进程在门口只认形状（短的 kebab-case 标识），装不下一句话、一个路径或一个 URL。
 */
export const TELEMETRY_ERROR_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,39}$/
export type TelemetrySettingsView = {
  schemaVersion: 1
  enabled: boolean
  endpointMode: 'nomi'
  consentedAt: string | null
  installSessionId: string | null
  endpointConfigured: boolean
  status: TelemetryStatus
}
export type TelemetrySummaryItem = { eventName: string; timestamp: string }
export type TelemetrySummary = {
  pending: TelemetrySummaryItem[]
  sent: TelemetrySummaryItem[]
  pendingCount: number
  sentCount: number
  failedCount: number
  endpointConfigured: boolean
}
