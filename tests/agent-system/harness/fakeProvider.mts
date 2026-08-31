import type { ExecutionContractV1 } from '../../../electron/capabilityCore/executionContract.js'

export type FakeProviderOutcome = 'success' | 'unknown' | 'reconcile'

export type FakeProviderBillingEvent = {
  billingEventId: string
  kind: 'effect'
  amount: number
  currency: string
  operationId: string
  providerTaskId: string
}

export type FakeProviderOperation = {
  operationId: string
  contractHash: string
  providerId: string
  modelId: string
  providerIdempotencyKey: string
  account: string
  profile: string
  endpoint: string
  outcome: FakeProviderOutcome
  responseFingerprint: string
  billingCurrency: string
  billingPerEffect: number
  providerTaskId?: string
  state: 'prepared' | 'submitted' | 'submission_unknown' | 'reconciled' | 'cancelled' | 'settled'
  effectCount: number
  billingCount: number
  billingEvents: FakeProviderBillingEvent[]
}

export type FakeProviderPrepareInput = {
  contract: ExecutionContractV1
  providerIdempotencyKey: string
  account: string
  profile: string
  endpoint: string
  outcome?: FakeProviderOutcome
  billingCurrency?: string
  billingPerEffect?: number
  responseFingerprint?: string
}

export type FakeProviderSubmitResult = {
  providerTaskId: string
  state: 'success' | 'unknown'
  raw: { outcome: FakeProviderOutcome; operationId: string; responseFingerprint: string }
}

export type FakeProviderQueryResult = {
  state: 'success' | 'unknown' | 'reconcile' | 'cancelled'
  providerTaskId: string
  raw: { outcome: FakeProviderOutcome; operationId: string; responseFingerprint: string }
}

export type FakeProviderReconcileResult = {
  disposition: 'found' | 'not_found' | 'indeterminate'
  providerTaskId?: string
  raw: { outcome: FakeProviderOutcome; operationId?: string; responseFingerprint?: string }
}

export type FakeProviderCancelResult = {
  disposition: 'requested' | 'confirmed' | 'already_terminal' | 'too_late'
  raw: { outcome: FakeProviderOutcome; operationId: string; responseFingerprint: string }
}

export type FakeProviderSettlement = {
  operationId: string
  providerTaskId: string
  contractHash: string
  effectCount: number
  billingCount: number
  billingEvents: readonly FakeProviderBillingEvent[]
  state: FakeProviderOperation['state']
}

export type FakeProvider = {
  providerId: string
  prepare: (input: FakeProviderPrepareInput) => FakeProviderOperation
  submit: (operationId: string) => FakeProviderSubmitResult
  query: (operationIdOrTaskId: string) => FakeProviderQueryResult
  reconcile: (input: {
    operationId?: string
    providerTaskId?: string
    idempotencyKey?: string
  }) => FakeProviderReconcileResult
  cancel: (operationIdOrTaskId: string) => FakeProviderCancelResult
  settle: (operationIdOrTaskId: string) => FakeProviderSettlement
  operations: () => readonly FakeProviderOperation[]
  findByTaskId: (providerTaskId: string) => FakeProviderOperation | undefined
}

function providerTaskIdFor(operationId: string): string {
  return `fake-task-${operationId.replace(/^op-/, '')}`
}

function defaultFingerprint(contract: ExecutionContractV1): string {
  return `${contract.contractHash}:${contract.providerId}:${contract.modelId}`
}

