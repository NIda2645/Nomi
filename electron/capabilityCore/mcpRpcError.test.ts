import { describe, expect, it } from 'vitest'

import { RpcError } from './dispatcher'
import { ReceiptScopeError } from './approvalReceipt'
import { buildToolErrorOutcome } from './mcpToolErrorResults'
import { rpcErrorFromPayload, rpcErrorWirePayload, RpcTransportError } from './mcpRpcError'

describe('structured local RPC errors', () => {
  it('keeps policy fields when decoding an object error payload', () => {
    const error = rpcErrorFromPayload({
      ok: false,
      error: {
        message: 'generation.single-shot phase_not_ready',
        code: 'phase_not_ready', nextAction: 'finish P0', phase: 'schema_only', capability: 'start',
      },
    }, 403)
    expect(error).toBeInstanceOf(RpcTransportError)
    expect(error).toMatchObject({
      message: 'generation.single-shot phase_not_ready', code: 'phase_not_ready', errorCode: 'phase_not_ready',
      nextAction: 'finish P0', phase: 'schema_only', capability: 'start',
    })
  })

  it('keeps ordinary legacy string errors as plain Errors', () => {
    const error = rpcErrorFromPayload({ ok: false, error: '未知方法: nope' }, 404)
    expect(error).not.toBeInstanceOf(RpcTransportError)
    expect(error).toMatchObject({ message: '未知方法: nope' })
  })

  it('serializes policy RpcErrors with typed recovery details and ordinary errors as strings', () => {
    // 2026-09-21：`phase_not_ready` / `feature_disabled` 与 `phase` 字段随 env flag 一起删除，
    // 这里换成仍然存在的那一族策略码（缺一张有效的项目租约）。
    const policyError = new RpcError('generation.single-shot lease_required', 403, {
      code: 'lease_required', nextAction: 'Open a new project session and retry', capability: 'start',
    })
    expect(rpcErrorWirePayload(policyError)).toEqual({
      message: 'generation.single-shot lease_required', code: 'lease_required',
      nextAction: 'Open a new project session and retry', capability: 'start',
    })
    expect(rpcErrorWirePayload(new Error('legacy failure'))).toBe('legacy failure')
    expect(rpcErrorWirePayload(new RpcError('bad request', 400))).toBe('bad request')
  })
  it.each(['document_not_found', 'project_not_found', 'node_not_found', 'capability_execution_failed'])(
    'preserves the public %s outcome across GUI RPC just like direct dispatch', (code) => {
      const failure = Object.assign(new Error('private implementation detail /tmp/project'), {
        code, secret: 'must-not-cross', cause: new Error('private cause'),
      })
      const direct = buildToolErrorOutcome('nomi_document_read', failure)
      const wire = rpcErrorWirePayload(failure)
      const transported = rpcErrorFromPayload({ ok: false, error: JSON.parse(JSON.stringify(wire)) }, 500)
      expect(buildToolErrorOutcome('nomi_document_read', transported)).toEqual(direct)
      expect(transported).toMatchObject({ code })
      expect(JSON.stringify(wire)).not.toContain('private')
      expect(JSON.stringify(wire)).not.toContain('must-not-cross')
    },
  )

  it('does not publish arbitrary native error codes or properties', () => {
    const failure = Object.assign(new Error('ordinary failure'), { code: 'ENOENT', path: '/private/file' })
    expect(rpcErrorWirePayload(failure)).toBe('ordinary failure')
  })

  it.each(['zh-CN', 'en'] as const)('keeps invalid receipt recovery machine-readable in %s', (locale) => {
    const failure = new ReceiptScopeError('Signed receipt is invalid')
    const transported = rpcErrorFromPayload({ error: rpcErrorWirePayload(failure) }, 500)
    const projected = buildToolErrorOutcome('nomi_integration', transported, locale)
    expect(projected).toEqual(buildToolErrorOutcome('nomi_integration', failure, locale))
    expect(projected.outcome).toMatchObject({ errorCode: 'receipt_invalid', nextActions: ['in_nomi'] })
  })

})
