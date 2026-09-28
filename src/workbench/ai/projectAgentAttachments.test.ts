import { describe, expect, it } from 'vitest'
import {
  composerAttachmentsFromProjectAgentRefs,
  projectAgentAttachmentClaims,
} from './projectAgentAttachments'

describe('ProjectAgent attachment projection', () => {
  it('keeps missing recovered media visible and blocks sending incomplete input', () => {
    const restored = composerAttachmentsFromProjectAgentRefs([{ assetId: 'missing', version: 1 }])
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ assetId: 'missing', version: 1, status: 'error' })
    expect(restored[0]?.fileName).toBeTruthy()
    expect(() => projectAgentAttachmentClaims(restored)).toThrow('project_agent_attachment_not_ready')
  })

  it('P2B-ASSET-001 submits only an asset identity and version claim', () => {
    const refs = projectAgentAttachmentClaims([{
      id: 'upload-view-id',
      assetId: 'asset-a',
      contentHash: 'a'.repeat(64),
      fileName: 'reference.png',
      contentType: 'image/png',
      sizeBytes: 42,
      kind: 'image',
      status: 'ready',
      url: 'nomi-local://asset/project-a/assets/imported/reference.png',
    }])

    expect(refs).toEqual([{
      assetId: 'asset-a',
      version: 1,
    }])
  })

  it('restores a composer attachment only from a main-resolved canonical ref', () => {
    expect(composerAttachmentsFromProjectAgentRefs([{
      assetId: 'asset-a',
      contentHash: 'a'.repeat(64),
      version: 7,
      display: {
        url: 'nomi-local://asset/project-a/assets/imported/reference.png',
        fileName: 'reference.png',
        contentType: 'image/png',
        sizeBytes: 42,
        kind: 'image',
      },
    }])).toMatchObject([{
      id: 'asset-a',
      assetId: 'asset-a',
      contentHash: 'a'.repeat(64),
      status: 'ready',
      url: 'nomi-local://asset/project-a/assets/imported/reference.png',
    }])
  })

  it('S23: restored attachment versions survive the next send', () => {
    const restored = composerAttachmentsFromProjectAgentRefs([{ assetId: 'asset-a', version: 7,
      contentHash: 'a'.repeat(64), display: { url: 'nomi-local://asset/project-a/a.png',
        fileName: 'a.png', contentType: 'image/png', sizeBytes: 42, kind: 'image' } }])
    expect(projectAgentAttachmentClaims(restored)).toEqual([{ assetId: 'asset-a', version: 7 }])
  })

  it('refuses a display-only ready attachment without stored identity', () => {
    expect(() => projectAgentAttachmentClaims([{
      id: 'view-only',
      fileName: 'reference.png',
      contentType: 'image/png',
      sizeBytes: 42,
      kind: 'image',
      status: 'ready',
      url: 'nomi-local://asset/project-a/assets/imported/reference.png',
    }])).toThrow('project_agent_attachment_not_ready')
  })
})
