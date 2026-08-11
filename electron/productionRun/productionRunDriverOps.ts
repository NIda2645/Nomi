// B0 前置抽层（plan 2026-08-11-mcp-conversation-native-phase-b）：driver 编排从 productionRunService
// 抽出成独立层（service 顶 800 行，后续工单要腾地方 —— R9 ≤800）。参照 productionRunControl.ts /
// productionRunEventTap.ts 的抽法：所有仓库读写、renderer 桥、路径工具经参数注入，保持行为零变化 +
// 可裸 node 单测。这四条 driver（拟分镜 / 生成 / 导出 / 对账）是「后端已有编排」，不是新功能。
//
// 为什么用 factory：driveReconciliation 成功后要重踢 driveGeneration（同层互相引用），且四条都闭包
// 复用同一组注入依赖（requireRun / executeInternal / requestRenderer / 路径工具 / in-flight 去重集）。

import crypto from 'node:crypto'

import { settlePauseIfQuiet } from './productionRunControl'
import type { ProductionRunRepository } from './productionRunRepository'
import type { ProductionRun } from './productionRunTypes'

/** Job ids intentionally contain a namespace separator (`job:run:node`), but artifact ids are
 * public deep-link identifiers. Keep the mapping stable, collision-resistant, and URL-safe. */
export function artifactIdentifierForJob(jobId: string): string {
  const base = jobId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'job'
  const suffix = crypto.createHash('sha256').update(jobId).digest('hex').slice(0, 10)
  return `artifact-job-${base}-${suffix}`
}

export type DriverOpsDeps = {
  repository: Pick<ProductionRunRepository, 'execute' | 'read'>
  sleep: (delayMs: number) => Promise<void>
  requireRun: (projectId: string, runId: string) => ProductionRun
  executeInternal: (
    projectId: string,
    runId: string,
    current: ProductionRun,
    type: string,
    payload: Record<string, unknown>,
    commandId: string,
  ) => { run: ProductionRun; events: unknown[] }
  requestRenderer: (op: string, payload: unknown, timeoutMs: number) => Promise<unknown>
  writeProjectJson: (projectId: string, relativePath: string, value: unknown) => void
  localAssetPath: (projectId: string, rawUrl: unknown) => string | undefined
  projectRelativePath: (projectId: string, rawPath: unknown, options?: { requireFile?: boolean }) => string
  stageValue: (run: ProductionRun, stageId: string, patch: Record<string, unknown>) => Record<string, unknown>
  // 宽松读取形状：默认走 runtime.TaskResult（status 是字面量联合、thumbnailUrl 可空），注入版走
  // ServiceDeps 的窄形状——两者都只被结构性读取（localAssetPath 忽略非字符串、status 会小写化），
  // 这里取二者的公共上界（string / string | null），避免抽层时凭空收紧契约（P1 不造并行类型）。
  reconcileProviderTask: (job: ProductionRun['jobs'][number]) => Promise<{
    status?: string
    assets?: Array<{ type?: string; url?: string; thumbnailUrl?: string | null }>
    error?: string
  }>
  /** 去重集：driver 单飞（一个 run 同时只跑一条编排）；由 service 持有并传入以跨调用共享。 */
  inFlight: Set<string>
  reconciliationInFlight: Set<string>
}

function planValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Storyboard planner returned no plan')
  const record = value as Record<string, unknown>
  const plan = record.plan
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('Storyboard planner returned no structured plan')
  return plan as Record<string, unknown>
}

export type DriverOps = {
  proposeStoryboard: (run: ProductionRun) => Promise<void>
  driveGeneration: (run: ProductionRun) => Promise<void>
  driveExport: (run: ProductionRun) => Promise<void>
  driveReconciliation: (projectId: string, runId: string, jobId: string) => Promise<void>
}

