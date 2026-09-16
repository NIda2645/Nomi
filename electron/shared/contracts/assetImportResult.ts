/** Ordinary data crosses IPC; Error prototypes and custom properties do not. */
export type AssetImportFailure = Readonly<{
  code: 'capability_execution_failed' | 'project_binding_stale' | 'project_identity_unavailable'
  reason: 'unsupported-kind' | 'no-disk-space' | 'over-hard-cap' | 'import-failed'
}>

export type AssetImportResult<T> = { ok: true; asset: T } | { ok: false; failure: AssetImportFailure }

export class AssetImportError extends Error {
  readonly code: AssetImportFailure['code']
  readonly reason: AssetImportFailure['reason']
  constructor(failure: AssetImportFailure) {
    super(failure.reason)
    this.name = 'AssetImportError'
    this.code = failure.code
    this.reason = failure.reason
  }
}

export function unwrapAssetImportResult<T>(result: AssetImportResult<T>): T {
  if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') {
    throw new AssetImportError({ code: 'capability_execution_failed', reason: 'import-failed' })
  }
  if (!result.ok) {
    const failure = result.failure
    if (!failure || typeof failure !== 'object' || Array.isArray(failure)
      || !['capability_execution_failed', 'project_binding_stale', 'project_identity_unavailable'].includes(failure.code)
      || !['unsupported-kind', 'no-disk-space', 'over-hard-cap', 'import-failed'].includes(failure.reason)) {
      throw new AssetImportError({ code: 'capability_execution_failed', reason: 'import-failed' })
    }
    throw new AssetImportError(failure)
  }
  if (!Object.prototype.hasOwnProperty.call(result, 'asset') || result.asset === undefined) {
    throw new AssetImportError({ code: 'capability_execution_failed', reason: 'import-failed' })
  }
  return result.asset
}
