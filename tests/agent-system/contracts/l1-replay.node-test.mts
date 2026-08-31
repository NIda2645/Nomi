import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createModuleRegistry } from '../../../electron/capabilityCore/moduleRegistry.js'
import { compileExecutionContract } from '../../../electron/capabilityCore/executionContract.js'
import {
  AGENT_SYSTEM_CASES,
  AGENT_SYSTEM_SCHEMA_VERSION,
  deserializeAgentSystemTrace,
  deserializeAgentSystemVerdict,
  serializeAgentSystemTrace,
  serializeAgentSystemVerdict,
} from '../schema.mts'
import { createEventLedgerHarness } from '../harness/eventLedgerHarness.mts'
import { createFakeMcpClient } from '../harness/fakeMcpClient.mts'
import { createFakeProvider } from '../harness/fakeProvider.mts'
import { createFakeSkillRegistry } from '../harness/fakeSkillRegistry.mts'
import { createScriptedModel } from '../harness/scriptedModel.mts'

function creatorHarnessCase() {
  const caseData = AGENT_SYSTEM_CASES.find((candidate) => candidate.caseId === 'J3')
  if (!caseData) throw new Error('Missing J3 agent-system case')
  return caseData
}

test('plan -> approval -> one fake effect -> settle replays through the agent-system trace schema', async () => {
  const caseData = creatorHarnessCase()
  const model = createScriptedModel([
    { kind: 'assistant_text', text: 'Plan drafted.' },
    { kind: 'approval_request', reason: 'One approval is needed before the fake effect.' },
    { kind: 'tool_call', name: 'fakeProvider.submit', callId: 'call-submit-1', arguments: { operationId: 'op-1' } },
    { kind: 'assistant_text', text: 'Settled.' },
  ])
  const skills = createFakeSkillRegistry([
    {
      name: 'brief-intake',
      directoryName: 'brief-intake',
      description: 'Turn a goal into a structured plan.',
      body: 'load brief and produce plan',
      permissions: ['context:read'],
    },
    {
      name: 'approval-gate',
      directoryName: 'approval-gate',
      description: 'Require one user approval before effect submission.',
      body: 'request approval once',
      permissions: ['generation:plan'],
    },
  ])
  const registry = createModuleRegistry([
    {
      moduleId: 'creator.plan',
      version: '1.0.0',
      inputKinds: ['text'],
      outputKinds: ['text'],
      modes: ['draft'],
      parameterSchema: {},
      assetInputSchema: {},
      providers: [
        {
          providerId: 'fake-provider',
          models: [
            {
              modelId: 'fake-model',
              modes: ['draft'],
              parameterSchema: {},
              capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
            },
          ],
        },
      ],
    },
  ])
  const contract = compileExecutionContract(
    {
      candidateId: 'candidate-j3',
      revision: 1,
      moduleId: 'creator.plan',
      providerId: 'fake-provider',
      modelId: 'fake-model',
      mode: 'draft',
      prompt: caseData.objective,
      parameters: {},
      references: [],
    },
    registry,
  )
  const provider = createFakeProvider('fake-provider')
  const prepared = provider.prepare({
    contract,
    providerIdempotencyKey: 'idem-1',
    account: 'test-account',
    profile: 'fixture',
    endpoint: 'fixture://provider',
    outcome: 'success',
    billingCurrency: 'USD',
    billingPerEffect: 1,
  })
  const mcp = createFakeMcpClient([
    {
      name: 'fakeProvider.submit',
      description: 'Submit one fake effect.',
      handler: async (input) => {
        const operationId = (input as { operationId?: string }).operationId
        if (!operationId) throw new Error('fakeProvider.submit requires an operationId')
        return provider.submit(operationId)
      },
    },
    {
      name: 'fakeProvider.settle',
      description: 'Settle the fake provider operation.',
      handler: async (input) => {
        const operationId = (input as { operationId?: string }).operationId
        if (!operationId) throw new Error('fakeProvider.settle requires an operationId')
        return provider.settle(operationId)
      },
    },
  ])
  const ledger = createEventLedgerHarness()

  ledger.append({
    eventId: 'plan-1',
    phase: 'plan',
    kind: 'plan',
    status: 'consumed',
    payload: {
      objective: caseData.objective,
      contractHash: contract.contractHash,
      skillHash: skills.load('brief-intake').hash,
    },
  })

  const first = model.next()
  assert.equal(first.kind, 'assistant_text')

  const approval = model.next()
  assert.equal(approval.kind, 'approval_request')
  ledger.append({
    eventId: 'approval-1',
    phase: 'approval',
    kind: 'approval',
    status: 'consumed',
    payload: { reason: approval.reason, approved: true },
  })

  const tool = model.next()
  assert.equal(tool.kind, 'tool_call')
  assert.equal(tool.name, 'fakeProvider.submit')
  const submitResult = (await mcp.callTool(tool.name, tool.arguments)) as Awaited<ReturnType<typeof provider.submit>>
  ledger.append({
    eventId: 'effect-1',
    phase: 'effect',
    kind: 'fake-provider.effect',
    status: 'consumed',
    payload: {
      effectId: submitResult.providerTaskId,
      count: 1,
      outcome: submitResult.state,
      billingCount: provider.operations()[0]?.billingCount ?? 0,
    },
  })

  const settleResult = (await mcp.callTool('fakeProvider.settle', { operationId: prepared.operationId })) as Awaited<
    ReturnType<typeof provider.settle>
  >
  ledger.append({
    eventId: 'settle-1',
    phase: 'settle',
    kind: 'settle',
    status: 'consumed',
    payload: {
      operationId: settleResult.operationId,
      providerTaskId: settleResult.providerTaskId,
      effectCount: settleResult.effectCount,
      billingCount: settleResult.billingCount,
      contractHash: settleResult.contractHash,
    },
  })

  const closing = model.next()
  assert.equal(closing.kind, 'assistant_text')
  model.assertComplete()

  const trace = ledger.toTrace({
    runId: 'run-j3',
    caseId: caseData.caseId,
    evidence: [
      {
        version: AGENT_SYSTEM_SCHEMA_VERSION,
        evidenceId: 'evidence-trace',
        kind: 'trace',
        label: 'ledger replay',
        uri: 'runs/run-j3/trace.jsonl',
      },
    ],
    notes: ['plan -> approval -> one fake effect -> settle'],
  })
  const verdict = ledger.toVerdict({
    runId: 'run-j3',
    caseId: caseData.caseId,
    status: 'pass',
    summary: 'A deterministic fake-provider replay preserved one effect and one settlement.',
  })

  assert.equal(trace.version, AGENT_SYSTEM_SCHEMA_VERSION)
  assert.equal(trace.items.length, 3)
  assert.equal(trace.effects.length, 1)
  assert.equal(trace.effects[0]?.count, 1)
  assert.equal(provider.operations()[0]?.effectCount, 1)
  assert.equal(provider.operations()[0]?.billingCount, 1)
  assert.equal(settleResult.state, 'settled')
  assert.deepEqual(deserializeAgentSystemTrace(serializeAgentSystemTrace(trace)), trace)
  assert.deepEqual(deserializeAgentSystemVerdict(serializeAgentSystemVerdict(verdict)), verdict)
})