export function createDriverOps(deps: DriverOpsDeps): DriverOps {
  const {
    repository, sleep, requireRun, executeInternal, requestRenderer, writeProjectJson,
    localAssetPath, projectRelativePath, stageValue, reconcileProviderTask, inFlight, reconciliationInFlight,
  } = deps

  async function proposeStoryboard(run: ProductionRun): Promise<void> {
    if (inFlight.has(run.runId)) return
    if (run.status !== 'running' || run.stageId !== 'direction') return
    inFlight.add(run.runId)
    try {
      const planResult = await requestRenderer('production.plan-storyboard', {
        projectId: run.projectId,
        runId: run.runId,
        brief: run.brief,
        playbook: run.playbook,
      }, 5 * 60_000)
      const plan = planValue(planResult)
      const hash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex')
      const current = requireRun(run.projectId, run.runId)
      const scriptPath = `.nomi/runs/${run.runId}/script-v${current.planVersion}.json`
      const storyboardPath = `.nomi/runs/${run.runId}/storyboard-v${current.planVersion}.json`
      writeProjectJson(run.projectId, scriptPath, { schemaVersion: 1, kind: 'script', planHash: hash, brief: run.brief, plan })
      writeProjectJson(run.projectId, storyboardPath, { schemaVersion: 1, kind: 'storyboard', planHash: hash, plan })
      const timestamp = new Date().toISOString()
      const artifacts = [
        { artifactId: `artifact-script-v${current.planVersion}`, stageId: 'script', kind: 'script' as const, status: 'adopted' as const, projectRelativePath: scriptPath, createdAt: timestamp, adoptedAt: timestamp },
        { artifactId: `artifact-storyboard-v${current.planVersion}`, stageId: 'storyboard', kind: 'storyboard' as const, status: 'candidate' as const, projectRelativePath: storyboardPath, createdAt: timestamp },
      ]
      const result = repository.execute(run.projectId, run.runId, {
        commandId: `driver:${run.runId}:plan-proposed:${hash.slice(0, 16)}`,
        expectedRevision: current.revision,
        type: 'plan.proposed',
        payload: { artifacts },
        issuedAt: timestamp,
      })
      // The skill evidence is a separate durable fact, so the user can see that the director skill actually ran.
      repository.execute(run.projectId, run.runId, {
        commandId: `driver:${run.runId}:skill:${hash.slice(0, 16)}`,
        expectedRevision: result.run.revision,
        type: 'skill.evidence',
        payload: { skillName: 'brand.promo', version: run.playbook.version },
        issuedAt: timestamp,
      })
    } catch (error) {
      const current = repository.read(run.projectId, run.runId)
      if (current && current.status === 'running') {
        try {
          repository.execute(run.projectId, run.runId, {
            commandId: `driver:${run.runId}:plan-error:${current.revision}`,
            expectedRevision: current.revision,
            type: 'run.status',
            payload: { status: 'needs_attention' },
            issuedAt: new Date().toISOString(),
          })
        } catch {
          // Preserve the original planning failure; the run remains inspectable on disk.
        }
      }
      console.error('[nomi:production] storyboard planning failed:', error instanceof Error ? error.message : String(error))
    } finally {
      inFlight.delete(run.runId)
    }
  }

  async function driveGeneration(run: ProductionRun): Promise<void> {
    if (inFlight.has(run.runId)) return
    inFlight.add(run.runId)
    try {
      let current = requireRun(run.projectId, run.runId)
      if (current.status === 'ready') {
        current = executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'running' }, `driver-${run.runId}-generation-start`).run
      }
      const jobs = current.jobs.filter((job) => job.status === 'authorized' || job.status === 'submit_intent_persisted')
      for (const job of jobs) {
        current = requireRun(run.projectId, run.runId)
        if (current.status !== 'running') break // 花钱边界：暂停/取消后不再提交（已提交的收不回，只能跑完收尾）
        if (job.status === 'authorized') current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status: 'submit_intent_persisted' }, `driver-${job.jobId}-intent`).run
        current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status: 'submitting' }, `driver-${job.jobId}-submit`).run
        try {
          const result = await requestRenderer('production.generate-node', {
            projectId: run.projectId,
            runId: run.runId,
            jobId: job.jobId,
            nodeId: job.nodeId,
            maxAttemptsPerJob: current.policy.maxAttemptsPerJob,
            idempotencyKey: job.idempotencyKey,
          }, 30 * 60_000) as { assets?: Array<{ type?: string; url?: string; thumbnailUrl?: string }> }
          for (const status of ['provider_accepted', 'polling', 'downloading', 'validating_technical', 'validating_content'] as const) {
            current = requireRun(run.projectId, run.runId)
            current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status }, `driver-${job.jobId}-${status}`).run
          }
          const asset = result?.assets?.[0]
          const relativePath = localAssetPath(run.projectId, asset?.url)
          const thumbnailRelativePath = localAssetPath(run.projectId, asset?.thumbnailUrl)
          current = requireRun(run.projectId, run.runId)
          if (asset?.url && relativePath) {
            current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status: 'ready' }, `driver-${job.jobId}-ready`).run
            const kind = asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image'
            current = executeInternal(run.projectId, run.runId, current, 'artifact.add', {
              artifact: { artifactId: artifactIdentifierForJob(job.jobId), stageId: 'generate', jobId: job.jobId, kind, status: 'adopted', projectRelativePath: relativePath, ...(thumbnailRelativePath ? { thumbnailRelativePath } : {}), createdAt: new Date().toISOString(), adoptedAt: new Date().toISOString() },
            }, `driver-${job.jobId}-artifact`).run
            current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status: 'adopted' }, `driver-${job.jobId}-adopted`).run
          } else {
            current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status: 'needs_attention', patch: { errorCode: 'asset_not_localized', errorMessage: '生成已返回，但项目内没有可预览的本地素材' } }, `driver-${job.jobId}-asset-attention`).run
            if (current.status !== 'needs_attention') {
              current = executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'needs_attention' }, `driver-${run.runId}-asset-attention-${current.revision}`).run
            }
            return
          }
        } catch (error) {
          current = requireRun(run.projectId, run.runId)
          if (current.jobs.find((candidate) => candidate.jobId === job.jobId)?.status === 'submitting') {
            current = executeInternal(run.projectId, run.runId, current, 'job.status', { jobId: job.jobId, status: 'submission_unknown', patch: { errorCode: 'renderer_or_provider_unknown', errorMessage: '生成提交结果无法确认' } }, `driver-${job.jobId}-unknown-${current.revision}`).run
          }
          if (current.status !== 'needs_attention') {
            try { current = executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'needs_attention' }, `driver-${run.runId}-generation-attention-${current.revision}`).run } catch { /* preserve unknown job state */ }
          }
          console.error('[nomi:production] generation driver stopped:', error instanceof Error ? error.message : String(error))
          return
        }
      }
      current = settlePauseIfQuiet(repository, run.projectId, run.runId, requireRun(run.projectId, run.runId))
      if (current.status !== 'running') return
      if (current.jobs.some((job) => !['adopted', 'cancelled_remote', 'detached'].includes(job.status))) return
      current = executeInternal(run.projectId, run.runId, current, 'stage.upsert', { stage: stageValue(current, 'generate', { status: 'completed', completedAt: new Date().toISOString() }) }, `driver-${run.runId}-stage-generate`).run
      current = executeInternal(run.projectId, run.runId, current, 'stage.upsert', { stage: stageValue(current, 'qa', { status: 'completed', completedAt: new Date().toISOString() }) }, `driver-${run.runId}-stage-qa`).run
      current = executeInternal(run.projectId, run.runId, current, 'stage.upsert', { stage: stageValue(current, 'assemble', { status: 'running', startedAt: new Date().toISOString() }) }, `driver-${run.runId}-stage-assemble`).run
      const arrangement = await requestRenderer('production.arrange', { projectId: run.projectId, runId: run.runId }, 5 * 60_000)
      const timelinePath = `.nomi/runs/${run.runId}/timeline-v${current.planVersion}.json`
      writeProjectJson(run.projectId, timelinePath, { schemaVersion: 1, kind: 'timeline', arrangement })
      current = requireRun(run.projectId, run.runId)
      current = executeInternal(run.projectId, run.runId, current, 'artifact.add', { artifact: { artifactId: `artifact-timeline-v${current.planVersion}`, stageId: 'assemble', kind: 'timeline', status: 'adopted', projectRelativePath: timelinePath, createdAt: new Date().toISOString(), adoptedAt: new Date().toISOString() } }, `driver-${run.runId}-timeline`).run
      const exportGate = { gateId: `gate-export-v${current.planVersion}`, scope: 'export' as const, status: 'waiting' as const, planHash: crypto.createHash('sha256').update(JSON.stringify(arrangement)).digest('hex'), jobIds: [], title: 'Review rough cut and approve export', summary: 'Check pacing and media in Preview before explicitly approving the MP4 export.', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
      current = executeInternal(run.projectId, run.runId, current, 'gate.add', { gate: exportGate }, `driver-${run.runId}-export-gate`).run
      current = executeInternal(run.projectId, run.runId, current, 'stage.upsert', { stage: stageValue(current, 'assemble', { status: 'completed', completedAt: new Date().toISOString() }) }, `driver-${run.runId}-stage-assemble-complete`).run
      current = executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'awaiting_rough_cut_review' }, `driver-${run.runId}-rough-cut`).run
    } catch (error) {
      console.error('[nomi:production] generation/assembly driver failed:', error instanceof Error ? error.message : String(error))
    } finally {
      inFlight.delete(run.runId)
    }
  }

  async function driveExport(run: ProductionRun): Promise<void> {
    if (inFlight.has(run.runId)) return
    inFlight.add(run.runId)
    try {
      let current = requireRun(run.projectId, run.runId)
      current = executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'exporting' }, `driver-${run.runId}-export-start`).run
      const result = await requestRenderer('production.export', { projectId: run.projectId, runId: run.runId, outputName: `nomi-${run.runId}.mp4` }, 30 * 60_000) as { relativePath?: string; size?: number }
      const relativePath = projectRelativePath(run.projectId, result?.relativePath, { requireFile: true })
      current = requireRun(run.projectId, run.runId)
      current = executeInternal(run.projectId, run.runId, current, 'artifact.add', { artifact: { artifactId: `artifact-export-v${current.planVersion}`, stageId: 'export', kind: 'export', status: 'adopted', projectRelativePath: relativePath, createdAt: new Date().toISOString(), adoptedAt: new Date().toISOString() } }, `driver-${run.runId}-export-artifact`).run
      current = executeInternal(run.projectId, run.runId, current, 'stage.upsert', { stage: stageValue(current, 'export', { status: 'completed', completedAt: new Date().toISOString() }) }, `driver-${run.runId}-stage-export`).run
      executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'completed' }, `driver-${run.runId}-completed`)
    } catch (error) {
      const current = repository.read(run.projectId, run.runId)
      if (current && current.status === 'exporting') {
        try { executeInternal(run.projectId, run.runId, current, 'run.status', { status: 'needs_attention' }, `driver-${run.runId}-export-attention-${current.revision}`) } catch { /* preserve export error */ }
      }
      console.error('[nomi:production] export driver failed:', error instanceof Error ? error.message : String(error))
    } finally {
      inFlight.delete(run.runId)
    }
  }

  async function driveReconciliation(projectId: string, runId: string, jobId: string): Promise<void> {
    const key = `${projectId}:${runId}:${jobId}`
    if (reconciliationInFlight.has(key)) return
    reconciliationInFlight.add(key)
    try {
      while (true) {
        let current = requireRun(projectId, runId)
        let job = current.jobs.find((candidate) => candidate.jobId === jobId)
        if (!job || !['reconciling', 'provider_accepted', 'polling'].includes(job.status)) return
        const result = await reconcileProviderTask(job)
        const status = String(result.status || '').toLowerCase()
        if (['queued', 'running', 'processing', 'pending'].includes(status)) {
          if (job.status === 'reconciling') {
            current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'provider_accepted' }, `reconcile-${jobId}-accepted-${current.revision}`).run
            current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'polling' }, `reconcile-${jobId}-polling-${current.revision}`).run
          }
          if (current.status === 'needs_attention') {
            current = executeInternal(projectId, runId, current, 'run.status', { status: 'running' }, `reconcile-${runId}-running-${current.revision}`).run
          }
          await sleep(2_000)
          continue
        }
        if (status !== 'succeeded') {
          current = requireRun(projectId, runId)
          job = current.jobs.find((candidate) => candidate.jobId === jobId)
          if (job && ['reconciling', 'polling'].includes(job.status)) {
            if (job.status === 'reconciling') {
              current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'needs_attention', patch: { errorCode: 'reconcile_failed', errorMessage: result.error || '供应商任务未找到或已失败' } }, `reconcile-${jobId}-failed-${current.revision}`).run
            } else {
              current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'needs_attention', patch: { errorCode: 'reconcile_failed', errorMessage: result.error || '供应商任务未找到或已失败' } }, `reconcile-${jobId}-failed-${current.revision}`).run
            }
          }
          return
        }

        current = requireRun(projectId, runId)
        job = current.jobs.find((candidate) => candidate.jobId === jobId)
        if (!job) return
        if (job.status === 'reconciling') {
          current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'provider_accepted' }, `reconcile-${jobId}-accepted-${current.revision}`).run
          current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'polling' }, `reconcile-${jobId}-polling-${current.revision}`).run
        }
        for (const nextStatus of ['downloading', 'validating_technical', 'validating_content'] as const) {
          current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: nextStatus }, `reconcile-${jobId}-${nextStatus}-${current.revision}`).run
        }
        const asset = result.assets?.[0]
        const relativePath = localAssetPath(projectId, asset?.url)
        const thumbnailRelativePath = localAssetPath(projectId, asset?.thumbnailUrl)
        if (!asset?.url || !relativePath) {
          executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'needs_attention', patch: { errorCode: 'reconcile_asset_not_local', errorMessage: '对账找到了任务，但结果尚未落入本地项目' } }, `reconcile-${jobId}-asset-${current.revision}`)
          return
        }
        current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'ready' }, `reconcile-${jobId}-ready-${current.revision}`).run
        const kind = asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image'
        current = executeInternal(projectId, runId, current, 'artifact.add', {
          artifact: { artifactId: artifactIdentifierForJob(jobId), stageId: job.stageId, jobId, kind, status: 'adopted', projectRelativePath: relativePath, ...(thumbnailRelativePath ? { thumbnailRelativePath } : {}), createdAt: new Date().toISOString(), adoptedAt: new Date().toISOString() },
        }, `reconcile-${jobId}-artifact-${current.revision}`).run
        current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'adopted' }, `reconcile-${jobId}-adopted-${current.revision}`).run
        if (current.status === 'needs_attention') {
          current = executeInternal(projectId, runId, current, 'run.status', { status: 'running' }, `reconcile-${runId}-resume-${current.revision}`).run
        }
        void driveGeneration(current)
        return
      }
    } catch (error) {
      let current = repository.read(projectId, runId)
      const job = current?.jobs.find((candidate) => candidate.jobId === jobId)
      if (current && job && ['reconciling', 'polling'].includes(job.status)) {
        try {
          current = executeInternal(projectId, runId, current, 'job.status', { jobId, status: 'needs_attention', patch: { errorCode: 'reconcile_error', errorMessage: error instanceof Error ? error.message : String(error) } }, `reconcile-${jobId}-error-${current.revision}`).run
        } catch { /* Preserve the latest durable state. */ }
      }
    } finally {
      reconciliationInFlight.delete(key)
    }
  }

  return { proposeStoryboard, driveGeneration, driveExport, driveReconciliation }
}
