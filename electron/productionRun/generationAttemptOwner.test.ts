import { expect, it } from 'vitest'

import { nextGenerationAttempt } from './prepareProductionGenerationAuthorization'
import { addressedGenerationAttempt } from './productionGenerationSubmission'
import type { ProductionRun } from './productionRunTypes'

/**
 * 「这一镜是第几次尝试」曾经有两个推导式：授权侧按 `metadata.shotId` 数，提交侧按 jobId 前缀
 * （含 contractHash）数。两边今天给的答案一样，但口径不同，而且都不报错——这正是「一个语义没有
 * 主人就会被重新发明」的长相。现在只有一个 owner，两个问题都从它派生。
 */

const job = (shotId: string, attempt: number, jobId = `generation-run-1-hash-attempt-${attempt}`) =>
  ({ jobId, stageId: 'generate', attempt, status: 'ready', metadata: { shotId } })

const runWith = (jobs: ReadonlyArray<ReturnType<typeof job>>): ProductionRun =>
  ({ runId: 'run-1', projectId: 'project-1', jobs } as unknown as ProductionRun)

it('authorization asks for the next attempt and submission addresses the one that landed', () => {
  const fresh = runWith([])
  expect(nextGenerationAttempt(fresh, 'shot-a')).toBe(1)
  expect(addressedGenerationAttempt(fresh, 'shot-a')).toBe(1)

  const afterFirst = runWith([job('shot-a', 1)])
  expect(nextGenerationAttempt(afterFirst, 'shot-a')).toBe(2)
  expect(addressedGenerationAttempt(afterFirst, 'shot-a')).toBe(1)

  const afterSecond = runWith([job('shot-a', 1), job('shot-a', 2)])
  expect(nextGenerationAttempt(afterSecond, 'shot-a')).toBe(3)
  expect(addressedGenerationAttempt(afterSecond, 'shot-a')).toBe(2)
})

it('attempts belong to the durable shot, not to the parameters it was generated with', () => {
  // 改过参数 = 换了 contractHash = 换了 jobId 前缀。删掉的那份 owner 会从这里重新数 1，
  // 于是授权算出 2、提交算出 1，两个身份指向两条不同的 job。
  const afterParameterChange = runWith([job('shot-a', 1, 'generation-run-1-OTHERHASH-shot-a-attempt-1')])
  expect(nextGenerationAttempt(afterParameterChange, 'shot-a')).toBe(2)
  expect(addressedGenerationAttempt(afterParameterChange, 'shot-a')).toBe(1)
})

it('each shot keeps its own ledger, and the single-shot default is its own', () => {
  const mixed = runWith([job('shot-a', 1), job('shot-a', 2), job('shot-b', 1)])
  expect(nextGenerationAttempt(mixed, 'shot-a')).toBe(3)
  expect(nextGenerationAttempt(mixed, 'shot-b')).toBe(2)
  expect(nextGenerationAttempt(mixed, undefined)).toBe(1)
})
