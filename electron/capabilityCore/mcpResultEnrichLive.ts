// 交付②④ · 生成结果富化的 Electron 接线（把纯逻辑 mcpResultEnrich 接上真 nativeImage / fs / 本地协议解析 /
// 签名铸造）。单独成模块 = 让 mcpResultEnrich 保持无 electron 依赖可裸 node 单测（house 惯例：纯核 + 薄接线）。
import fs from 'node:fs'
import { nativeImage } from 'electron'

import { parseLocalAssetUrl } from '../protocol/localProtocol'
import { getArtifactPreviewSecret, mintAssetPreviewUrl } from '../productionRun/artifactProjection'
import { enrichArtifactResult, enrichGenerateResult } from './mcpResultEnrich'
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

// nativeImage 缺失 → 传一个恒抛的桩，buildResultThumbnail 的 try/catch 把它降级成「无缩略图」。
function safeToolkit(): ThumbnailImageToolkit {
  return nativeImageToolkit() ?? { createFromPath: () => { throw new Error('no nativeImage') }, createFromBuffer: () => { throw new Error('no nativeImage') } }
}
// nomi-local URL → 磁盘绝对路径（generate 与 artifact 两路共用同一映射与越界/符号链接守卫）。
const resolveLocalFile = (url: string): string | null => parseLocalAssetUrl(url)?.filePath ?? null

/**
 * 只在 method==='generate' / 'production.artifact' 且有 result 时富化，各自补一个 ≤64KB 缩略图 base64
 *（协议层拼成同一种 MCP image content block）；其余方法原样返回。projectId 从请求 params 取（权威来源）。
 * 两路复用同一 nativeImage / fs / URL→路径 接线，无并行实现（P1）。
 */
export function enrichResultForMethod(method: string, params: Record<string, unknown>, result: unknown): unknown {
  if (method === 'generate') {
    const projectId = typeof params.projectId === 'string' ? params.projectId : ''
    return enrichGenerateResult(result, {
      projectId,
      toolkit: safeToolkit(),
      readFileBytes: (p) => fs.readFileSync(p),
      resolveLocalFile,
      mintPreview: ({ projectId: pid, relativePath }) => mintAssetPreviewUrl({ projectId: pid, relativePath, secret: getArtifactPreviewSecret() }),
    })
  }
  // nomi_get_artifact：artifact 投影带 image preview 时补同款缩略图块（视频/非图产物优雅省略）。
  // 无需 projectId/mint——投影本身已带 preview.url 供 widget 用，这里只补 image content block。
  if (method === 'production.artifact') {
    return enrichArtifactResult(result, {
      toolkit: safeToolkit(),
      readFileBytes: (p) => fs.readFileSync(p),
      resolveLocalFile,
    })
  }
  return result
}
