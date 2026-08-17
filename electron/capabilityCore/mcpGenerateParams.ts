// 能力核 · nomi_generate 画幅/时长参数归一（从 mcpProtocol 抽出，壳文件不破 800 行）。纯逻辑、不碰 electron。
//
// 为什么要归一别名而不是原样传 aspect_ratio：不同 archetype 声明的比例 canonical 键**不一样**——apimart
// Seedream 走 `size`（wire body 读 {{request.params.size}}），kie/kling 走 `aspect_ratio`。通用 MCP 调用方
// 不该知道也不该关心这是哪家的哪个键（P4 通用第一）。故把调用方的 aspect_ratio 同时铺进 `aspect_ratio` /
// `size` / `aspectRatio` 三个别名：这些经 extras 进 applyHeadlessParamDefaults 时是 **caller-wins**（既有值盖过
// mapping/档案默认），于是无论哪个 archetype 读哪个键，都拿到调用方的比例，压过那个把用户坑成方图的 "1:1" 默认。
// resolution/duration 键名全站一致（wire body 直读 params.resolution / params.duration），原样铺即可
//（duration 数字保留，taskParams 已处理数字→wire）。空/缺省不铺（不凭空造字段，保持不传时逐字节等同旧默认）。

/** nomi_generate 的 aspect_ratio/resolution/duration → 下沉到真实请求体的 params（caller-wins 载体）。纯函数、可单测。 */
export function buildGenerateParams(a: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const aspect = typeof a.aspect_ratio === 'string' ? a.aspect_ratio.trim() : ''
  if (aspect) {
    params.aspect_ratio = aspect
    params.size = aspect
    params.aspectRatio = aspect
  }
  const resolution = typeof a.resolution === 'string' ? a.resolution.trim() : ''
  if (resolution) params.resolution = resolution
  if (typeof a.duration === 'number' && Number.isFinite(a.duration)) params.duration = a.duration
  return params
}
