import * as React from 'react'
import i18n from '../../i18n'
import { getDesktopBridge, type DesktopAssetDto } from '../../desktop/bridge'
import { toast } from '../../ui/toast'

export type LocalImageImportResult = {
  created: DesktopAssetDto[]
  skippedUnsupportedCount: number
  failedCount: number
}

function isAbsoluteFilePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
}

export function filePathsFromDrop(files: ArrayLike<File>, getPathForFile?: (file: File) => string): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    let candidate: unknown
    try {
      candidate = getPathForFile?.(file)
    } catch {
      candidate = undefined
    }
    candidate ??= (file as File & { path?: unknown } | undefined)?.path
    const filePath = typeof candidate === 'string' ? candidate.trim() : ''
    if (!filePath || !isAbsoluteFilePath(filePath) || seen.has(filePath)) continue
    seen.add(filePath)
    paths.push(filePath)
  }
  return paths
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const closest = (target as { closest?: (selector: string) => unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, 'input, textarea, [contenteditable="true"]'))
}

export async function importImagePathsToLibrary(projectId: string | null, paths: string[]): Promise<LocalImageImportResult> {
  const normalizedProjectId = String(projectId || '').trim()
  if (!normalizedProjectId) throw new Error('projectId is required for local image copy')
  const copyFiles = getDesktopBridge()?.assets?.copyFiles
  if (!copyFiles) throw new Error('native local image copy is unavailable')
  return copyFiles({ projectId: normalizedProjectId, paths })
}

function reportImport(result: LocalImageImportResult): void {
  if (result.created.length > 0) {
    toast(i18n.t('assetLibrary.importedAssets', { count: result.created.length }), 'success')
  }
  if (result.skippedUnsupportedCount > 0) {
    toast(i18n.t('assetLibrary.skippedUnsupported', { count: result.skippedUnsupportedCount }), 'warning')
  }
  if (result.failedCount > 0) {
    toast(i18n.t('assetLibrary.localImportFailed', { count: result.failedCount }), 'error')
  }
}

type UseAssetLibraryLocalImportOptions = {
  projectId: string | null
  refreshProjectAssets: () => void
  refreshAllProjectAssets: () => void
}

export function useAssetLibraryLocalImport({
  projectId,
  refreshProjectAssets,
  refreshAllProjectAssets,
}: UseAssetLibraryLocalImportOptions): {
  isDragOver: boolean
  onDragOver: React.DragEventHandler<HTMLDivElement>
  onDragLeave: React.DragEventHandler<HTMLDivElement>
  onDrop: React.DragEventHandler<HTMLDivElement>
  onPaste: React.ClipboardEventHandler<HTMLDivElement>
} {
  const [isDragOver, setIsDragOver] = React.useState(false)

  const runImport = React.useCallback(async (paths: string[]) => {
    if (paths.length === 0) {
      toast(i18n.t('assetLibrary.localImportNoImages'), 'warning')
      return
    }
    try {
      const result = await importImagePathsToLibrary(projectId, paths)
      refreshProjectAssets()
      refreshAllProjectAssets()
      reportImport(result)
    } catch (error) {
      console.error('asset library local image copy failed', error)
      toast(i18n.t('assetLibrary.localImportFailed', { count: paths.length }), 'error')
    }
  }, [projectId, refreshAllProjectAssets, refreshProjectAssets])

  const onDragOver = React.useCallback<React.DragEventHandler<HTMLDivElement>>((event) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const onDragLeave = React.useCallback<React.DragEventHandler<HTMLDivElement>>((event) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragOver(false)
  }, [])

  const onDrop = React.useCallback<React.DragEventHandler<HTMLDivElement>>((event) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    setIsDragOver(false)
    void runImport(filePathsFromDrop(event.dataTransfer.files, getDesktopBridge()?.clipboard?.getPathForFile))
  }, [runImport])

  const onPaste = React.useCallback<React.ClipboardEventHandler<HTMLDivElement>>((event) => {
    if (isTextEditingTarget(event.target)) return
    event.preventDefault()
    const readFilePaths = getDesktopBridge()?.clipboard?.readFilePaths
    if (!readFilePaths) {
      toast(i18n.t('assetLibrary.localImportUnavailable'), 'error')
      return
    }
    void readFilePaths()
      .then((paths) => runImport(paths))
      .catch((error) => {
        console.error('asset library clipboard read failed', error)
        toast(i18n.t('assetLibrary.localImportFailed', { count: 1 }), 'error')
      })
  }, [runImport])

  return { isDragOver, onDragOver, onDragLeave, onDrop, onPaste }
}
