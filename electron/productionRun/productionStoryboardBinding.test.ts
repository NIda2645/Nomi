import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createProductionRunRepository } from './productionRunRepository'
import { createProductionRunService } from './productionRunService'
import { approveLatestStoryboard } from './productionRunTestHelpers'

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-production-storyboard-binding-'))
}

async function plannedRun(root: string) {
  const repository = createProductionRunRepository({ projectDirResolver: () => root })
  const service = createProductionRunService({
    repository,
    projectRootResolver: () => root,
    requestRenderer: async (op) => {
      if (op === 'production.plan-directions') return { candidates: [{ key: 'a', title: '方向一', oneLiner: 'x' }, { key: 'b', title: '方向二', oneLiner: 'y' }] }
      if (op === 'production.plan-script') return { text: 'approved script text' }
      return {
        plan: {
          title: '有来源分镜',
          sourceScriptArtifactId: 'artifact-script-v1',
          sourceScriptVersion: 1,
          sourceScriptHash: 'script-hash-v1',
          anchors: [],
          shots: [{ index: 1, shotId: 'shot-stable-1', shotKind: 'video', durationSec: 5, anchorIds: [], prompt: 'p', ffDesc: 'ff', lfDesc: 'lf', variationType: 'small', camIdx: 1, continuity: 'same-room' }],
        },
      }
    },
  })
  service.createDraft({
    runId: 'run-storyboard-binding',
    projectId: 'project-1',
    playbook: { name: 'brand.promo', version: '1.0.0' },
    origin: { host: 'codex' },
    brief: { goal: 'test storyboard binding' },
  })
  await service.command('project-1', 'run-storyboard-binding', {
    commandId: 'direction-approved',
    expectedRevision: 0,
    type: 'gate.decide',
    payload: { gateId: 'gate-direction-v1', status: 'approved' },
    issuedAt: new Date().toISOString(),
  })
  let run = service.readFull('project-1', 'run-storyboard-binding')
  const script = run.artifacts.find((artifact) => artifact.kind === 'script')!
  const reviewed = await service.command('project-1', run.runId, {
    commandId: 'script-approved', expectedRevision: run.revision, type: 'script.review',
    payload: { artifactId: script.artifactId, decision: 'approved' }, issuedAt: new Date().toISOString(),
  })
  run = reviewed.run
  const deadline = Date.now() + 500
  while (!run.artifacts.some((artifact) => artifact.kind === 'storyboard') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    run = service.readFull('project-1', 'run-storyboard-binding')
  }
  await approveLatestStoryboard(service, 'project-1', 'run-storyboard-binding')
  run = service.readFull('project-1', 'run-storyboard-binding')
  return { service, run }
}

function sourcePayload(artifact: { sourceScriptArtifactId?: string; sourceScriptVersion?: number; sourceScriptHash?: string; sourceArtifactId?: string; sourceVersion?: number; sourceContentHash?: string }) {
  return {
    sourceScriptArtifactId: artifact.sourceScriptArtifactId || artifact.sourceArtifactId,
    sourceScriptVersion: artifact.sourceScriptVersion || artifact.sourceVersion,
    sourceScriptHash: artifact.sourceScriptHash || artifact.sourceContentHash,
  }
}

describe('production storyboard binding', () => {
  it('rejects attach when source script was changed after plan creation', async () => {
    const root = makeRoot()
    const { service, run } = await plannedRun(root)
    const storyboard = run.artifacts.find((artifact) => artifact.kind === 'storyboard')!
    const source = sourcePayload(storyboard)

    await expect(service.command('project-1', run.runId, {
      commandId: 'stale-attach',
      expectedRevision: run.revision,
      type: 'plan.attach',
      payload: {
        artifactId: storyboard.artifactId,
        ...source,
        sourceScriptHash: 'different-script-hash',
        bindings: [{
          nodeId: 'shot-stable-1', provider: 'local', model: 'demo-video', stageId: 'generate',
          metadata: { shotId: 'shot-stable-1', ffDesc: 'ff', lfDesc: 'lf', variationType: 'small', camIdx: 1, continuity: 'same-room', transition: { type: 'dissolve', durationFrames: 12 } },
        }],
      },
      issuedAt: new Date().toISOString(),
    })).rejects.toThrow(/stale|script/i)
  })

  it('fails closed when the file-backed storyboard provenance cannot be read', async () => {
    const root = makeRoot()
    const { service, run } = await plannedRun(root)
    const storyboard = run.artifacts.find((artifact) => artifact.kind === 'storyboard')!
    const source = sourcePayload(storyboard)
    fs.rmSync(path.join(root, storyboard.projectRelativePath!), { force: true })

    await expect(service.command('project-1', run.runId, {
      commandId: 'missing-storyboard-file',
      expectedRevision: run.revision,
      type: 'plan.attach',
      payload: {
        artifactId: storyboard.artifactId,
        ...source,
        bindings: [{ nodeId: 'shot-stable-1', provider: 'local', model: 'demo-video', stageId: 'generate' }],
      },
      issuedAt: new Date().toISOString(),
    })).rejects.toThrow(/unavailable|invalid|stale/i)
  })

  it('persists storyboard metadata in the production job binding', async () => {
    const root = makeRoot()
    const { service, run } = await plannedRun(root)
    const storyboard = run.artifacts.find((artifact) => artifact.kind === 'storyboard')!
    const source = sourcePayload(storyboard)

    const result = await service.command('project-1', run.runId, {
      commandId: 'attach-binding',
      expectedRevision: run.revision,
      type: 'plan.attach',
      payload: {
        artifactId: storyboard.artifactId,
        ...source,
        bindings: [{
          nodeId: 'shot-stable-1', provider: 'local', model: 'demo-video', stageId: 'generate',
          metadata: { shotId: 'shot-stable-1', ffDesc: 'ff', lfDesc: 'lf', variationType: 'small', camIdx: 1, continuity: 'same-room', transition: { type: 'dissolve', durationFrames: 12 } },
        }],
      },
      issuedAt: new Date().toISOString(),
    })

    expect(result.run.jobs[0]).toMatchObject({
      nodeId: 'shot-stable-1',
      ...source,
      metadata: { shotId: 'shot-stable-1', ffDesc: 'ff', lfDesc: 'lf', variationType: 'small', camIdx: 1, continuity: 'same-room', transition: { type: 'dissolve', durationFrames: 12 } },
    })
  })

  it('does not create a second confirmation after StoryboardPlan confirmation', async () => {
    const root = makeRoot()
    const { service, run } = await plannedRun(root)
    const storyboard = run.artifacts.find((artifact) => artifact.kind === 'storyboard')!
    const source = sourcePayload(storyboard)
    const payload = {
      artifactId: storyboard.artifactId,
      ...source,
      bindings: [{ nodeId: 'shot-stable-1', provider: 'local', model: 'demo-video', stageId: 'generate' }],
    }

    const first = await service.command('project-1', run.runId, {
      commandId: 'attach-once', expectedRevision: run.revision, type: 'plan.attach', payload, issuedAt: new Date().toISOString(),
    })
    const replay = await service.command('project-1', run.runId, {
      commandId: 'attach-once', expectedRevision: run.revision, type: 'plan.attach', payload: {}, issuedAt: new Date().toISOString(),
    })

    expect(first.run.gates.filter((gate) => gate.scope === 'budget_envelope')).toHaveLength(1)
    expect(replay.run.revision).toBe(first.run.revision)
    expect(replay.run.gates.filter((gate) => gate.scope === 'budget_envelope')).toHaveLength(1)
  })
})
