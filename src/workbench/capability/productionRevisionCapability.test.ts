import { beforeEach, describe, expect, it, vi } from 'vitest'

const runSingleShotAgent = vi.fn()

vi.mock('../ai/agentLoopMode', () => ({
  runSingleShotAgent: (...args: unknown[]) => runSingleShotAgent(...args),
}))
vi.mock('../generationCanvas/agent/runDirectionPlanner', () => ({ runDirectionPlanner: vi.fn() }))
vi.mock('../generationCanvas/agent/runStoryboardPlanner', () => ({ runStoryboardPlanner: vi.fn() }))

import { handleCapabilityApply } from './capabilityApplyHandler'

const VALID_PLAN = {
  title: '雨夜找猫',
  anchors: [],
  shots: [{ index: 1, shotId: 'shot-1', shotKind: 'video', durationSec: 3, anchorIds: [], prompt: '雨夜巷口，主角抬头' }],
}

describe('production.revise-storyboard renderer seam', () => {
  beforeEach(() => {
    runSingleShotAgent.mockReset()
  })

  it('asks the real planner for schema-shaped JSON and validates the returned plan', async () => {
    runSingleShotAgent.mockResolvedValue({ text: JSON.stringify(VALID_PLAN) })

    const result = await handleCapabilityApply('production.revise-storyboard', {
      projectId: 'project-1',
      runId: 'run-1',
      sourceContent: JSON.stringify(VALID_PLAN),
      instruction: '把第一镜改成更近的中景',
    }) as { plan?: unknown }

    expect(result.plan).toEqual(VALID_PLAN)
    const request = runSingleShotAgent.mock.calls[0][0] as Record<string, unknown>
    expect(String(request.prompt)).toContain('只输出 JSON')
    expect(String(request.prompt)).not.toContain('transition')
    expect(request).not.toHaveProperty('skillKey')
    expect(request).not.toHaveProperty('skillName')
    expect(request).not.toHaveProperty('history')
    expect(request.featureKey).toBe('nomi:production-script:project-1')
  })

  it('rejects prose instead of turning an unstructured model answer into a candidate', async () => {
    runSingleShotAgent.mockResolvedValue({ text: '我建议把第一镜拍得更近一些。' })

    await expect(handleCapabilityApply('production.revise-storyboard', {
      projectId: 'project-1',
      runId: 'run-1',
      sourceContent: JSON.stringify(VALID_PLAN),
      instruction: '改近景',
    })).rejects.toThrow()
  })
})
