import type { AssetRef } from '../../assets/assetTypes'
import { hostedAssetUrl, importWorkbenchLocalAssetFile, type WorkbenchAssetDto } from '../../api/assetUploadApi'
import { isProjectExecutionContextCurrent, isProjectImportCancellation, type ProjectExecutionContext } from '../../project/projectCanvasReadSurface'

type ImportLocalAsset = (
  file: File,
  name?: string,
  meta?: Parameters<typeof importWorkbenchLocalAssetFile>[2],
) => Promise<WorkbenchAssetDto>

export type ClipNodeUploadResult = {
  cancelled?: true
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
  context: ProjectExecutionContext,
  importFile: ImportLocalAsset = importWorkbenchLocalAssetFile,
): Promise<ClipNodeUploadResult> {
  // 目标项目只从发起动作签发的 context 派生，不再另收一个 projectId 标量（两个真相源会对不上）。
  const { projectId } = context.binding
  try {
    context.assertCurrent()
    const uploaded = await importFile(file, file.name, { projectId, projectBinding: context.binding, assertCurrent: context.assertCurrent })
    context.assertCurrent()
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
    if (!isProjectExecutionContextCurrent(context) || isProjectImportCancellation(error)) return { asset: null, error: null, cancelled: true }
    return { asset: null, error: error instanceof Error ? error : new Error(String(error)) }
  }
}
