type DropEventLike = {
  preventDefault: () => void
  stopPropagation: () => void
  dataTransfer: { files?: ArrayLike<File> | null }
}

export function droppedAssetFile(event: DropEventLike, uploading: boolean): File | null {
  event.preventDefault()
  event.stopPropagation()
  if (uploading) return null
  return event.dataTransfer.files?.[0] ?? null
}
