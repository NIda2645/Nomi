import type { GenerationCanvasNode, TiptapDocJson } from '../model/generationCanvasTypes'
import { synchronousSha256 } from '../../../../electron/shared/synchronousSha256'

/**
 * C5 P2 · 文本节点生成模式：
 * - append  续写：把生成内容接在文档末尾（默认；数据层，不依赖 editor，离屏也安全）。
 * - replace 重写：用生成内容替换整篇文档（数据层）。
 * - rewrite 改写：改写**当前选区**——这一种必须在节点编辑器里 replaceSelection（数据层拿不到
 *   ProseMirror 选区位置），所以 textActions 只打个标记，TextDocumentNode 的 effect 执行替换。
 */
export type TextGenMode = 'append' | 'replace' | 'rewrite'

export function getTextGenMode(node: Pick<GenerationCanvasNode, 'meta'>): TextGenMode {
  const mode = node.meta?.textGenMode
  return mode === 'replace' || mode === 'rewrite' ? mode : 'append'
}

/** 把 Tiptap 文档拍平成纯文本（数据层，不需要 editor）——用于喂给模型做上下文。 */
export function docToPlainText(doc?: TiptapDocJson): string {
  const walk = (entry: unknown): string => {
    if (!entry || typeof entry !== 'object') return ''
    const node = entry as { type?: string; text?: string; content?: unknown[] }
    if (typeof node.text === 'string') return node.text
    if (Array.isArray(node.content)) return node.content.map(walk).join('')
    return ''
  }
  if (!doc || !Array.isArray(doc.content)) return ''
  // 每个块级节点之间用换行分隔。
  return doc.content
    .map(walk)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

/** Hash the exact plain text consumed by generation, without persisting another document. */
export function textDocumentDigest(doc?: TiptapDocJson): string {
  return `sha256-${synchronousSha256(docToPlainText(doc))}`
}
