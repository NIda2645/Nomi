// 官网「地址 ↔ 落盘文件」的唯一换算。页面生成器（pages.mjs）、站内链接门岗、中英对应门岗都读这一份，
// 不各写一遍「干净地址是什么、对应哪个文件」（2026-09-03 的干净地址漂移就是这样出来的）。
//
// 规则与 Cloudflare Pages 的干净地址一致：`/models/kling-3-0` ←→ `marketing/models/kling-3-0.html`；
// 首页 `/` ←→ `marketing/index.html`，英文首页 `/en/` ←→ `marketing/en/index.html`。

/** `marketing/models/kling-3-0.html` → `/models/kling-3-0`；`marketing/en/index.html` → `/en/`。 */
export function routeFromOutputPath(relativePath) {
  const stripped = relativePath.replace(/^marketing\//, '')
  if (stripped === 'index.html' || stripped.endsWith('/index.html')) {
    return `/${stripped.slice(0, -'index.html'.length)}`
  }
  return `/${stripped.replace(/\.html$/, '')}`
}

/** `/models/kling-3-0` → `marketing/models/kling-3-0.html`；`/` → `marketing/index.html`；`/en/` → `marketing/en/index.html`。 */
export function outputPathFromRoute(route) {
  if (route.endsWith('/')) return `marketing${route}index.html`
  return `marketing${route}.html`
}

/**
 * 一个站内路径（已去掉 ?query 和 #hash，以 / 开头）可能对应哪几个落盘文件，按静态托管的解析顺序。
 * 带扩展名的（/assets/x.svg）就是文件本身；干净地址（/models）对应 .html；以 / 结尾的是目录首页。
 */
export function fileCandidatesForPath(pathname) {
  const trimmed = pathname.replace(/^\//, '')
  if (trimmed === '' || trimmed.endsWith('/')) return [`marketing/${trimmed}index.html`]
  return [`marketing/${trimmed}`, `marketing/${trimmed}.html`, `marketing/${trimmed}/index.html`]
}

/** 官网的规范地址里，只有这两个首页带结尾斜杠；其余都不带，也不带 .html。 */
export const TRAILING_SLASH_ROUTES = new Set(['/', '/en/'])

/** 同一页另一种语言的落盘路径：中文 `marketing/models.html` ←→ 英文 `marketing/en/models.html`（首页是 index.html）。 */
export function counterpartOutputPath(relativePath) {
  return relativePath.startsWith('marketing/en/')
    ? `marketing/${relativePath.slice('marketing/en/'.length)}`
    : `marketing/en/${relativePath.slice('marketing/'.length)}`
}

export const isEnglishOutputPath = (relativePath) => relativePath.startsWith('marketing/en/')
