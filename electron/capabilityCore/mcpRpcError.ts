/** Structured error boundary shared by the local RPC client and MCP transport. */
export type RpcErrorWireDetails = Readonly<{
  message?: string
  code?: string
  errorCode?: string
  nextAction?: string
  phase?: string
  capability?: string
}>

export class RpcTransportError extends Error {
  readonly code?: string
  readonly errorCode?: string
  readonly nextAction?: string
  readonly phase?: string
  readonly capability?: string

  constructor(message: string, details: RpcErrorWireDetails) {
    super(message)
    this.name = 'RpcTransportError'
    this.code = details.code
    this.errorCode = details.errorCode ?? details.code
    this.nextAction = details.nextAction
    this.phase = details.phase
    this.capability = details.capability
  }
}

/** Preserve structured policy details when an RPC response crosses stdio. */
export function rpcErrorFromPayload(body: unknown, status: number): Error {
  const record = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}
  const rawError = record.error
  const details = rawError && typeof rawError === 'object' && !Array.isArray(rawError)
    ? rawError as RpcErrorWireDetails
    : record.errorDetails && typeof record.errorDetails === 'object' && !Array.isArray(record.errorDetails)
      ? record.errorDetails as RpcErrorWireDetails
      : null
  const message = typeof rawError === 'string'
    ? rawError
    : details?.message || `RPC ${status}`
  if (details && (details.code || details.errorCode || details.nextAction || details.phase || details.capability)) {
    return new RpcTransportError(message, details)
  }
  return new Error(message)
}
