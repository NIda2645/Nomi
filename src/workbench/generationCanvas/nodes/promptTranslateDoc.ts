/**
 * 翻译在编辑器文档这一侧的两件事：「要翻的是哪一段」和「怎么一次换回去」。
 * 与 Tiptap 实例解耦（只吃 ProseMirror 的 doc/state），好在单测里用真 schema 验证替换结果。
 */
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { encodeMention, type PromptReference } from '../../assets/promptMentions'
import { promptToContent } from '../../assets/promptEditorContent'

/** 与 PromptEditor.contentToPrompt 同一套序列化：段落 → \n，assetMention → @[asset:url]，其余叶子（硬换行）不产字。 */
export function promptTextBetween(doc: ProseMirrorNode, from: number, to: number): string {
  return doc.textBetween(from, to, '\n', (leaf) => (leaf.type.name === 'assetMention' ? encodeMention(String(leaf.attrs.url || '')) : ''))
}

/**
 * 选区为空 → 整段；否则就是选区。两端都夹进「第一段内容起点 … 最后一段内容终点」：
 * Cmd+A 的 AllSelection 从 0 到 doc 末尾，落在段落外面，开口切片在那两个位置上没有段落可并。
 */
export function translateRange(state: EditorState): { from: number; to: number } {
  const { from, to, empty } = state.selection
  const start = 1
  const end = Math.max(start, state.doc.content.size - 1)
  if (empty) return { from: start, to: end }
  return { from: Math.max(from, start), to: Math.min(to, end) }
}

/**
 * 用一笔事务把 [from,to] 换成 prompt 字符串（含 @[asset:] 标记与换行）。
 * 开口切片（openStart/openEnd=1）= 粘贴语义：首段并入选区前的文字、末段并入选区后的文字，
 * 单段/多段、整段/局部同一条路径。一笔事务 = 一个撤销步。
 */
export function replacePromptRange(
  state: EditorState,
  schema: Schema,
  range: { from: number; to: number },
  prompt: string,
  references: readonly PromptReference[],
): Transaction {
  const paragraphs = promptToContent(prompt, references).content ?? []
  return state.tr.replace(range.from, range.to, new Slice(Fragment.fromJSON(schema, paragraphs), 1, 1))
}
