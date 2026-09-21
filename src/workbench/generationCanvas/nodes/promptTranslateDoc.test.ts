import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { AllSelection, EditorState, TextSelection } from '@tiptap/pm/state'
import { AssetMention } from '../../assets/AssetMentionNode'
import { encodeMention } from '../../assets/promptMentions'
import { promptToContent } from '../../assets/promptEditorContent'
import { promptTextBetween, replacePromptRange, translateRange } from './promptTranslateDoc'

// 真 schema（与 PromptEditor 同一组扩展）上验「翻哪段」和「换回去之后 prompt 字符串长什么样」。
// 序列化口径必须和 PromptEditor.contentToPrompt 一致：段落 → \n，chip → @[asset:url]。
const schema = getSchema([
  StarterKit.configure({ heading: false, bulletList: false, orderedList: false, blockquote: false, codeBlock: false, horizontalRule: false }),
  AssetMention,
])
const REF = encodeMention('nomi-asset://p/cat.png')

const stateOf = (prompt: string): EditorState =>
  EditorState.create({ schema, doc: ProseMirrorNode.fromJSON(schema, promptToContent(prompt)) })
const promptOf = (doc: ProseMirrorNode): string => promptTextBetween(doc, 1, doc.content.size - 1)

/** 在 prompt 字符串里找 needle 的位置，换算成单段文档里的 PM 位置（段首 = 1；前面若有 chip 按 1 个位置算）。 */
const selectText = (state: EditorState, needle: string): EditorState => {
  let found: { from: number; to: number } | null = null
  state.doc.descendants((node, pos) => {
    if (found || !node.isText) return
    const at = node.text!.indexOf(needle)
    if (at >= 0) found = { from: pos + at, to: pos + at + needle.length }
  })
  if (!found) throw new Error(`not found: ${needle}`)
  const { from, to } = found as { from: number; to: number }
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
}

describe('translateRange + promptTextBetween', () => {
  it('没选中 → 整段，含 chip 标记与换行', () => {
    const state = stateOf(`第一行${REF}猫\n第二行`)
    const range = translateRange(state)
    expect(promptTextBetween(state.doc, range.from, range.to)).toBe(`第一行${REF}猫\n第二行`)
  })

  it('选中一段 → 只取那段', () => {
    const state = selectText(stateOf(`一只橘猫${REF}坐在窗台上`), '坐在窗台上')
    const range = translateRange(state)
    expect(promptTextBetween(state.doc, range.from, range.to)).toBe('坐在窗台上')
  })

  it('Cmd+A（AllSelection）夹回段落内部，与「没选中」同一范围', () => {
    const base = stateOf('一只猫\n一条狗')
    const all = base.apply(base.tr.setSelection(new AllSelection(base.doc)))
    expect(translateRange(all)).toEqual(translateRange(base))
  })
})

describe('replacePromptRange', () => {
  it('局部替换：选中段换成译文，前后文字与 chip 不动', () => {
    const state = selectText(stateOf(`一只橘猫${REF}坐在窗台上`), '坐在窗台上')
    const tr = replacePromptRange(state, schema, translateRange(state), 'sitting on the windowsill', [])
    expect(promptOf(tr.doc)).toBe(`一只橘猫${REF}sitting on the windowsill`)
  })

  it('整段替换：多行译文仍是多段，chip 还原成节点', () => {
    const state = stateOf(`第一行${REF}\n第二行`)
    const tr = replacePromptRange(state, schema, translateRange(state), `Line one ${REF}\nLine two`, [])
    expect(promptOf(tr.doc)).toBe(`Line one ${REF}\nLine two`)
    expect(tr.doc.childCount).toBe(2)
    let chips = 0
    tr.doc.descendants((node) => { if (node.type.name === 'assetMention') chips += 1 })
    expect(chips).toBe(1)
  })

  it('跨段选区：替换后首尾与选区外文字合并，不多出空段', () => {
    const base = stateOf('前缀甲乙\n丙丁后缀')
    // 选「甲乙\n丙丁」：段一 "前缀甲乙" 位置 1..5，段二内容从 7 开始。
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 3, 9)))
    expect(promptTextBetween(state.doc, 3, 9)).toBe('甲乙\n丙丁')
    const tr = replacePromptRange(state, schema, translateRange(state), 'AB\nCD', [])
    expect(promptOf(tr.doc)).toBe('前缀AB\nCD后缀')
    expect(tr.doc.childCount).toBe(2)
  })

  it('一笔事务：只有一个 step 组（撤销一步回原文的前提）', () => {
    const state = stateOf('一只猫')
    const tr = replacePromptRange(state, schema, translateRange(state), 'a cat', [])
    expect(tr.steps.length).toBe(1)
    expect(promptOf(tr.doc)).toBe('a cat')
  })
})
