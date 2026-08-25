import crypto from 'node:crypto'
import fs from 'node:fs'

import { createArtifactProjection, resolveOwnedArtifactFile } from './artifactProjection'
import { assertStoryboardSourceApproved } from './productionRunReducer'
import {
  metadataProjection,
  provenanceFromPayload,
  provenanceFromRecord,
  sameProvenance,
  completeProvenance,
  type ScriptProvenance,
} from './productionRunArtifactHelpers'
import type { ProductionRunRepository } from './productionRunRepository'
import type { ProductionRunProjection, ProductionArtifactProjection, MaterializeStoryboardResult } from './productionRunService'
import type { ProductionArtifact, ProductionRun, RunCommand } from './productionRunTypes'

type ArtifactOperationsDeps = {
  repository: ProductionRunRepository
  projectRootResolver: (projectId: string) => string | null
  previewSecret: string
  requestRenderer: (op: string, payload: unknown, timeoutMs: number) => Promise<unknown>
  requireRun: (projectId: string, runId: string) => ProductionRun
  command: (projectId: string, runId: string, command: RunCommand) => Promise<{ run: ProductionRun }>
  writeProjectJson: (projectId: string, relativePath: string, value: unknown) => void
  runProjection: (run: ProductionRun) => ProductionRunProjection
  identifier: (value: string, label: string) => string
  buildDeepLink: (projectId: string, runId: string, artifactId?: string) => string
}

