import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_SYSTEM_CASES,
  AGENT_SYSTEM_SCHEMA_VERSION,
  agentSystemArchitectureSeamSchema,
  agentSystemAuthorityAdapterOwners,
  agentSystemCaseSchema,
  agentSystemEvidenceSchema,
  agentSystemTraceSchema,
  agentSystemVerdictSchema,
  deserializeAgentSystemCase,
  deserializeAgentSystemEvidence,
  deserializeAgentSystemTrace,
  deserializeAgentSystemVerdict,
  detectHarnessMismatches,
  serializeAgentSystemCase,
  serializeAgentSystemEvidence,
  serializeAgentSystemTrace,
  serializeAgentSystemVerdict,
} from './schema.mjs'

test('creator cases round-trip through JSON and stay answer-free', () => {
  for (const creatorCase of AGENT_SYSTEM_CASES) {
    const serialized = serializeAgentSystemCase(creatorCase)
    assert.match(serialized, new RegExp(`"version":${AGENT_SYSTEM_SCHEMA_VERSION}`))
    assert.doesNotMatch(serialized, /"answer"|"solution"|"expectedAnswer"/)
    assert.deepEqual(deserializeAgentSystemCase(serialized), creatorCase)
    assert.equal(agentSystemCaseSchema.safeParse({ ...creatorCase, answer: 'hidden' }).success, false)
  }
})

test('trace, evidence and verdict schemas round-trip through JSON', () => {
  const evidence = {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    evidenceId: 'evidence-1',
    kind: 'trace',
    label: 'run trace',
    uri: 'runs/run-1/trace.jsonl',
    sha256: 'abc123',
  }
  const trace = {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    runId: 'run-1',
    caseId: 'J1',
    items: [{ itemId: 'item-1', kind: 'prompt', status: 'pending' }],
    effects: [{ effectId: 'effect-1', kind: 'provider.submit', count: 1 }],
    evidence: [evidence],
    notes: ['fixture-only'],
  }
  const verdict = {
    version: AGENT_SYSTEM_SCHEMA_VERSION,
    runId: 'run-1',
    caseId: 'J1',
    status: 'needs_attention',
    summary: 'fixture only',
    findings: [{ id: 'finding-1', status: 'blocked', note: 'missing item' }],
  }

  assert.deepEqual(deserializeAgentSystemEvidence(serializeAgentSystemEvidence(evidence)), evidence)
  assert.deepEqual(deserializeAgentSystemTrace(serializeAgentSystemTrace(trace)), trace)
  assert.deepEqual(deserializeAgentSystemVerdict(serializeAgentSystemVerdict(verdict)), verdict)
  assert.equal(
    agentSystemEvidenceSchema.safeParse({ ...evidence, version: AGENT_SYSTEM_SCHEMA_VERSION + 1 }).success,
    false,
  )
  assert.equal(agentSystemTraceSchema.safeParse({ ...trace, version: AGENT_SYSTEM_SCHEMA_VERSION + 1 }).success, false)
  assert.equal(
    agentSystemVerdictSchema.safeParse({ ...verdict, version: AGENT_SYSTEM_SCHEMA_VERSION + 1 }).success,
    false,
  )
})

test('version mismatches fail closed', () => {
  const wrongVersion = AGENT_SYSTEM_SCHEMA_VERSION + 1
  assert.throws(() => agentSystemCaseSchema.parse({ ...AGENT_SYSTEM_CASES[0], version: wrongVersion }), /expected 1/)
  assert.throws(
    () =>
      agentSystemTraceSchema.parse({
        version: wrongVersion,
        runId: 'run-1',
        caseId: 'J1',
        items: [],
        effects: [],
        evidence: [],
        notes: [],
      }),
    /expected 1/,
  )
  assert.throws(
    () =>
      agentSystemEvidenceSchema.parse({
        version: wrongVersion,
        evidenceId: 'evidence-1',
        kind: 'log',
        label: 'log',
        uri: 'runs/run-1/log.txt',
      }),
    /expected 1/,
  )
  assert.throws(
    () =>
      agentSystemVerdictSchema.parse({
        version: wrongVersion,
        runId: 'run-1',
        caseId: 'J1',
        status: 'fail',
        summary: 'unsupported',
        findings: [],
      }),
    /expected 1/,
  )
})

test('stable production seams are separate from planned test doubles and include the real current owners', () => {
  const surfaces = agentSystemAuthorityAdapterOwners.map((seam) => seam.owner)
  assert.deepEqual(
    surfaces.filter((owner) => owner.startsWith('electron/')),
    [
      'electron/harness/runtime/pi/session.mts',
      'electron/harness/runtime/pi/run.mts',
      'electron/harness/context/contextService.ts',
      'electron/productionRun/productionRunRuntime.ts',
      'electron/capabilityCore/rendererBridge.ts',
      'electron/skills/skillStore.ts',
    ],
  )
  assert.deepEqual(
    agentSystemAuthorityAdapterOwners.filter((seam) => seam.status === 'planned').map((seam) => seam.kind),
    ['test-double'],
  )
  assert.equal(
    agentSystemArchitectureSeamSchema.safeParse({
      status: 'planned',
      kind: 'test-double',
      surface: 'tests/agent-system/harness',
      owner: 'tests/agent-system/harness/',
    }).success,
    true,
  )
  assert.equal(
    agentSystemArchitectureSeamSchema.safeParse({
      status: 'current',
      kind: 'production-seam',
      surface: 'creation.agent',
      owner: 'electron/harness/runtime/pi/session.mts',
    }).success,
    true,
  )
})

test('harness self-test catches an unconsumed item and an effect count mismatch', () => {
  assert.deepEqual(
    detectHarnessMismatches({
      expectedItemIds: ['item-1', 'item-2'],
      consumedItemIds: ['item-1'],
      expectedEffectCount: 1,
      actualEffectCount: 2,
    }),
    [
      { kind: 'unconsumed-item', itemId: 'item-2' },
      { kind: 'effect-count-mismatch', expected: 1, actual: 2 },
    ],
  )
})
