import { describe, expect, it } from 'vitest'

import { readScriptDraftSnapshot, scriptDraftContentHash, snapshotScriptDraft } from './scriptDraftSnapshot'

describe('ScriptDraft snapshot contract', () => {
  it('captures the complete applied text and a stable content hash', () => {
    const snapshot = snapshotScriptDraft({
      projectId: 'project-1', runId: 'run-1', artifactId: 'artifact-script-v1', version: 1,
      content: '开场：雨夜。\n人物走进门。', source: 'user', createdAt: '2026-08-21T00:00:00.000Z',
    })

    expect(snapshot).toMatchObject({
      schemaVersion: 1, kind: 'script', projectId: 'project-1', runId: 'run-1', artifactId: 'artifact-script-v1',
      version: 1, source: 'user', content: '开场：雨夜。\n人物走进门。',
      contentHash: scriptDraftContentHash('开场：雨夜。\n人物走进门。'),
    })
    expect(readScriptDraftSnapshot(snapshot)).toEqual(snapshot)
  })

  it('rejects empty or tampered snapshots instead of reusing a partial draft', () => {
    expect(() => snapshotScriptDraft({ content: '   ' })).toThrow('Script draft content is required')
    const snapshot = snapshotScriptDraft({ content: '完整稿件' })
    expect(readScriptDraftSnapshot({ ...snapshot, contentHash: 'tampered' })).toBeNull()
  })
})
