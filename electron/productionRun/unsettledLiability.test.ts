import { describe, expect, it } from 'vitest'

import { hasUnsettledLiability } from './productionGenerationPlanEdits'
import type { ProductionRun } from './productionRunTypes'

/**
 * 「哪些状态允许重开一次付费请求」此前只由一个三段表达式回答，而且只有 `cancelled_remote`
 * 一个 case 覆盖到。这张表是那个问题的答案本身。
 */

const run = (budget: Partial<{ reserved: number; unsettled: number }>,
  jobs: ReadonlyArray<{ status: string; errorCode?: string }>): ProductionRun =>
  ({ budget: { reserved: 0, unsettled: 0, actual: 0, authorized: 0, currency: 'CNY', ...budget }, jobs } as unknown as ProductionRun)

describe('hasUnsettledLiability', () => {
  it.each([
    ['nothing ever ran', run({}, []), false],
    ['everything landed', run({}, [{ status: 'ready' }, { status: 'adopted' }]), false],
    ['the provider said it failed', run({}, [{ status: 'needs_attention', errorCode: 'provider_task_failed' }]), false],
    ['the remote cancelled it', run({}, [{ status: 'cancelled_remote' }]), false],
    ['a job is still in flight', run({}, [{ status: 'provider_accepted' }]), true],
    ['a job needs attention for some other reason', run({}, [{ status: 'needs_attention', errorCode: 'nomi_timeout' }]), true],
    ['the ledger itself is unsettled', run({ unsettled: 1 }, [{ status: 'ready' }]), true],
    // 同一个 `cancelled_remote`，两种答案：预留还挂着的时候它挡，预留归零之后它不挡。
    // 这正是三段判据互相重叠的那一格，以前读代码看不出来。
    ['a reservation still rides on a remotely cancelled job', run({ reserved: 2 }, [{ status: 'cancelled_remote' }]), true],
    ['a settled reservation over a finished job', run({ reserved: 2 }, [{ status: 'ready' }]), false],
  ])('%s', (_name, value, expected) => {
    expect(hasUnsettledLiability(value)).toBe(expected)
  })
})