export function createFakeProvider(providerId = 'fake-provider'): FakeProvider {
  const operations = new Map<string, FakeProviderOperation>()
  const taskIds = new Map<string, string>()
  let operationSequence = 0

  function requiredOperation(operationIdOrTaskId: string): FakeProviderOperation {
    const direct = operations.get(operationIdOrTaskId)
    if (direct) return direct
    const byTask = taskIds.get(operationIdOrTaskId)
    if (byTask) {
      const operation = operations.get(byTask)
      if (operation) return operation
    }
    throw new Error(`Unknown fake provider operation: ${operationIdOrTaskId}`)
  }

  function createBillingEvent(operation: FakeProviderOperation): FakeProviderBillingEvent {
    return {
      billingEventId: `bill-${operation.operationId}-${operation.billingEvents.length + 1}`,
      kind: 'effect',
      amount: operation.billingPerEffect,
      currency: operation.billingCurrency,
      operationId: operation.operationId,
      providerTaskId: operation.providerTaskId ?? providerTaskIdFor(operation.operationId),
    }
  }

  function submit(operationId: string): FakeProviderSubmitResult {
    const operation = requiredOperation(operationId)
    if (operation.state === 'cancelled' || operation.state === 'settled') {
      return {
        providerTaskId: operation.providerTaskId ?? providerTaskIdFor(operation.operationId),
        state: operation.state === 'cancelled' ? 'unknown' : 'success',
        raw: {
          outcome: operation.outcome,
          operationId: operation.operationId,
          responseFingerprint: operation.responseFingerprint,
        },
      }
    }
    if (!operation.providerTaskId) {
      operation.providerTaskId = providerTaskIdFor(operation.operationId)
      taskIds.set(operation.providerTaskId, operation.operationId)
    }
    operation.state = operation.outcome === 'success' ? 'submitted' : 'submission_unknown'
    if (operation.effectCount === 0) {
      operation.effectCount = 1
      operation.billingCount = 1
      operation.billingEvents.push(createBillingEvent(operation))
    }
    return {
      providerTaskId: operation.providerTaskId,
      state: operation.outcome === 'success' ? 'success' : 'unknown',
      raw: {
        outcome: operation.outcome,
        operationId: operation.operationId,
        responseFingerprint: operation.responseFingerprint,
      },
    }
  }

  function query(operationIdOrTaskId: string): FakeProviderQueryResult {
    const operation = requiredOperation(operationIdOrTaskId)
    if (!operation.providerTaskId) operation.providerTaskId = providerTaskIdFor(operation.operationId)
    const state =
      operation.state === 'reconciled' || operation.state === 'settled'
        ? 'success'
        : operation.state === 'cancelled'
          ? 'cancelled'
          : operation.outcome === 'success'
            ? 'success'
            : operation.outcome === 'reconcile' && operation.state !== 'submission_unknown'
              ? 'reconcile'
              : 'unknown'
    return {
      state,
      providerTaskId: operation.providerTaskId,
      raw: {
        outcome: operation.outcome,
        operationId: operation.operationId,
        responseFingerprint: operation.responseFingerprint,
      },
    }
  }

  function reconcile(input: {
    operationId?: string
    providerTaskId?: string
    idempotencyKey?: string
  }): FakeProviderReconcileResult {
    const operation = input.operationId
      ? requiredOperation(input.operationId)
      : input.providerTaskId
        ? requiredOperation(input.providerTaskId)
        : undefined
    if (!operation) {
      return { disposition: 'indeterminate', raw: { outcome: 'unknown', operationId: input.operationId } }
    }
    if (!operation.providerTaskId) {
      operation.providerTaskId = providerTaskIdFor(operation.operationId)
      taskIds.set(operation.providerTaskId, operation.operationId)
    }
    if (operation.state === 'cancelled') {
      return {
        disposition: 'not_found',
        providerTaskId: operation.providerTaskId,
        raw: {
          outcome: operation.outcome,
          operationId: operation.operationId,
          responseFingerprint: operation.responseFingerprint,
        },
      }
    }
    if (operation.outcome === 'reconcile' || operation.state === 'submission_unknown') {
      operation.state = 'reconciled'
      return {
        disposition: 'found',
        providerTaskId: operation.providerTaskId,
        raw: {
          outcome: operation.outcome,
          operationId: operation.operationId,
          responseFingerprint: operation.responseFingerprint,
        },
      }
    }
    return {
      disposition: 'indeterminate',
      providerTaskId: operation.providerTaskId,
      raw: {
        outcome: operation.outcome,
        operationId: operation.operationId,
        responseFingerprint: operation.responseFingerprint,
      },
    }
  }

  function cancel(operationIdOrTaskId: string): FakeProviderCancelResult {
    const operation = requiredOperation(operationIdOrTaskId)
    operation.state = 'cancelled'
    if (!operation.providerTaskId) {
      operation.providerTaskId = providerTaskIdFor(operation.operationId)
      taskIds.set(operation.providerTaskId, operation.operationId)
    }
    return {
      disposition: operation.effectCount > 0 ? 'already_terminal' : 'confirmed',
      raw: {
        outcome: operation.outcome,
        operationId: operation.operationId,
        responseFingerprint: operation.responseFingerprint,
      },
    }
  }

  function settle(operationIdOrTaskId: string): FakeProviderSettlement {
    const operation = requiredOperation(operationIdOrTaskId)
    if (operation.state === 'cancelled')
      throw new Error(`Cannot settle a cancelled fake provider operation: ${operation.operationId}`)
    if (!operation.providerTaskId) {
      operation.providerTaskId = providerTaskIdFor(operation.operationId)
      taskIds.set(operation.providerTaskId, operation.operationId)
    }
    operation.state = 'settled'
    return {
      operationId: operation.operationId,
      providerTaskId: operation.providerTaskId,
      contractHash: operation.contractHash,
      effectCount: operation.effectCount,
      billingCount: operation.billingCount,
      billingEvents: operation.billingEvents.map((event) => structuredClone(event)),
      state: operation.state,
    }
  }

  function prepare(input: FakeProviderPrepareInput): FakeProviderOperation {
    const operationId = `op-${++operationSequence}`
    const operation: FakeProviderOperation = {
      operationId,
      contractHash: input.contract.contractHash,
      providerId: input.contract.providerId,
      modelId: input.contract.modelId,
      providerIdempotencyKey: input.providerIdempotencyKey,
      account: input.account,
      profile: input.profile,
      endpoint: input.endpoint,
      outcome: input.outcome ?? 'success',
      responseFingerprint: input.responseFingerprint ?? defaultFingerprint(input.contract),
      billingCurrency: input.billingCurrency ?? 'USD',
      billingPerEffect: input.billingPerEffect ?? 1,
      state: 'prepared',
      effectCount: 0,
      billingCount: 0,
      billingEvents: [],
    }
    operations.set(operationId, operation)
    return structuredClone(operation)
  }

  return {
    providerId,
    prepare,
    submit,
    query,
    reconcile,
    cancel,
    settle,
    operations: () => [...operations.values()].map((operation) => structuredClone(operation)),
    findByTaskId: (providerTaskId: string) => {
      const operationId = taskIds.get(providerTaskId)
      return operationId ? structuredClone(operations.get(operationId)!) : undefined
    },
  }
}
