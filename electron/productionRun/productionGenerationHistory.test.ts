import { expect, it } from 'vitest'

import { findGenerationExecutionJob, readGenerationExecution } from './productionGenerationHistory'
import type { ProductionRunRepository } from './productionRunRepository'
import type { ProductionRun } from './productionRunTypes'

/**
 * 这两件事一条测试都没有过，而它们决定的是**批次轮询每镜每轮要付多少代价**，
 * 以及恢复路径上一个可分诊状态会不会被变成异常。
 */

type Contract = { contractHash: string }

function snapshot(digest: string, contractHash: string): ProductionRun {
  return {
    projectId: 'project-1', runId: 'run-1', planVersion: 1,
    jobs: [], gates: [], artifacts: [],
    generationPlan: {
      state: 'submitted', authorizationDigest: digest, authorizationGateId: 'gate-1',
      contract: { contractHash } as unknown as Contract,
      authorizationEnvelope: { jobs: [{ jobId: 'job-1', attempt: 1, contractHash }] },
    },
  } as unknown as ProductionRun
}

function runWithJob(currentDigest: string, jobDigest: string): ProductionRun {
  const run = snapshot(currentDigest, 'hash-current')
  return {
    ...run,
    jobs: [{ jobId: 'job-1', stageId: 'generate', attempt: 1, status: 'provider_accepted', authorizationDigest: jobDigest }],
  } as unknown as ProductionRun
}

/** Counts journal reads and, separately, how many archived entries were actually decoded. */
function countingRepository(archive: readonly ProductionRun[]) {
  const counters = { reverseReads: 0, decoded: 0, fullReads: 0 }
  const repository = {
    readEvents: () => { counters.fullReads += 1; return archive.map(run => ({ payload: { run } })) },
    readEventsReverse: function* () {
      counters.reverseReads += 1
      for (let index = archive.length - 1; index >= 0; index -= 1) {
        counters.decoded += 1
        yield { payload: { run: archive[index] } }
      }
    },
  } as unknown as ProductionRunRepository
  return { repository, counters }
}

it('a historical attempt is replayed once, not on every poll', () => {
  // 归档里最老的那条才带着这次执行的 digest：命中前要一路解到底，命中后一次都不用再解。
  const run = runWithJob('digest-current', 'digest-old')
  const archive = [snapshot('digest-old', 'hash-old'), snapshot('digest-x', 'hash-x'), snapshot('digest-current', 'hash-current')]
  const { repository, counters } = countingRepository(archive)
  const first = readGenerationExecution(repository, run, {})
  expect(first.contract.contractHash).toBe('hash-old')
  expect(first.currentAuthority).toBe(false)
  expect(counters.reverseReads).toBe(1)
  expect(counters.decoded).toBe(3)
  for (let poll = 0; poll < 12; poll += 1) {
    expect(readGenerationExecution(repository, run, {}).contract.contractHash).toBe('hash-old')
  }
  expect(counters.reverseReads).toBe(1)
  expect(counters.decoded).toBe(3)
  expect(counters.fullReads).toBe(0)
})

it('stops decoding at the newest matching snapshot instead of reading the whole journal', () => {
  const run = runWithJob('digest-current', 'digest-newest')
  const archive = [snapshot('digest-a', 'hash-a'), snapshot('digest-b', 'hash-b'), snapshot('digest-newest', 'hash-newest')]
  const { repository, counters } = countingRepository(archive)
  expect(readGenerationExecution(repository, run, {}).contract.contractHash).toBe('hash-newest')
  expect(counters.decoded).toBe(1)
})

it('an addressed execution that is missing or ambiguous is reported, not thrown, to the caller that can diagnose it', () => {
  const missing = snapshot('digest-current', 'hash-current')
  expect(findGenerationExecutionJob(missing, {})).toBeUndefined()
  const ambiguous = {
    ...missing,
    jobs: [
      { jobId: 'job-1', stageId: 'generate', attempt: 1, status: 'ready' },
      { jobId: 'job-2', stageId: 'generate', attempt: 1, status: 'ready' },
    ],
  } as unknown as ProductionRun
  expect(findGenerationExecutionJob(ambiguous, {})).toBeUndefined()
  const { repository } = countingRepository([])
  expect(() => readGenerationExecution(repository, missing, {})).toThrow(/identity is missing or ambiguous/)
})
