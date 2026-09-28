import type { ProjectAgentAttachmentClaim, ProjectAgentAttachmentRef } from '../../../electron/shared/workbenchInput'
import i18n from '../../i18n'

import type { ComposerAttachment } from './composer/composerAttachmentTypes'

export function projectAgentAttachmentClaims(
  attachments: readonly ComposerAttachment[],
): readonly ProjectAgentAttachmentClaim[] {
  return Object.freeze(
    attachments.map((attachment) => {
      if (
        attachment.status !== 'ready' ||
        !attachment.assetId ||
        !attachment.contentHash ||
        !attachment.url
      ) {
        throw new Error('project_agent_attachment_not_ready')
      }
      return Object.freeze({
        assetId: attachment.assetId,
        version: attachment.version ?? 1,
      })
    }),
  )
}

export function composerAttachmentsFromProjectAgentRefs(
  refs: readonly (Pick<ProjectAgentAttachmentRef, 'assetId'> & Partial<ProjectAgentAttachmentRef>)[],
): ComposerAttachment[] {
  return refs.map((ref) =>
    ref.display
      ? {
          id: ref.assetId,
          assetId: ref.assetId,
          ...(ref.version ? { version: ref.version } : {}),
          contentHash: ref.contentHash,
          fileName: ref.display.fileName,
          contentType: ref.display.contentType,
          sizeBytes: ref.display.sizeBytes,
          kind: ref.display.kind,
          status: 'ready' as const,
          url: ref.display.url,
        }
      : {
          id: ref.assetId, assetId: ref.assetId, version: ref.version,
          fileName: i18n.t('agentPanelV4.attachmentUnavailable'),
          contentType: '', sizeBytes: 0, kind: 'file' as const, status: 'error' as const,
          error: i18n.t('agentLaneError.agent_lane_original_media_unavailable'),
        },
  )
}