test('fake provider reconcile recovers an unknown submission without duplicating effect or billing', async () => {
  const registry = createModuleRegistry([
    {
      moduleId: 'creator.plan',
      version: '1.0.0',
      inputKinds: ['text'],
      outputKinds: ['text'],
      modes: ['draft'],
      parameterSchema: {},
      assetInputSchema: {},
      providers: [
        {
          providerId: 'fake-provider',
          models: [
            {
              modelId: 'fake-model',
              modes: ['draft'],
              parameterSchema: {},
              capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true },
            },
          ],
        },
      ],
    },
  ])
  const contract = compileExecutionContract(
    {
      candidateId: 'candidate-reconcile',
      revision: 1,
      moduleId: 'creator.plan',
      providerId: 'fake-provider',
      modelId: 'fake-model',
      mode: 'draft',
      prompt: 'Recover one unknown provider submission.',
      parameters: {},
      references: [],
    },
    registry,
  )
  const provider = createFakeProvider('fake-provider')
  const prepared = provider.prepare({
    contract,
    providerIdempotencyKey: 'idem-2',
    account: 'test-account',
    profile: 'fixture',
    endpoint: 'fixture://provider',
    outcome: 'reconcile',
    billingCurrency: 'USD',
    billingPerEffect: 1,
  })

  const submitResult = provider.submit(prepared.operationId)
  assert.equal(submitResult.state, 'unknown')
  assert.equal(provider.operations()[0]?.effectCount, 1)
  assert.equal(provider.operations()[0]?.billingCount, 1)

  const reconcileResult = provider.reconcile({ operationId: prepared.operationId, idempotencyKey: 'idem-2' })
  assert.equal(reconcileResult.disposition, 'found')
  assert.equal(provider.query(prepared.operationId).state, 'success')

  const settleResult = provider.settle(prepared.operationId)
  assert.equal(settleResult.effectCount, 1)
  assert.equal(settleResult.billingCount, 1)
  assert.equal(provider.operations()[0]?.effectCount, 1)
  assert.equal(provider.operations()[0]?.billingCount, 1)
})
