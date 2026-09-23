import { describe, expect, it } from 'vitest'
import { collapseV4Flow } from './agentPanelV4Collapse'
import type { V4FlowItem } from './agentPanelV4Types'
const t = (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`
const tool = (label: string, status: 'output-available' | 'output-error' | 'input-available' = 'output-available'): V4FlowItem => ({ kind: 'tool', receipt: { label, action: 'document', status, summary: status === 'output-error' ? '无法读取' : undefined } })
const thinking: V4FlowItem = { kind: 'thinking', label: '思考', meta: '', text: '检查文稿', streaming: false }
const answer: V4FlowItem = { kind: 'assistant', text: '已完成八个镜头。', status: 'complete' }
describe('B2c process contract', () => {
  it('settles interleaved thinking and calls into one process, keeping an early answer below it', () => {
    const result = collapseV4Flow([answer, tool('读取全文'), thinking, tool('写入 8 镜')], t)
    expect(result.map(item => item.kind)).toEqual(['process', 'assistant'])
    expect(result[0]).toMatchObject({ running: false, toolCount: 2 })
    expect(result[1]).toEqual(answer)
  })
  it('replaces the live row with the latest tool instead of leaving previous steps on screen', () => {
    const result = collapseV4Flow([tool('读取全文'), thinking, tool('加载分镜技能', 'input-available')], t)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ kind: 'process', running: true, label: '加载分镜技能' })
  })
  // 2026-09-21：终态失败**留在它那一行下面**，不在对话流里另起一块（定稿 #4）。
  // 收起的过程行会把那一行连同红条一起藏掉，所以带失败的那一段标 `failed` 并自己展开。
  it('keeps an unresolved failure under its own row and keeps the answer', () => {
    const result = collapseV4Flow([tool('读取全文'), tool('写入 8 镜', 'output-error'), answer], t)
    expect(result.map(item => item.kind)).toEqual(['process', 'assistant'])
    expect(result[0]).toMatchObject({ failed: true })
    const details = result[0]?.kind === 'process' ? result[0].details ?? [] : []
    expect(details.map(detail => detail.item.kind)).toEqual(['tool', 'tool', 'error'])
    expect(details[2]!.item).toMatchObject({ kind: 'error', reason: '无法读取' })
    // 红条紧跟着的是**出错的那一行**，不是它前面那条成功的。
    expect(details[1]!.item).toMatchObject({ kind: 'tool', receipt: { label: '写入 8 镜' } })
  })
  it('does not join processes across a user message', () => {
    const result = collapseV4Flow([tool('读取全文'), { kind: 'user', text: '继续' }, tool('加载技能')], t)
    expect(result.map(item => item.kind)).toEqual(['process', 'user', 'process'])
  })
})

// Real invocation order is also the interaction index used for retry/undo handlers.
it('preserves tool ordering and action indexes with the C77 thinking disclosure first', () => {
  const result = collapseV4Flow([answer, tool('读取全文'), thinking, tool('写入 8 镜')], t)
  expect(result[0]).toMatchObject({ details: [
    { index: 2, item: { kind: 'thinking', text: '检查文稿', streaming: false } },
    { index: 1, item: { kind: 'tool' } },
    { index: 3, item: { kind: 'tool' } },
  ] })
})

it('keeps recovered failures in details and counts retries without leaving a false failure card', () => {
  const result = collapseV4Flow([tool('写入 8 镜', 'output-error'), thinking, tool('写入 8 镜', 'output-error'), tool('写入 8 镜'), answer], t)
  expect(result.map(item => item.kind)).toEqual(['process', 'assistant'])
  expect(result[0]).toMatchObject({ toolCount: 3, retries: 2, running: false })
})
