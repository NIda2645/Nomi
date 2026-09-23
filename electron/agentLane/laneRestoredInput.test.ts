import { describe, expect, it } from 'vitest'
import { draftInputFromMessage } from '../shared/agentLane/laneInputMessage'
import { restoreLaneDraftInputs } from './laneRestoredInput'
import type { ProjectAgentAttachmentClaim, ProjectAgentAttachmentRef } from '../shared/workbenchInput'

const missing = { assetId: 'missing', version: 1 }
const ready = { assetId: 'ready', version: 1 }
const display = { url: 'nomi-local://asset/project/ready.png', fileName: 'ready.png', contentType: 'image/png', sizeBytes: 42, kind: 'image' as const }
function resolve(claims: readonly ProjectAgentAttachmentClaim[]): readonly ProjectAgentAttachmentRef[] {
  return claims.map(claim => {
    if (claim.assetId === missing.assetId) throw new Error('project_agent_attachment_invalid')
    return { ...claim, contentHash: 'a'.repeat(64), display }
  })
}

describe('cancelled input desktop restoration', () => {
  it('keeps the original target and template without restoring old authorization', () => {
    const intent = { documentId: 'old-document', target: { kind: 'document' as const, documentId: 'old-document', anchor: { kind: 'whole-document' as const } }, systemPrompt: 'original template' }
    const restored = draftInputFromMessage({ role: 'nomi.input', content: 'Original input', timestamp: 1,
      context: { ...intent, approvalPolicy: { mode: 'step', spend: 'confirm' } } })
    expect(restored).toMatchObject({ text: 'Original input', intent })
    expect(restored).not.toHaveProperty('approvalPolicy')
    expect(restored).not.toHaveProperty('intent.approvalPolicy')
  })
  it('retains text and the missing claim alongside a valid attachment after cancellation', () => {
    const input = { text: 'Keep both references.', skillKey: 'brand', skillSnapshot: { name: 'Brand', contentHash: 'skill-hash' }, attachments: [missing, ready] }
    expect(restoreLaneDraftInputs([input], resolve)).toEqual([{ ...input,
      attachments: [missing, { ...ready, contentHash: 'a'.repeat(64), display }],
    }])
  })

  it('keeps separate queued inputs and their distinct skill identities when all media is unavailable', () => {
    const inputs = [
      { text: 'First input.', skillKey: 'first', attachments: [missing] },
      { text: 'Second input.', skillKey: 'second', attachments: [ready] },
    ]
    expect(restoreLaneDraftInputs(inputs, () => { throw new Error('asset index unavailable') })).toEqual(inputs)
  })
})
