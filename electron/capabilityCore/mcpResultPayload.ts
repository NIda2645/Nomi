// 能力核 · MCP tool result 的**内容块**装配（0c：从 mcpProtocol.buildToolResultPayload 抽出 content 段，
// 让协议壳文件不破 800 行）。纯逻辑、不碰 electron，与 mcpToolResults 同边界 → 可裸 node 单测。
//
// 一次 CallToolResult.content 恒含：① 一个 text 块（buildToolOutcome 的转述原材料，缺则 JSON 兜底——
// 纯文本宿主也看得到）；② 结果若夹带 App 侧富化的缩略图（_nomiThumbnail={data,mimeType}），追加一个
// 标准 MCP ImageContent 块（spec 2025-11-25：{type:'image',data:base64,mimeType}）。纯文本宿主忽略非
// text 块、支持图的宿主（含 Claude Code）直接把缩略图画在结果里。App 侧已保证 ≤64KB、一张。
import { buildToolOutcome, type ResultLocale } from './mcpToolResults'

/** 从结果里取 App 侧富化的缩略图块（{data,mimeType}）；不是该形状 → undefined。 */
function thumbnailBlock(result: unknown): { type: 'image'; data: string; mimeType: string } | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined
  const thumb = (result as Record<string, unknown>)._nomiThumbnail as { data?: unknown; mimeType?: unknown } | undefined
  if (thumb && typeof thumb.data === 'string' && thumb.data && typeof thumb.mimeType === 'string') {
    return { type: 'image', data: thumb.data, mimeType: thumb.mimeType }
  }
  return undefined
}

/**
 * 装配 tool result 的 content 数组 + 返回配套的 outcome（供协议层继续拼 structuredContent）。
 * text 恒有（buildToolOutcome 给不出则 JSON.stringify 兜底）；有缩略图则追加 image 块。
 */
export function assembleToolResultContent(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  locale: ResultLocale,
): { content: Array<Record<string, unknown>>; outcome: Record<string, unknown> | null } {
  const { text, outcome } = buildToolOutcome(toolName, args, result, locale)
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: text ?? JSON.stringify(result, null, 2) }]
  const image = thumbnailBlock(result)
  if (image) content.push(image)
  return { content, outcome }
}
