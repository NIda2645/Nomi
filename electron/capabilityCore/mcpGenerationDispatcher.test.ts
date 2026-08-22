import { describe, expect, it, vi } from 'vitest'

import { dispatch, RpcError } from './dispatcher'
import { createMcpGenerationPolicy } from './mcpGenerationPolicy'

function policy(options: { enabled?: boolean; p0Passed?: boolean; p2Passed?: boolean; p3Passed?: boolean } = {}) {
  return createMcpGenerationPolicy({
    env: { NOMI_MCP_GENERATION_SINGLE_SHOT_V1: options.enabled === true ? '1' : '' },
    checkpoints: {
      p0Passed: options.p0Passed === true,
      p2Passed: options.p2Passed === true,
      p3Passed: options.p3Passed === true,
    },
  })
}

function context(overrides: Record<string, unknown> = {}) {
  const productionRuns = {
    createDraft: vi.fn(async () => ({ runId: 'run-1', status: 'draft' })),
    readProjection: vi.fn(async () => ({ runId: 'run-1', status: 'draft' })),
    readEvents: vi.fn(async () => ({ events: [], nextCursor: 0 })),
    readArtifactProjection: vi.fn(async () => ({ artifactId: 'artifact-1' })),
    readFull: vi.fn(() => ({ revision: 1, gates: [] })),
    command: vi.fn(async () => ({ run: {}, events: [] })),
  }
  return {
    productionRuns,
    ctx: {
      runTask: vi.fn(async () => ({ status: 'succeeded' })),
      makeGateway: vi.fn(() => { throw new Error('semantic stubs must not resolve a canvas gateway') }),
      productionRuns,
      origin: { host: 'external' as const },
      generationPolicy: policy({ enabled: true }),
      ...overrides,
    },
  }
}

