import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createProductionRunRepository } from './productionRunRepository'
import { createProductionRunService } from './productionRunService'

// A4 run 控制（plan 2026-08-11-mcp-conversation-native-p0）：pause/resume/cancel 的
// 状态机合法性 + 幂等近似 + 人话拒绝。MCP 与渲染端共用 run.control 这一条路径。

function makeService() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-production-control-'))
  const repository = createProductionRunRepository({ projectDirResolver: () => root })
  const requestRenderer = async () => { throw new Error('renderer must not be called by control tests') }
  const service = createProductionRunService({ repository, projectRootResolver: () => root, requestRenderer })
  return { service }
}

async function control(service: ReturnType<typeof makeService>['service'], runId: string, action: string) {
  const full = service.readFull('project-1', runId)
  if (!full) throw new Error('run missing')
  return service.command('project-1', runId, {
    commandId: `test-control-${action}-${full.revision}`,
    expectedRevision: full.revision,
    type: 'run.control',
    payload: { action },
    issuedAt: new Date().toISOString(),
  })
}

async function makeRunningRun(service: ReturnType<typeof makeService>['service'], runId: string) {
  service.createDraft({
    runId,
    projectId: 'project-1',
    playbook: { name: 'brand.promo', version: '1.0.0' },
    origin: { host: 'codex', actorId: 'codex' },
    brief: { goal: 'control test', durationSeconds: 30 },
  })
  const draft = service.readFull('project-1', runId)!
  // awaiting_direction → running 是状态机合法迁移（等价于方向门批准后的推进）。
  await service.command('project-1', runId, {
    commandId: `test-run-${runId}`,
    expectedRevision: draft.revision,
    type: 'run.status',
    payload: { status: 'running' },
    issuedAt: new Date().toISOString(),
  })
}

describe('run.control (A4)', () => {
  it('pause：running 且无在途任务 → 直接落 paused；再次 pause 幂等不写事件', async () => {
    const { service } = makeService()
    await makeRunningRun(service, 'run-c1')
    await control(service, 'run-c1', 'pause')
    expect(service.readFull('project-1', 'run-c1')!.status).toBe('paused')
    const revisionAfter = service.readFull('project-1', 'run-c1')!.revision
    const second = await control(service, 'run-c1', 'pause')
    expect(second.events).toHaveLength(0)
    expect(service.readFull('project-1', 'run-c1')!.revision).toBe(revisionAfter)
  })

  it('resume：paused → running；running 上 resume 幂等', async () => {
    const { service } = makeService()
    await makeRunningRun(service, 'run-c2')
    await control(service, 'run-c2', 'pause')
    await control(service, 'run-c2', 'resume')
    expect(service.readFull('project-1', 'run-c2')!.status).toBe('running')
    const second = await control(service, 'run-c2', 'resume')
    expect(second.events).toHaveLength(0)
  })

  it('cancel：running → cancelled，未提交任务不计费（预算不变）；再次 cancel 幂等', async () => {
    const { service } = makeService()
    await makeRunningRun(service, 'run-c3')
    const before = service.readFull('project-1', 'run-c3')!.budget
    await control(service, 'run-c3', 'cancel')
    const after = service.readFull('project-1', 'run-c3')!
    expect(after.status).toBe('cancelled')
    expect(after.budget.actual).toBe(before.actual)
    const second = await control(service, 'run-c3', 'cancel')
    expect(second.events).toHaveLength(0)
  })

  it('非法操作给人话拒绝：awaiting_direction 上 resume / pause 均报「无法…」', async () => {
    const { service } = makeService()
    service.createDraft({
      runId: 'run-c4',
      projectId: 'project-1',
      playbook: { name: 'brand.promo', version: '1.0.0' },
      origin: { host: 'codex', actorId: 'codex' },
      brief: { goal: 'illegal control test' },
    })
    await expect(control(service, 'run-c4', 'resume')).rejects.toThrow(/无法继续/)
    await expect(control(service, 'run-c4', 'pause')).rejects.toThrow(/无法暂停/)
  })

  it('未知 action 拒绝', async () => {
    const { service } = makeService()
    await makeRunningRun(service, 'run-c5')
    await expect(control(service, 'run-c5', 'explode')).rejects.toThrow(/Invalid production control action/)
  })
})
