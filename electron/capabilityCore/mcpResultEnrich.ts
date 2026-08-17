// 交付②④ · 生成结果富化（App 侧，跨 RPC 前给 result 补两样非 Electron 宿主也能用的东西）：
//   · _nomiThumbnail：≤512px JPEG 缩略图 base64（协议层拼成 MCP image content block）。
//   · _nomiPreviewUrl：签名短 TTL HTTP 预览链（widget 缩略图用，127.0.0.1/production-preview?preview=…）。
// 两者都要 Electron/密钥/HTTP origin，故必须在 App 进程做（launcher 是 bare node、禁新依赖）；纯逻辑经注入桩单测。
// 铁律：任何失败一律优雅省略对应字段，绝不改动 result 其余部分、绝不做视频抽帧。
import { buildResultThumbnail, pickThumbnailSourceUrl, type ThumbnailImageToolkit } from './mcpPreviewImage'

/** nomi-local://asset/{projectId}/{relativePath} → {projectId, relativePath}；非该形状 → null。 */
export function parseLocalAssetRef(url: unknown): { projectId: string; relativePath: string } | null {
  if (typeof url !== 'string') return null
  const prefix = 'nomi-local://asset/'
  if (!url.startsWith(prefix)) return null
  const rest = url.slice(prefix.length)
  const slashIndex = rest.indexOf('/')
  if (slashIndex < 0) return null
  try {
    const projectId = decodeURIComponent(rest.slice(0, slashIndex))
    // 去掉可能的 query（本地素材链一般无 query，稳妥起见剥掉）。
    const pathPart = rest.slice(slashIndex + 1).split('?')[0]
    const relativePath = pathPart.split('/').map(decodeURIComponent).join('/')
    if (!projectId || !relativePath) return null
    return { projectId, relativePath }
  } catch {
    return null
  }
}

export type EnrichGenerateDeps = {
  projectId: string
  toolkit: ThumbnailImageToolkit
  readFileBytes: (path: string) => Buffer
  /** nomi-local URL → 磁盘绝对路径（真实注入 localProtocol.parseLocalAssetUrl）。 */
  resolveLocalFile: (url: string) => string | null
  /** 铸签名预览链（真实注入 artifactProjection.mintAssetPreviewUrl + secret + origin）；不可 mint → null。 */
  mintPreview: (args: { projectId: string; relativePath: string }) => { url: string; token: string; expiresAt: string } | null
  maxEdge?: number
  quality?: number
  maxBase64Bytes?: number
}

/**
 * 给一次 nomi_generate 的 result 富化（返回可能带 _nomiThumbnail / _nomiPreviewUrl 的浅拷贝；不改原对象）。
 * 只处理首/主图资产；视频无 poster、非本地素材、解析失败等一律跳过对应字段。
 */
export function enrichGenerateResult(result: unknown, deps: EnrichGenerateDeps): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result
  const enriched: Record<string, unknown> = { ...(result as Record<string, unknown>) }

  // 缩略图 base64（协议层拼 image content block）。
  const thumb = buildResultThumbnail(result, {
    toolkit: deps.toolkit,
    readLocalFile: deps.resolveLocalFile,
    readFileBytes: deps.readFileBytes,
    ...(deps.maxEdge !== undefined ? { maxEdge: deps.maxEdge } : {}),
    ...(deps.quality !== undefined ? { quality: deps.quality } : {}),
    ...(deps.maxBase64Bytes !== undefined ? { maxBase64Bytes: deps.maxBase64Bytes } : {}),
  })
  if (thumb) enriched._nomiThumbnail = thumb

  // 签名预览链（widget 缩略图）：对「拿来当缩略图的那张图」的本地素材链铸 token。需 projectId。
  if (deps.projectId) {
    const sourceUrl = pickThumbnailSourceUrl(result)
    const ref = sourceUrl ? parseLocalAssetRef(sourceUrl) : null
    // 只给本任务归属项目下的素材签（ref.projectId 应等于 deps.projectId；不等则不签，避免越权签别项目）。
    if (ref && ref.projectId === deps.projectId) {
      try {
        const minted = deps.mintPreview({ projectId: ref.projectId, relativePath: ref.relativePath })
        if (minted?.url) enriched._nomiPreviewUrl = minted.url
      } catch {
        // 签名失败（路径越界等）→ 不加签名链，widget 回退 nomi-local://。
      }
    }
  }
  return enriched
}
