// 交付②④ · 生成结果富化的 Electron 接线（把纯逻辑 mcpResultEnrich 接上真 nativeImage / fs / 本地协议解析 /
// 签名铸造）。单独成模块 = 让 mcpResultEnrich 保持无 electron 依赖可裸 node 单测（house 惯例：纯核 + 薄接线）。
import fs from 'node:fs'
import { nativeImage } from 'electron'

import { parseLocalAssetUrl } from '../protocol/localProtocol'
import { getArtifactPreviewSecret, mintAssetPreviewUrl } from '../productionRun/artifactProjection'
import { enrichGenerateResult } from './mcpResultEnrich'
import type { ThumbnailImageToolkit } from './mcpPreviewImage'

// nativeImage 缺失即优雅跳过缩略图（不崩）：部分单测只 partial-mock electron 的 app、不给 nativeImage，
// 读该绑定会被 vitest mock 守卫抛「No nativeImage export」。try 包住 = 守卫错误被吞成 null（降级无缩略图），
// 不把整条 generate RPC 打成 500；真 App 里 nativeImage 恒在，正常出图。
function nativeImageToolkit(): ThumbnailImageToolkit | null {
  try {
    return nativeImage && typeof nativeImage.createFromBuffer === 'function'
      ? (nativeImage as unknown as ThumbnailImageToolkit)
      : null
  } catch {
    return null
  }
}

/** 只在 method==='generate' 且有 result 时富化；其余原样返回。projectId 从请求 params 取（权威来源）。 */
export function enrichResultForMethod(method: string, params: Record<string, unknown>, result: unknown): unknown {
  if (method !== 'generate') return result
  const toolkit = nativeImageToolkit()
  const projectId = typeof params.projectId === 'string' ? params.projectId : ''
  return enrichGenerateResult(result, {
    projectId,
    // nativeImage 缺失 → 传一个恒抛的桩，buildResultThumbnail 的 try/catch 把它降级成「无缩略图」。
    toolkit: toolkit ?? { createFromPath: () => { throw new Error('no nativeImage') }, createFromBuffer: () => { throw new Error('no nativeImage') } },
    readFileBytes: (p) => fs.readFileSync(p),
    resolveLocalFile: (url) => parseLocalAssetUrl(url)?.filePath ?? null,
    mintPreview: ({ projectId: pid, relativePath }) => mintAssetPreviewUrl({ projectId: pid, relativePath, secret: getArtifactPreviewSecret() }),
  })
}
