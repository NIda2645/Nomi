// A5 系统通知 · 纯决策层（plan 2026-08-11-mcp-conversation-native-p0）。
// 「Nomi 在后台时，等审批 / 失败 / 提交结果不明 / 完成 能被看见」——四类才打扰，其余一律不吵（样张陆幕）。
// 本文件零 electron 依赖（可裸 node 单测）；发通知与聚焦在 productionNotificationsDesktop.ts。

import type { ProductionRun, RunEvent } from './productionRunTypes'
import { projectGenerationRecovery, type GenerationRecoveryProjection } from '../capabilityCore/generationRecoveryProjection'

export type ProductionNotice = {
  /** 去重键：同 run 同类事件在窗口期内只打扰一次。 */
  key: string
  title: string
  body: string
  target: { projectId: string; runId: string }
  recovery?: GenerationRecoveryProjection
}

type NoticeLocale = 'zh-CN' | 'en'

const COPY: Record<string, { zh: [string, string]; en: [string, string] }> = {
  attention: {
    zh: ['Nomi · 制作需要处理', '有任务卡住了，点击查看失败原因与恢复动作'],
    en: ['Nomi · Production needs attention', 'A job is stuck. Click to see the cause and recovery actions'],
  },
  submission_unknown: {
    zh: ['Nomi · 提交结果不明', '需要你对账供应商任务，避免重复扣费'],
    en: ['Nomi · Submission unknown', 'Reconcile the provider task to avoid double charges'],
  },
  gate: {
    zh: ['Nomi · 等你确认', '制作在门前停着，点击查看并决定'],
    en: ['Nomi · Waiting for your approval', 'Production is paused at a gate. Click to review and decide'],
  },
  completed: {
    zh: ['Nomi · 制作完成', '成片与素材已保存到项目，点击查看'],
    en: ['Nomi · Production complete', 'The final cut and assets are saved. Click to open'],
  },
}

function notice(kind: keyof typeof COPY, run: ProductionRun, locale: NoticeLocale, detail?: string, recovery?: GenerationRecoveryProjection): ProductionNotice {
  const [title, fallbackBody] = locale === 'en' ? COPY[kind].en : COPY[kind].zh
  return {
    key: `${kind}:${run.runId}`,
    title,
    body: detail?.trim() || fallbackBody,
    target: { projectId: run.projectId, runId: run.runId },
    ...(recovery ? { recovery } : {}),
  }
}

/**
 * 一批事件 → 至多一条通知（按严重度取最高）：需要处理 / 提交不明 > 等确认 > 完成。
 * 不值得打扰的批次返回 null。detail 优先用事件自带的人话 message。
 */
export function decideProductionNotice(
  events: RunEvent[],
  run: ProductionRun,
  locale: NoticeLocale = 'zh-CN',
): ProductionNotice | null {
  if (!events.length) return null
  const byType = (type: string) => events.find((event) => event.type === type)
  const unknown = byType('job.submission_unknown')
  if (unknown) {
    const profile = unknown.payload?.providerCapabilityProfile === 'full_recovery' || unknown.payload?.providerCapabilityProfile === 'observe_only'
      ? unknown.payload.providerCapabilityProfile
      : 'submit_only'
    const recovery = projectGenerationRecovery({
      state: 'submission_unknown',
      profile,
      providerReference: typeof unknown.payload?.providerTaskId === 'string' ? unknown.payload.providerTaskId : undefined,
      locale,
    })
    return notice('submission_unknown', run, locale, unknown.message || recovery.message, recovery)
  }
  const attention = byType('job.needs_attention')
  if (attention || run.status === 'needs_attention') return notice('attention', run, locale, attention?.message)
  const gate = byType('gate.waiting')
  if (gate) return notice('gate', run, locale, gate.message)
  if (run.status === 'completed' && byType('run.status.changed')) return notice('completed', run, locale)
  return null
}

/**
 * 去重闸：同 key 在窗口期（默认 60s）内只放行一次——事件流是批量重放型，别让用户被连环轰。
 * 注入时钟可测。
 */
export function createNoticeDedupe(windowMs = 60_000, now: () => number = Date.now): (key: string) => boolean {
  const lastSent = new Map<string, number>()
  return (key: string) => {
    const at = now()
    const prior = lastSent.get(key)
    if (prior !== undefined && at - prior < windowMs) return false
    lastSent.set(key, at)
    return true
  }
}
