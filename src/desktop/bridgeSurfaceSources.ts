/**
 * 「DesktopBridge 这张桥面」到底住在哪几个文件里 —— 唯一那份清单。
 *
 * 2026-09-17 把 src/desktop/bridge.ts 按领域拆开之后（bridge.ts 只剩组装 + 取桥函数），
 * 任何按源码文本判断桥面的断言只读 bridge.ts 都会扫不到东西并静默变绿。理由同
 * electron/preload/preloadSurfaceSources.ts：假绿和真绿长得一样。
 */
import fs from 'node:fs'
import path from 'node:path'

export const BRIDGE_SURFACE_FILES = [
  'src/desktop/bridge.ts',
  'src/desktop/bridgeAssetsSurface.ts',
  'src/desktop/bridgeBrowserTypes.ts',
  'src/desktop/bridgeModelCatalogSurface.ts',
] as const

export function bridgeSurfaceSource(repoRoot = process.cwd()): string {
  return BRIDGE_SURFACE_FILES.map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')).join('\n')
}
