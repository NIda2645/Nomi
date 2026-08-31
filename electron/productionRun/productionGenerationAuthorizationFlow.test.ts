import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ProjectAgentHost } from '../projectAgentHost/hostLifecycle'

const binding = { projectId: 'production-project', immutableProjectUuid: 'production-uuid', projectGeneration: 1 } as const

describe('production generation authorization flow', () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))('persists gate step %i without duplicating an effect', async (step) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `nomi-production-gate-${step}-`))
    try {
      const host = ProjectAgentHost.open({ rootDir: root, binding, threadId: `thread-${step}`, policy: { tier: 'confirm', budget: { currency: 'CNY', limit: 100, reserved: 0, actual: 0 } } })
      const turn = await host.acceptIntent({ turnId: `turn-${step}`, goal: 'generate one shot', expectedContextRevision: 0, idempotencyKey: `intent-${step}` })
      const first = await host.beginEffect({ turnId: turn.turnId, operationId: `operation-${step}`, idempotencyKey: `effect-${step}`, cost: 1 })
      const replay = await host.beginEffect({ turnId: turn.turnId, operationId: `operation-${step}`, idempotencyKey: `effect-${step}`, cost: 1 })
      expect(replay).toEqual(first)
      expect(host.snapshot().policy.budget.reserved).toBe(0)
      await host.authorizeEffect(first.operationId)
      expect(host.snapshot().policy.budget.reserved).toBe(1)
      await host.settleEffect(first.operationId, 'done')
      expect(host.snapshot().policy.budget.actual).toBe(1)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
})
