import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

let settingsRoot = ''
vi.mock('../settings/settingsRoot', () => ({ getSettingsRoot: () => settingsRoot }))

import { createProductionRunRepository } from './productionRunRepository'
import { createProductionRunService } from './productionRunService'
import { writeAgentApprovalPolicy } from '../settings/agentApprovalPolicySettings'

/**
 * 这一条钉的是**跨层**那一格：用户在 Agent 面板切的档，Run 这一侧真的读得到。
 * 没有它，`trustLevelFromApprovalPolicy` 可以完美地单测通过，而生产里依然恒 `key_confirm`
 * ——那正是 2026-09-21 之前的现场（policyResolver 压根不产出 trustLevel）。
 */
const dirs: string[] = []
function makeService() {
  settingsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-trust-settings-'))
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-trust-run-'))
  dirs.push(settingsRoot, root)
  const repository = createProductionRunRepository({ projectDirResolver: () => root })
  // 刻意**不传** policyResolver：要测的就是默认那条解析路径。
  return createProductionRunService({ repository, projectRootResolver: () => root, requestRenderer: async () => ({}) })
}

function draft(service: ReturnType<typeof makeService>, runId: string) {
  return service.createDraft({
    runId,
    projectId: 'project-1',
    playbook: { name: 'brand.promo', version: '1.0.0' },
    origin: { host: 'codex', actorId: 'codex' },
    brief: { goal: 'trust level derivation', durationSeconds: 30 },
  })
}

afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

describe('Run 的信任档来自用户的权限档', () => {
  it('用户选「全自动」→ 新 Run 就是 budget_only（不用任何人在请求体里自报）', () => {
    const service = makeService()
    writeAgentApprovalPolicy({ mode: 'project', spend: 'confirm' })
    draft(service, 'run-full-auto')
    expect(service.readFull('project-1', 'run-full-auto')!.policy.trustLevel).toBe('budget_only')
  })

  it('用户选「每步都问」→ 新 Run 是 confirm_all，且外部入口再要 budget_only 会被拒', () => {
    const service = makeService()
    writeAgentApprovalPolicy({ mode: 'step', spend: 'confirm' })
    draft(service, 'run-step')
    expect(service.readFull('project-1', 'run-step')!.policy.trustLevel).toBe('confirm_all')
    expect(() => service.createDraft({
      runId: 'run-step-2',
      projectId: 'project-1',
      playbook: { name: 'brand.promo', version: '1.0.0' },
      origin: { host: 'codex', actorId: 'codex' },
      brief: { goal: 'caller tries to relax', durationSeconds: 30 },
      policy: { trustLevel: 'budget_only' },
    })).toThrow(/set_trust/)
  })

  it('没选过 → 默认档 key_confirm（阳性对照：这正是修复前恒定的那个值）', () => {
    const service = makeService()
    draft(service, 'run-default')
    expect(service.readFull('project-1', 'run-default')!.policy.trustLevel).toBe('key_confirm')
  })
})
