import type { AssetRef } from '../../assets/assetTypes'
import { hostedAssetUrl, importWorkbenchLocalAssetFile, type WorkbenchAssetDto } from '../../api/assetUploadApi'

type ImportLocalAsset = (
  file: File,
  name?: string,
  meta?: { projectId?: string | null },
) => Promise<WorkbenchAssetDto>

export type ClipNodeUploadResult = {
  asset: AssetRef | null
  error: Error | null
}

export function createExclusiveClipNodeUpload(): <T>(task: () => Promise<T>) => Promise<T | null> {
  let active = false
  return async <T>(task: () => Promise<T>): Promise<T | null> => {
    if (active) return null
    active = true
    try {
      return await task()
    } finally {
      active = false
    }
  }
}

/**
 * Keep the clip-node picker on the same local-asset contract as the rest of the
 * workbench. Returning an explicit result lets the UI keep the original File
 * around for a visible retry instead of turning an IPC failure into an
 * unhandled promise rejection.
 */
export async function importClipNodeAsset(
  file: File,
  projectId: string,
  importFile: ImportLocalAsset = importWorkbenchLocalAssetFile,
): Promise<ClipNodeUploadResult> {
  try {
    const uploaded = await importFile(file, file.name, { projectId })
    const renderUrl = hostedAssetUrl(uploaded)
    if (!renderUrl) throw new Error('uploaded asset url missing')
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    return {
      asset: {
        id: uploaded.id,
        name: uploaded.name || file.name,
        kind,
        renderUrl,
        source: 'project',
        origin: {
          source: 'project',
          projectId,
          relativePath: String(uploaded.data.relativePath || uploaded.name || file.name),
        },
      },
      error: null,
    }
  } catch (error) {
    return { asset: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}