describe('generation.single-shot dispatcher policy boundary', () => {
  it('returns a typed feature_disabled error before any semantic service call', async () => {
    const { ctx, productionRuns } = context({ generationPolicy: policy() })

    await expect(dispatch('nomi_operation_create', { projectId: 'project-1' }, ctx as never))
      .rejects.toMatchObject({
        code: 'feature_disabled',
        nextAction: expect.any(String),
        phase: 'schema_only',
        capability: 'create',
      })
    expect(productionRuns.createDraft).not.toHaveBeenCalled()
    expect(ctx.runTask).not.toHaveBeenCalled()
    expect(ctx.makeGateway).not.toHaveBeenCalled()
  })

  it('returns phase_not_ready for write-like semantic routes before P0/P2', async () => {
    const { ctx, productionRuns } = context({ generationPolicy: policy({ enabled: true }) })

    await expect(dispatch('nomi_start_generation', { runId: 'run-1' }, ctx as never))
      .rejects.toMatchObject({
        code: 'phase_not_ready',
        nextAction: expect.any(String),
        phase: 'schema_only',
        capability: 'start',
      })
    expect(productionRuns.command).not.toHaveBeenCalled()
    expect(ctx.runTask).not.toHaveBeenCalled()
    expect(ctx.makeGateway).not.toHaveBeenCalled()
  })

  it('fails closed with not_ready even when the policy phase would allow a write', async () => {
    const { ctx, productionRuns } = context({
      generationPolicy: policy({ enabled: true, p0Passed: true, p2Passed: true }),
    })

    await expect(dispatch('nomi_operation_create', { projectId: 'project-1' }, ctx as never))
      .rejects.toMatchObject({
        code: 'not_ready',
        nextAction: expect.any(String),
        phase: 'e0_zero_credit',
        capability: 'create',
      })
    expect(productionRuns.createDraft).not.toHaveBeenCalled()
  })

  it('allows context/read only through an explicitly supplied handler', async () => {
    const generationContext = vi.fn(async (params: Record<string, unknown>) => ({ params, phase: 'schema_only' }))
    const { ctx } = context({ generationPolicy: policy({ enabled: true }), generationContext })

    await expect(dispatch('nomi_get_generation_context', { projectId: 'project-1' }, ctx as never))
      .resolves.toEqual({ params: { projectId: 'project-1' }, phase: 'schema_only' })
    expect(generationContext).toHaveBeenCalledWith({ projectId: 'project-1' })
  })

  it('returns not_ready for context/read when no handler exists', async () => {
    const { ctx } = context({ generationPolicy: policy({ enabled: true }) })

    await expect(dispatch('nomi_get_generation_context', {}, ctx as never))
      .rejects.toMatchObject({ code: 'not_ready', capability: 'context', phase: 'schema_only' })
  })

  it('keeps legacy production.start behaviour when no semantic fields are present', async () => {
    const { ctx, productionRuns } = context({ generationPolicy: policy() })

    await expect(dispatch('production.start', {
      projectId: 'project-1', playbook: 'brand.promo', brief: { goal: 'legacy draft' },
    }, ctx as never)).resolves.toMatchObject({ runId: 'run-1' })
    expect(productionRuns.createDraft).toHaveBeenCalledTimes(1)
  })

  it('firewalls legacy routes carrying P3 semantic bindings before any service call', async () => {
    const { ctx, productionRuns } = context({ generationPolicy: policy() })

    await expect(dispatch('production.start', {
      projectId: 'project-1', playbook: 'brand.promo', brief: { goal: 'must not route' },
      leaseHandle: 'lease-1', operationId: 'operation-1', runId: 'run-1', contractHash: 'hash-1',
    }, ctx as never)).rejects.toMatchObject({
      code: 'legacy_path_forbidden',
      nextAction: expect.any(String),
      phase: 'schema_only',
      capability: 'create',
    })
    expect(productionRuns.createDraft).not.toHaveBeenCalled()
  })

  it('firewalls the actual generate dispatcher method before it can reach the provider path', async () => {
    const { ctx } = context({ generationPolicy: policy() })

    await expect(dispatch('generate', {
      projectId: 'project-1', vendor: 'provider', modelKey: 'model', intent: 'image', prompt: 'legacy',
      leaseHandle: 'lease-1', operationId: 'operation-1', contractHash: 'hash-1',
    }, ctx as never)).rejects.toMatchObject({
      code: 'legacy_path_forbidden',
      capability: 'create',
      phase: 'schema_only',
    })
    expect(ctx.runTask).not.toHaveBeenCalled()
    expect(ctx.makeGateway).not.toHaveBeenCalled()
  })

  it.each([
    'executionBinding', 'requestFingerprint', 'providerIdempotencyKey', 'runtimeEnvelopeRef',
    'runtimeEnvelopeHash', 'fencingEpoch', 'envelopeState', 'providerTaskId', 'sessionId', 'nonce',
    'baseRevision', 'projectRevision', 'attempt', 'runtimeEnvelope',
  ])('firewalls canonical binding marker %s on generate', async (field) => {
    const { ctx } = context({ generationPolicy: policy() })
    await expect(dispatch('generate', {
      projectId: 'project-1', vendor: 'provider', modelKey: 'model', intent: 'image', prompt: 'legacy',
      [field]: 'sealed-value',
    }, ctx as never)).rejects.toMatchObject({ code: 'legacy_path_forbidden' })
    expect(ctx.runTask).not.toHaveBeenCalled()
    expect(ctx.makeGateway).not.toHaveBeenCalled()
  })

  it('firewalls canonical binding markers nested inside generate params', async () => {
    const { ctx } = context({ generationPolicy: policy() })
    await expect(dispatch('generate', {
      projectId: 'project-1', vendor: 'provider', modelKey: 'model', intent: 'image', prompt: 'legacy',
      params: { runtime: { executionBinding: { runId: 'run-1' } } },
    }, ctx as never)).rejects.toMatchObject({ code: 'legacy_path_forbidden' })
    expect(ctx.runTask).not.toHaveBeenCalled()
    expect(ctx.makeGateway).not.toHaveBeenCalled()
  })

  it('does not change unknown method errors', async () => {
    const { ctx } = context({ generationPolicy: policy({ enabled: true }) })
    await expect(dispatch('nomi_unknown_generation_method', {}, ctx as never))
      .rejects.toMatchObject({ httpStatus: 404, message: '未知方法: nomi_unknown_generation_method' })
  })

  it('keeps runId-only production.control compatibility while rejecting a semantic binding', async () => {
    const { ctx, productionRuns } = context({ generationPolicy: policy() })
    await dispatch('production.control', { projectId: 'project-1', runId: 'run-1', action: 'pause' }, ctx as never)
    expect(productionRuns.command).toHaveBeenCalledTimes(1)

    await expect(dispatch('production.control', {
      projectId: 'project-1', runId: 'run-1', action: 'pause', leaseHandle: 'lease-1', operationId: 'operation-1',
    }, ctx as never)).rejects.toMatchObject({ code: 'legacy_path_forbidden' })
    expect(productionRuns.command).toHaveBeenCalledTimes(1)
  })

  it.each([
    'production.get',
    'production.events',
    'production.artifact',
    'production.artifact.read',
    'production.artifact.revise',
    'production.artifact.review',
    'production.storyboard.materialize',
  ])('firewalls semantic bindings on legacy %s before read/write services', async (method) => {
    const { ctx, productionRuns } = context({ generationPolicy: policy() })
    await expect(dispatch(method, {
      projectId: 'project-1', runId: 'run-1', artifactId: 'artifact-1', leaseHandle: 'lease-1',
    }, ctx as never)).rejects.toMatchObject({
      code: 'legacy_path_forbidden',
      nextAction: expect.any(String),
    })
    expect(productionRuns.readProjection).not.toHaveBeenCalled()
    expect(productionRuns.readEvents).not.toHaveBeenCalled()
    expect(productionRuns.readArtifactProjection).not.toHaveBeenCalled()
    expect(productionRuns.command).not.toHaveBeenCalled()
  })

  it('does not infer a P3 binding from bare legacy identifiers', async () => {
    const { ctx, productionRuns } = context({ generationPolicy: policy() })
    await expect(dispatch('production.get', { projectId: 'project-1', runId: 'run-1' }, ctx as never))
      .resolves.toMatchObject({ runId: 'run-1' })
    expect(productionRuns.readProjection).toHaveBeenCalledWith('project-1', 'run-1')
  })

  it('exposes policy errors as RpcError instances', async () => {
    const { ctx } = context({ generationPolicy: policy() })
    try {
      await dispatch('nomi_operation_create', {}, ctx as never)
      throw new Error('expected dispatch to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(RpcError)
      expect(error).toMatchObject({ code: 'feature_disabled', capability: 'create' })
    }
  })
})
