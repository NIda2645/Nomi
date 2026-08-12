import type { DesktopProviderAdapterRun } from '../../desktop/bridge'

const TERMINAL_STAGES = new Set<DesktopProviderAdapterRun['stage']>([
  'completed',
  'partial',
  'failed',
  'needs_ai',
  'stale',
])

export function isAdapterRunTerminal(stage: DesktopProviderAdapterRun['stage']): boolean {
  return TERMINAL_STAGES.has(stage)
}

export function adapterRunProgress(run: DesktopProviderAdapterRun): {
  completed: number
  total: number
  verified: number
  failed: number
} {
  let completed = 0
  let verified = 0
  let failed = 0
  for (const model of run.models) {
    const terminal = model.modes.length > 0 && model.modes.every(mode => mode.state === 'verified' || mode.state === 'failed')
    if (!terminal) continue
    completed += 1
    if (model.modes.some(mode => mode.state === 'verified')) verified += 1
    else failed += 1
  }
  return { completed, total: run.selectedModelKeys.length, verified, failed }
}

type AdapterCardInput = { enabled: boolean; meta?: unknown }
export type AdapterProviderCardState = 'configured' | 'testing' | 'verified' | 'partial' | 'failed'

function modelAdapterState(model: AdapterCardInput): string {
  const meta = model.meta && typeof model.meta === 'object' ? model.meta as Record<string, unknown> : {}
  const adapter = meta.adapter && typeof meta.adapter === 'object' ? meta.adapter as Record<string, unknown> : {}
  return typeof adapter.state === 'string' ? adapter.state : ''
}

export function adapterProviderState(models: AdapterCardInput[]): {
  state: AdapterProviderCardState
  enabled: number
  total: number
} {
  const states = models.map(modelAdapterState)
  let state: AdapterProviderCardState = 'configured'
  if (states.includes('testing')) state = 'testing'
  else if (states.includes('partial')) state = 'partial'
  else if (states.includes('failed')) state = states.some(value => value === 'verified') ? 'partial' : 'failed'
  else if (states.length > 0 && states.every(value => value === 'verified')) state = 'verified'
  return { state, enabled: models.filter(model => model.enabled).length, total: models.length }
}

/**
 * 只在**验证正在跑**的时候锁——那会儿改了也会被跑完的结果覆盖。
 *
 * 曾经把 `failed` 也锁上，那是「接不进来」的最后一道墙（2026-08-11 用户接 DeepSeek 踩到）：
 * 验证没过 → 模型停用 → 勾选框还点不动 → 改了地址也不会重验 → 只能删掉整个供应商重来。
 * 而失败若源于我们自己探测的 bug（那次正是），重来多少遍都一样。
 * 判死权不归探测：没验过的照样能启用、能用，用户自己说了算。
 */
export function isAdapterModelLocked(meta: unknown): boolean {
  const root = meta && typeof meta === 'object' ? meta as Record<string, unknown> : {}
  const adapter = root.adapter && typeof root.adapter === 'object' ? root.adapter as Record<string, unknown> : {}
  return adapter.state === 'testing'
}
