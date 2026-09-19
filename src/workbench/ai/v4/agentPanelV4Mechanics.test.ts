import { describe, expect, it } from 'vitest'
import React from 'react'
import { MantineProvider } from '@mantine/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { collapseV4Flow } from './agentPanelV4Collapse'
import { V4UserBubble } from './AgentPanelV4Message'
import { V4Queue } from './AgentPanelV4Cards'
import { V4ModelPopover } from './AgentPanelV4Composer'
import { V4ContextRing } from './AgentPanelV4Context'
import { readableToolName } from '../resident/residentToolDisplay'
import type { V4FlowItem } from './agentPanelV4Types'
const t = (key: string, args?: Record<string, unknown>) => `${key}${args ? JSON.stringify(args) : ''}`
const tool: V4FlowItem = { kind: 'tool', receipt: { label: '准备工具', action: 'write', status: 'output-available' } }
const think: V4FlowItem = { kind: 'thinking', label: '思考', meta: '检查工具组' }
const answer: V4FlowItem = { kind: 'assistant', text: '请先补齐参考图，再生成。', status: 'complete' }
const html = (component: React.ReactElement) => renderToStaticMarkup(React.createElement(MantineProvider, {}, component))
describe('B2a mechanics', () => {
  it('C25 groups receipts across thinking, with thinking count', () => {
    const result = collapseV4Flow([tool, think, tool, think, tool, answer], t)
    const process = result.find(item => item.kind === 'process')
    expect(process).toMatchObject({ toolCount: 3, segments: ['检查工具组', '检查工具组'] })
    expect(process?.kind === 'process' && process.details?.find(detail => detail.item.kind === 'tool-group')?.item).toMatchObject({ count: 3 })
    expect(result).toContainEqual(answer)
  })
  it('C25 keeps a complete answer between calls visible without reliable offsets', () => {
    expect(collapseV4Flow([tool, answer, tool], t)).toContainEqual(answer)
  })
  it('C25 long user messages default closed with full text available', () => {
    const text = Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n')
    const markup = html(React.createElement(V4UserBubble, { text }))
    expect(markup).toContain('<details')
    expect(markup).not.toContain(' open=""')
    expect(markup).toContain('<summary')
    expect(markup).toContain('line 7')
  })
  it('C33 queue cancel is an accessible icon', () => {
    const markup = html(React.createElement(V4Queue, { rows: [{ title: '继续', status: 'queued', destructiveAction: '取消这条指令' }], labels: { draft: '', queued: '', running: '', complete: '' } }))
    expect(markup).toContain('aria-label="取消这条指令"')
    expect(markup).toContain('<svg')
    expect(markup).not.toContain('>取消这条指令</button>')
  })
  it('C24 one model name per row', () => {
    const markup = html(React.createElement(V4ModelPopover, { rows: [{ slot: '对话', name: 'DeepSeek V4 Pro', options: [{ value: 'ds', label: 'DeepSeek V4 Pro' }], selectedValue: 'ds' }] }))
    expect((markup.match(/>DeepSeek V4 Pro</g) ?? []).length).toBe(1)
  })
  it('C21 million context uses M', () => {
    const labels = { context: 'context', input: 'input', output: 'output', reasoning: 'reasoning', cache: 'cache', threadCost: 'cost', unknown: '?', usedOnly: '{{amount}}' }
    const markup = html(React.createElement(V4ContextRing, { usage: { used: 33200, max: 1048576 }, labels, expanded: true }))
    expect(markup).toContain('1M')
    expect(markup).not.toContain('1048.6K')
  })
  it('C44 timeline operation names the action', () => {
    expect(readableToolName(t, 'nomi_canvas_write', { operation: 'arrange_storyboard_to_timeline' })).toBe('agentResident.toolTimelineAdd')
    expect(readableToolName(t, 'nomi_canvas_write', { operation: 'create_canvas_nodes' })).toBe('agentResident.toolCanvasCreate')
  })
})

it('C44 delete still asks once but its badge acknowledges undo', async () => {
  const { projectV4Intervention } = await import('./agentPanelV4Intervention')
  const labels = { irreversible:'不可逆', reversible:'可撤销' }
  const result = projectV4Intervention({toolName:'delete_canvas_nodes',args:{nodeIds:['one']},effectClass:'irreversible',pendingCount:1}, labels as Parameters<typeof projectV4Intervention>[1], t)
  expect(result).toMatchObject({kind:'approval-irreversible',badge:'可撤销'})
})
