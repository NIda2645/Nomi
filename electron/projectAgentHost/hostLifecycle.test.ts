import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HostConflictError, HostPolicyError, HostSettlementError, ProjectAgentHost } from './hostLifecycle'

const binding = { projectId: 'project-a', immutableProjectUuid: 'uuid-a', projectGeneration: 1 } as const

describe('ProjectAgentHost M1 lifecycle', () => {
  it('restarts and replays a 30+ turn append-only ledger without duplicate intent effects', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-host-m1-'))
    try {
      const first = ProjectAgentHost.open({ rootDir: root, binding, threadId: 'thread-a' })
      for (let index = 0; index < 32; index += 1) {
        const turn = await first.acceptIntent({ turnId: `turn-${index}`, goal: `goal-${index}`, expectedContextRevision: index, idempotencyKey: `intent-${index}` })
        const effect = await first.beginEffect({ turnId: turn.turnId, operationId: `op-${index}`, idempotencyKey: `effect-${index}`, cost: 1 })
        await first.authorizeEffect(effect.operationId)
        await first.settleEffect(effect.operationId, 'done')
        await first.settleTurn(turn.turnId)
      }
      const restarted = ProjectAgentHost.open({ rootDir: root, binding, threadId: 'thread-a' })
      expect(restarted.snapshot().thread.contextRevision).toBe(32)
      expect(restarted.snapshot().items.filter((item) => item.kind === 'user')).toHaveLength(32)
      const replay = await restarted.acceptIntent({ goal: 'goal-31', expectedContextRevision: 32, idempotencyKey: 'intent-31' })
      expect(replay.turnId).toBe('turn-31')
      expect(restarted.snapshot().events.filter((event) => event.type === 'effect.pending')).toHaveLength(32)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('uses CAS on contextRevision and keeps stale continuation from mutating the ledger', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-host-cas-'))
    try {
      const host = ProjectAgentHost.open({ rootDir: root, binding })
      const turn = await host.acceptIntent({ goal: 'write', expectedContextRevision: 0, idempotencyKey: 'intent' })
      await expect(host.continueTurn(turn.turnId, 0)).rejects.toBeInstanceOf(HostConflictError)
      expect(host.snapshot().thread.contextRevision).toBe(1)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('persists deviated through the same ledger owner and restores it after reopen', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-host-deviated-'))
    try {
      const host = ProjectAgentHost.open({ rootDir: root, binding })
      const turn = await host.acceptIntent({ goal: 'review', expectedContextRevision: 0, idempotencyKey: 'intent' })
      await host.markDeviated(turn.turnId, 'new canvas revision invalidated the prior assumption')
      const reopened = ProjectAgentHost.open({ rootDir: root, binding })
      expect(reopened.snapshot().turns[turn.turnId].deviated).toBe(true)
      expect(reopened.snapshot().events.filter((event) => event.type === 'turn.deviated')).toHaveLength(1)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('does not treat low-level end as completion until effects and items settle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-host-settle-'))
    try {
      const host = ProjectAgentHost.open({ rootDir: root, binding })
      const turn = await host.acceptIntent({ goal: 'generate', expectedContextRevision: 0, idempotencyKey: 'intent' })
      await host.beginEffect({ turnId: turn.turnId, operationId: 'op', idempotencyKey: 'effect', cost: 2 })
      await expect(host.settleTurn(turn.turnId)).rejects.toBeInstanceOf(HostSettlementError)
      expect(host.snapshot().turns[turn.turnId].status).toBe('settling')
      await host.authorizeEffect('op')
      await host.settleEffect('op', 'done')
      expect((await host.settleTurn(turn.turnId)).status).toBe('completed')
      expect(host.snapshot().events.some((event) => event.type === 'execution_settled')).toBe(true)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  it('keeps permission tiers independent from budget and rejects tainted escalation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-host-policy-'))
    try {
      const host = ProjectAgentHost.open({ rootDir: root, binding, policy: { tier: 'full-auto', budget: { currency: 'CNY', limit: 3, reserved: 0, actual: 0 } } })
      await expect(host.setPolicy({ tier: 'full-auto', budget: { currency: 'CNY', limit: 3, reserved: 0, actual: 0 } }, 'tainted')).rejects.toBeInstanceOf(HostPolicyError)
      const turn = await host.acceptIntent({ goal: 'generate', expectedContextRevision: 0, idempotencyKey: 'intent' })
      const effect = await host.beginEffect({ turnId: turn.turnId, operationId: 'op', idempotencyKey: 'effect', cost: 1 })
      expect(effect.authorized).toBe(true)
      await host.settleEffect('op', 'done')
      await host.settleTurn(turn.turnId)
      await expect(host.beginEffect({ turnId: turn.turnId, operationId: 'op-2', idempotencyKey: 'effect-2', cost: 3 })).rejects.toBeInstanceOf(HostPolicyError)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
})
