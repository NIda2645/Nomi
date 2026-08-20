import { describe, expect, it } from 'vitest'

import { storyboardPlanSourceMatchesApprovedScript } from './StoryboardPlanEditor'

const plan = {
  sourceScriptArtifactId: 'artifact-script-v2',
  sourceScriptVersion: 2,
  sourceScriptHash: 'hash-v2',
}

describe('StoryboardPlanEditor provenance guard', () => {
  it('accepts the exact currently adopted script', () => {
    expect(storyboardPlanSourceMatchesApprovedScript(plan, [
      { artifactId: 'artifact-script-v2', kind: 'script', status: 'adopted', version: 2, contentHash: 'hash-v2' },
    ])).toBe(true)
  })

  it('rejects a plan after the script is revised, before creating canvas nodes', () => {
    expect(storyboardPlanSourceMatchesApprovedScript(plan, [
      { artifactId: 'artifact-script-v3', kind: 'script', status: 'adopted', version: 3, contentHash: 'hash-v3' },
    ])).toBe(false)
  })

  it('rejects when a provenance-bearing plan has no approved script', () => {
    expect(storyboardPlanSourceMatchesApprovedScript(plan, [])).toBe(false)
  })

  it('does not require provenance for a local, pre-production plan', () => {
    expect(storyboardPlanSourceMatchesApprovedScript({}, [])).toBe(true)
  })
})