function readArtifactProvenance(
  projectRootResolver: (projectId: string) => string | null,
  run: ProductionRun,
  artifact: ProductionArtifact,
): ScriptProvenance {
  const fromMetadata = provenanceFromRecord(artifact, artifact.kind === 'script' ? artifact.artifactId : undefined, artifact.kind)
  if (!artifact.projectRelativePath) return fromMetadata
  const root = projectRootResolver(run.projectId)
  if (!root) throw new Error('Storyboard source artifact root unavailable')
  let parsed: Record<string, unknown>
  try {
    const target = resolveOwnedArtifactFile(root, artifact.projectRelativePath)
    const value = JSON.parse(fs.readFileSync(target, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('artifact JSON is not an object')
    parsed = value as Record<string, unknown>
  } catch {
    // A file-backed artifact is the durable source of truth. If it is missing,
    // malformed, or escapes the project root, fail closed instead of trusting a
    // stale copy of provenance kept in the run snapshot.
    throw new Error('Storyboard source artifact content is unavailable or invalid')
  }
  const fromFile = provenanceFromRecord(parsed, artifact.kind === 'script' ? artifact.artifactId : undefined, artifact.kind)
  const contentHash = typeof parsed.content === 'string' ? crypto.createHash('sha256').update(parsed.content, 'utf8').digest('hex') : undefined
  if (artifact.kind === 'storyboard') {
    return { artifactId: fromFile.artifactId, version: fromFile.version, hash: contentHash ?? fromFile.hash }
  }
  return { artifactId: fromFile.artifactId ?? fromMetadata.artifactId, version: fromFile.version ?? fromMetadata.version, hash: contentHash ?? fromFile.hash ?? fromMetadata.hash }
}

export function assertStoryboardSourceFresh(
  projectRootResolver: (projectId: string) => string | null,
  run: ProductionRun,
  artifact: ProductionArtifact,
  payload: Record<string, unknown>,
): ScriptProvenance {
  const storyboardSource = readArtifactProvenance(projectRootResolver, run, artifact)
  const requestedSource = provenanceFromPayload(payload)
  // Renderer-originated legacy attach commands may omit the duplicated source
  // fields. In that case use the persisted plan provenance as the request,
  // never a wildcard; any partial or conflicting caller value is rejected.
  const effectiveRequested = Object.keys(requestedSource).length === 0 ? storyboardSource : requestedSource
  if (!completeProvenance(storyboardSource) || !completeProvenance(effectiveRequested) || !sameProvenance(storyboardSource, effectiveRequested)) throw new Error('Storyboard source script is stale: attach provenance must exactly match the reviewed plan')
  const currentScript = [...run.artifacts].reverse().find((candidate) => candidate.kind === 'script' && candidate.status === 'adopted')
  if (!currentScript) {
    if (Object.keys(storyboardSource).length > 0 || Object.keys(effectiveRequested).length > 0) throw new Error('Storyboard source script is stale: no approved script is available')
    return storyboardSource
  }
  const currentScriptSource = readArtifactProvenance(projectRootResolver, run, currentScript)
  const expected = { ...storyboardSource, ...effectiveRequested }
  if (!completeProvenance(currentScriptSource) || !sameProvenance(expected, currentScriptSource)) throw new Error('Storyboard source script is stale: the approved script changed after this plan was created')
  return currentScriptSource
}

function revisionText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Artifact revision returned no content')
  const raw = value as Record<string, unknown>
  const nested = raw.script && typeof raw.script === 'object' && !Array.isArray(raw.script) ? raw.script as Record<string, unknown> : undefined
  const text = [raw.text, raw.content, nested?.text, nested?.content].find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
  if (!text) throw new Error('Artifact revision returned no content')
  return text
}

export function createArtifactOperations(deps: ArtifactOperationsDeps) {
  const { repository, projectRootResolver, previewSecret, requestRenderer, requireRun, command, writeProjectJson, runProjection, identifier, buildDeepLink } = deps
  const revisionInFlight = new Map<string, Promise<Record<string, unknown>>>()
  const materializeInFlight = new Map<string, Promise<MaterializeStoryboardResult>>()

  function readArtifactProjection(projectId: string, runId: string, artifactId: string): ProductionArtifactProjection {
    const run = requireRun(projectId, runId)
    const safeArtifactId = identifier(artifactId, 'artifact')
    const artifact = run.artifacts.find((candidate) => candidate.artifactId === safeArtifactId)
    if (!artifact) throw new Error(`Production artifact not found in run ${run.runId}: ${safeArtifactId}`)
    const root = projectRootResolver(run.projectId)
    if (root && (artifact.projectRelativePath || artifact.thumbnailRelativePath)) {
      try { return createArtifactProjection({ projectRoot: root, run, artifact, secret: previewSecret }) } catch { /* metadata fallback below */ }
    }
    return metadataProjection(run, artifact)
  }

  function readArtifactContent(projectId: string, runId: string, artifactId: string): Record<string, unknown> {
    const run = requireRun(projectId, runId)
    const safeArtifactId = identifier(artifactId, 'artifact')
    const artifact = run.artifacts.find((candidate) => candidate.artifactId === safeArtifactId)
    if (!artifact) throw new Error(`Production artifact not found in run ${run.runId}: ${safeArtifactId}`)
    if (!artifact.projectRelativePath) throw new Error('Production artifact has no persisted content')
    const root = projectRootResolver(run.projectId)
    if (!root) throw new Error('Production artifact root unavailable')
    const target = resolveOwnedArtifactFile(root, artifact.projectRelativePath)
    if (fs.statSync(target).size > 10 * 1024 * 1024) throw new Error('Production artifact content is too large')
    let parsed: unknown
    try { parsed = JSON.parse(fs.readFileSync(target, 'utf8')) } catch { throw new Error('Production artifact content is unavailable') }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Production artifact content is invalid')
    const safe = readArtifactProjection(projectId, runId, safeArtifactId)
    const raw = parsed as Record<string, unknown>
    return { ...raw, ...safe, kind: artifact.kind, artifactId: artifact.artifactId, runId: run.runId, projectId: run.projectId, openInNomi: safe.openInNomi, nomiUri: safe.nomiUri }
  }

  function readScriptDraft(projectId: string, runId: string, artifactId: string): Record<string, unknown> {
    const value = readArtifactContent(projectId, runId, artifactId)
    if (value.kind !== 'script') throw new Error('Production artifact is not a script')
    if (typeof value.content !== 'string' || !value.content.trim()) throw new Error('Script draft content is unavailable')
    return value
  }

  async function requestArtifactRevisionImpl(input: { projectId: string; runId: string; artifactId: string; expectedVersion: number; instruction: string; kind: 'script' | 'storyboard' }): Promise<Record<string, unknown>> {
    const run = requireRun(input.projectId, input.runId)
    const artifact = run.artifacts.find((candidate) => candidate.artifactId === input.artifactId)
    if (!artifact || artifact.kind !== input.kind) throw new Error('Production artifact revision target not found')
    if ((artifact.version || 1) !== input.expectedVersion) throw new Error('Production artifact version conflict')
    if (!input.instruction.trim()) throw new Error('Artifact revision instruction is required')
    const sourceContent = readArtifactContent(input.projectId, input.runId, input.artifactId)
    const sourceVersion = artifact.version || 1
    const sourceContentHash = artifact.contentHash || ''
    const result = await requestRenderer(input.kind === 'script' ? 'production.revise-script' : 'production.revise-storyboard', {
      projectId: input.projectId, runId: input.runId, artifactId: input.artifactId, expectedVersion: input.expectedVersion, instruction: input.instruction, source: artifact.projectRelativePath,
      sourceContent: input.kind === 'storyboard' ? JSON.stringify(sourceContent.plan && typeof sourceContent.plan === 'object' ? sourceContent.plan : sourceContent) : sourceContent.content,
    }, 5 * 60_000)
    const current = requireRun(input.projectId, input.runId)
    const currentTarget = current.artifacts.find((candidate) => candidate.artifactId === input.artifactId)
    if (!currentTarget || currentTarget.kind !== input.kind || (currentTarget.version || 1) !== sourceVersion
      || currentTarget.status !== artifact.status || (currentTarget.contentHash || '') !== sourceContentHash) {
      throw new Error('Production artifact changed while revision was being generated; discard the stale result and retry')
    }
    const version = Math.max(0, ...current.artifacts.filter((candidate) => candidate.kind === input.kind).map((candidate) => candidate.version || 0)) + 1
    const artifactId = `artifact-${input.kind}-v${version}`
    const content = input.kind === 'script' ? revisionText(result) : JSON.stringify(result && typeof result === 'object' && !Array.isArray(result) && 'plan' in (result as Record<string, unknown>) ? (result as Record<string, unknown>).plan : result)
    const contentHash = crypto.createHash('sha256').update(content).digest('hex')
    const relativePath = `.nomi/runs/${input.runId}/${input.kind}-v${version}.json`
    const createdAt = new Date().toISOString()
    const sourceFields = input.kind === 'storyboard' ? { sourceArtifactId: artifact.sourceArtifactId || artifact.sourceScriptArtifactId, sourceVersion: artifact.sourceVersion ?? artifact.sourceScriptVersion, sourceContentHash: artifact.sourceContentHash || artifact.sourceHash || artifact.sourceScriptHash } : {}
    const revisionPlan = input.kind === 'storyboard' && result && typeof result === 'object' && !Array.isArray(result) && 'plan' in (result as Record<string, unknown>)
      ? (result as Record<string, unknown>).plan
      : input.kind === 'storyboard' ? JSON.parse(content) : undefined
    writeProjectJson(input.projectId, relativePath, { schemaVersion: 1, kind: input.kind, projectId: input.projectId, runId: input.runId, artifactId, version, source: 'external-mcp', content, contentHash, instruction: input.instruction, createdAt, ...(input.kind === 'storyboard' ? { plan: revisionPlan } : {}), ...sourceFields })
    const proposed = { artifactId, stageId: artifact.stageId, kind: input.kind, status: 'candidate' as const, version, source: 'external-mcp' as const, contentHash, reviewStatus: 'waiting' as const, projectRelativePath: relativePath, createdAt, ...sourceFields }
    repository.execute(input.projectId, input.runId, { commandId: `external:${input.runId}:${input.kind}-revision:${artifactId}`, expectedRevision: current.revision, type: 'plan.proposed', payload: { artifacts: [proposed] }, issuedAt: createdAt })
    return readArtifactContent(input.projectId, input.runId, artifactId)
  }

  async function reviewArtifact(input: { projectId: string; runId: string; artifactId: string; expectedVersion: number; decision: 'approved' | 'changes_requested' | 'rejected' }): Promise<ProductionArtifactProjection> {
    const current = requireRun(input.projectId, input.runId)
    const artifact = current.artifacts.find((candidate) => candidate.artifactId === input.artifactId)
    if (!artifact) throw new Error('Production artifact review target not found')
    if ((artifact.version || 1) !== input.expectedVersion) throw new Error('Production artifact version conflict')
    const result = await command(input.projectId, input.runId, { commandId: `external:${input.runId}:review:${input.artifactId}:${input.expectedVersion}:${input.decision}`, expectedRevision: current.revision, type: artifact.kind === 'script' ? 'script.review' : 'artifact.review', payload: { artifactId: input.artifactId, decision: input.decision }, issuedAt: new Date().toISOString() })
    return readArtifactProjection(input.projectId, input.runId, result.run.artifacts.find((candidate) => candidate.artifactId === input.artifactId)?.artifactId || input.artifactId)
  }

  async function materializeStoryboardImpl(input: { projectId: string; runId: string; artifactId: string; expectedVersion: number }): Promise<MaterializeStoryboardResult> {
    const run = requireRun(input.projectId, input.runId)
    const artifact = run.artifacts.find((candidate) => candidate.artifactId === input.artifactId)
    if (!artifact || artifact.kind !== 'storyboard') throw new Error('Production storyboard artifact not found')
    const version = artifact.version || 1
    if (version !== input.expectedVersion) throw new Error('Production storyboard artifact version conflict')
    if (artifact.status !== 'adopted' || (artifact.reviewStatus !== undefined && artifact.reviewStatus !== 'approved')) throw new Error('Approved storyboard artifact required before materialization')
    assertStoryboardSourceApproved(run, artifact.artifactId)
    const source = assertStoryboardSourceFresh(projectRootResolver, run, artifact, { sourceScriptArtifactId: artifact.sourceScriptArtifactId || artifact.sourceArtifactId, sourceScriptVersion: artifact.sourceScriptVersion || artifact.sourceVersion, sourceScriptHash: artifact.sourceScriptHash || artifact.sourceContentHash || artifact.sourceHash })
    const existingGate = run.gates.find((gate) => gate.gateId === `gate-contract-v${run.planVersion}`)
    if (existingGate && (existingGate.artifactId !== artifact.artifactId || existingGate.artifactVersion !== version)) {
      throw new Error('Production contract belongs to a different storyboard revision')
    }
    if (existingGate && run.jobs.length > 0) {
      return { ...runProjection(run), openInNomi: buildDeepLink(input.projectId, input.runId, artifact.artifactId), materialized: true, artifactId: artifact.artifactId, artifactVersion: version, createdNodeIds: run.jobs.map((job) => job.nodeId).filter((nodeId): nodeId is string => Boolean(nodeId)), bindings: run.jobs.map((job) => ({ nodeId: job.nodeId || job.jobId, provider: job.provider, model: job.model, stageId: job.stageId, ...(job.metadata ? { metadata: job.metadata } : {}) })) }
    }
    const content = readArtifactContent(input.projectId, input.runId, artifact.artifactId)
    const rawPlan = content.plan && typeof content.plan === 'object' && !Array.isArray(content.plan) ? content.plan as Record<string, unknown> : content
    if (!Array.isArray(rawPlan.anchors) || !Array.isArray(rawPlan.shots)) throw new Error('Storyboard artifact content is not a valid StoryboardPlan')
    const plan = { ...rawPlan, ...(source.artifactId ? { sourceScriptArtifactId: source.artifactId } : {}), ...(source.version ? { sourceScriptVersion: source.version } : {}), ...(source.hash ? { sourceScriptHash: source.hash } : {}) }
    const materializationOperationId = `materialize:${input.projectId}:${input.runId}:${artifact.artifactId}:v${version}`
    const rendered = await requestRenderer('production.materialize-storyboard', {
      projectId: input.projectId,
      runId: input.runId,
      artifactId: artifact.artifactId,
      operationId: materializationOperationId,
      materializationOperationId,
      plan,
    }, 5 * 60_000) as Record<string, unknown>
    const createdNodeIds = Array.isArray(rendered?.createdNodeIds) ? rendered.createdNodeIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : []
    const bindings = Array.isArray(rendered?.bindings) ? rendered.bindings.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))).map((binding) => ({ nodeId: typeof binding.nodeId === 'string' ? binding.nodeId.trim() : '', provider: typeof binding.provider === 'string' ? binding.provider.trim() : '', model: typeof binding.model === 'string' ? binding.model.trim() : '', stageId: typeof binding.stageId === 'string' && binding.stageId.trim() ? binding.stageId.trim() : 'generate', ...(binding.metadata && typeof binding.metadata === 'object' && !Array.isArray(binding.metadata) ? { metadata: binding.metadata as Record<string, unknown> } : {}) })).filter((binding) => binding.nodeId && binding.provider && binding.model) : []
    if (createdNodeIds.length === 0 || bindings.length === 0) throw new Error('Storyboard materialization returned no usable canvas bindings')
    const current = requireRun(input.projectId, input.runId)
    const attached = await command(input.projectId, input.runId, { commandId: `external:${input.runId}:materialize:${artifact.artifactId}:v${version}`, expectedRevision: current.revision, type: 'plan.attach', payload: { artifactId: artifact.artifactId, ...(source.artifactId ? { sourceScriptArtifactId: source.artifactId } : {}), ...(source.version ? { sourceScriptVersion: source.version } : {}), ...(source.hash ? { sourceScriptHash: source.hash } : {}), planHash: typeof content.planHash === 'string' ? content.planHash : artifact.contentHash, bindings }, issuedAt: new Date().toISOString() })
    return { ...runProjection(attached.run), openInNomi: buildDeepLink(input.projectId, input.runId, artifact.artifactId), materialized: true, artifactId: artifact.artifactId, artifactVersion: version, createdNodeIds, ...(typeof rendered.connectedCount === 'number' ? { connectedCount: rendered.connectedCount } : {}), bindings }
  }

  function requestArtifactRevision(input: Parameters<typeof requestArtifactRevisionImpl>[0]): Promise<Record<string, unknown>> {
    // Two concurrent edits of the same version are not interchangeable. Include
    // the instruction digest so the in-process coalescer never returns the first
    // user's revision to the second user's request.
    const instructionHash = crypto.createHash('sha256').update(input.instruction.trim(), 'utf8').digest('hex').slice(0, 16)
    const key = `${input.projectId}:${input.runId}:${input.artifactId}:${input.expectedVersion}:${input.kind}:${instructionHash}`
    const existing = revisionInFlight.get(key)
    if (existing) return existing
    const promise = requestArtifactRevisionImpl(input).finally(() => revisionInFlight.delete(key))
    revisionInFlight.set(key, promise)
    return promise
  }

  function materializeStoryboard(input: Parameters<typeof materializeStoryboardImpl>[0]): Promise<MaterializeStoryboardResult> {
    const key = `${input.projectId}:${input.runId}:${input.artifactId}:${input.expectedVersion}`
    const existing = materializeInFlight.get(key)
    if (existing) return existing
    const promise = materializeStoryboardImpl(input).finally(() => materializeInFlight.delete(key))
    materializeInFlight.set(key, promise)
    return promise
  }

  return { readArtifactProjection, readArtifactContent, readScriptDraft, requestArtifactRevision, reviewArtifact, materializeStoryboard }
}
