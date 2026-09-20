import { describe, expect, it } from 'vitest'
import { runsForDocument, selectedRunForDocument, creationRunTitle } from './useCreationRunPlans'
import type { ProductionRunSummary } from '../../../../electron/productionRun/productionRunTypes'
const run = (runId: string, documentId?: string) => ({ runId, projectId: 'p', revision: 3, playbook: { name: 'storyboard' }, origin: { sourceDocument: documentId ? { documentId, revision: 2 } : undefined } }) as ProductionRunSummary

describe('creation Run projection', () => {
  const runs = [run('a1', 'a'), run('a2', 'a'), run('b1', 'b'), run('legacy')]
  it('keeps multiple plans under the recorded source and never guesses legacy ownership', () => {
    expect(runsForDocument(runs, 'p', 'a').map(r => r.runId)).toEqual(['a1', 'a2'])
    expect(runsForDocument(runs, 'p', 'b').map(r => r.runId)).toEqual(['b1'])
    expect(runsForDocument(runs, 'other', 'a')).toEqual([])
  })
  it('does not load another document’s selected Run or fall back to the first plan', () => {
    expect(selectedRunForDocument(runs, 'p', 'b', 'a1')).toBeNull()
    expect(selectedRunForDocument(runs, 'p', 'a', 'a2')?.runId).toBe('a2')
    expect(selectedRunForDocument(runs, 'p', 'a', null)).toBeNull()
  })
  it('uses durable authored titles instead of candidate prompt text', () => {
    expect(creationRunTitle({ ...run('a1', 'a'), authoring: { title: 'Plan A' } } as ProductionRunSummary)).toBe('Plan A')
  })
})
