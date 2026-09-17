/**
 * 上传文件分流：这一族的唯一 owner。
 *
 * 2026-09-17 从 AssetLibraryPanel.tsx 抽出来（R9：那份文件贴着 800 行上限，反馈回路要在它里面
 * 挂一行失败面反馈钮）。逐字搬家，判据不变；面板与单测都从这里导入。
 */
import { dropKindFromFile } from '../generationCanvas/model/nodeAssetDrop'

// 上传文件分流（纯函数便于单测）。kind 判定：MIME 优先，缺/不匹配回落扩展名——与音频分支对称，
// 修「空 MIME 的图/视频被静默丢」(Gap B)。图/视频走画布节点(可拖画布)，音频落项目文件进库。
export type UploadClassification = {
  mediaFiles: File[]   // image / video → 画布素材节点
  audioFiles: File[]   // audio → 项目文件源（音频 tab）
  unsupported: File[]  // 既非图/视频也非音频 → 跳过并提示
}

export function classifyUploadFiles(files: File[]): UploadClassification {
  const mediaFiles: File[] = []
  const audioFiles: File[] = []
  const unsupported: File[] = []
  for (const file of files) {
    // kind 判定用 dropKindFromFile 单源（MIME 优先、octet-stream 回落扩展名），不再另写一遍。
    const kind = dropKindFromFile(file)
    if (kind === 'image' || kind === 'video') mediaFiles.push(file)
    else if (kind === 'audio') audioFiles.push(file)
    else unsupported.push(file)
  }
  return { mediaFiles, audioFiles, unsupported }
}
