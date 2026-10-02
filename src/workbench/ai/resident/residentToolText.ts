// Display-only redaction. No transcript cache or browser storage.
const MAX_TEXT_LENGTH = 2_000

function trimDisplayText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : ''
}

/** Remove common credential forms before any display text crosses storage. */
export function redactResidentSensitiveText(value: string): string {
  return trimDisplayText(value)
    .replace(/\b(?:sk|rk|pk|key|token)-[A-Za-z0-9_-]{12,}\b/gi, '[redacted]')
    .replace(/\b(?:bearer)\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, 'Bearer [redacted]')
    .replace(/((?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|password|authorization|lease(?:handle)?|credential)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
}

/**
 * 用户看得见的地方（Agent 面板的失败行、工具卡展开体）**不许出现**的两类东西：
 *   · 服务商 / 工具的原始 JSON（`{"error":{"code":…}}`、整段入参 / 回包）；
 *   · 内部标识：供应商路由键（`apimart/…`）、候选 / 操作 / 生成事务 id、`[nomi-classified: …]` 分类标记。
 * 判据是**形状**不是词：一句人话里不会出现 `"code":`，也不会出现 `op-<uuid>`。
 * 走查监视器（`tests/ux/full-walk/outcomeText.mjs`）用同一组形状在真实界面上验收。
 */
const INTERNAL_SHAPES: readonly RegExp[] = [
  /[{[]\s*"[\w$-]+"\s*:/,
  /"(?:message|code|type|param)"\s*:\s*(?:"|\d|null)/,
  /invalid_request_error|insufficient_quota|rate_limit_exceeded|authentication_error/,
  /\b(?:apimart|kie)\/[a-z0-9][\w.-]*/i,
  /\bcand-op-[\w-]+/,
  /\bgen-v2-[\w-]+/,
  /\bop-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  /\[nomi-classified:/,
]

export function leaksInternals(text: string): boolean {
  return INTERNAL_SHAPES.some((shape) => shape.test(text))
}

/** 我们自己加在服务商报文后面的分类标记（`laneProviderGuard` 追加，给重试判据读的）。界面上永远不印。 */
export function stripClassificationMarkers(text: string): string {
  return text.replace(/\s*\[nomi-classified:[^\]]*\]/g, '').trim()
}
