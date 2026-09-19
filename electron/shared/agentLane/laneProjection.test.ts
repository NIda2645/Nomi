import { describe, expect, it } from 'vitest'
import type { LaneSnapshot } from '@earendil-works/pi-agent-core'
import { projectLaneSnapshot } from './laneProjection'

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }

describe('lane provider failure visibility', () => {
  it('retains a settled provider error even when the assistant produced no content', () => {
    const snapshot: LaneSnapshot = {
      lane: 'main', tipId: 'failed', operation: null, queues: [], faulted: false,
      configuration: { model: { provider: 'fixture', modelId: 'fixture' }, thinkingLevel: 'off', activeToolNames: [] },
      stats: { messageCount: 1, usage },
      transcript: [{ id: 'failed', parentId: null, seq: 1, timestamp: 1, type: 'message', message: {
        role: 'assistant', content: [], api: 'openai-completions', provider: 'fixture', model: 'fixture',
        usage, stopReason: 'error', errorMessage: 'Connection closed before a response.', timestamp: 1,
      } }],
    }
    const projection = projectLaneSnapshot(snapshot, { pricing: 'unpriced', supportedThinkingLevels: ['off'] })
    expect(projection.parts).toEqual([{
      kind: 'error', text: 'Connection closed before a response.', entryId: 'failed', sequence: 0, entrySeq: 1, contentIndex: 0,
    }])
    expect(projection.running).toBe(false)
  })
})

describe('lane skill provenance', () => {
  /**
   * 技能是「这一轮按哪套方法做」的唯一开关，而它**已经**随消息落盘
   * （`LaneInputMessage.context.skillKey`，pi 的自定义消息扩展）。这条钉的是「投影不许把它丢掉」：
   * 丢掉之后面板只能靠「当前选中的技能」去猜，而那会把今天选的技能追认到昨天那句话上。
   */
  function laneWith(messages: LaneSnapshot['transcript']): LaneSnapshot {
    return {
      lane: 'main', tipId: 'tip', operation: null, queues: [], faulted: false,
      configuration: { model: { provider: 'fixture', modelId: 'fixture' }, thinkingLevel: 'off', activeToolNames: [] },
      stats: { messageCount: messages.length, usage },
      transcript: messages,
    }
  }

  // pi 的自定义消息（`role: 'nomi.input'`）在 `AgentMessage` 的公开 union 里没有分支，
  // 所以这里整条 entry 一次性断言成 transcript 的元素类型——按字段去索引那个 union 取不到 `message`。
  const input = (seq: number, content: string, context: Record<string, unknown>): LaneSnapshot['transcript'][number] => ({
    id: `e${seq}`, parentId: null, seq, timestamp: seq, type: 'message',
    message: { role: 'nomi.input', content, timestamp: seq, context },
  } as unknown as LaneSnapshot['transcript'][number])

  it('carries the skill recorded on that very message, and nothing when it had none', () => {
    const projection = projectLaneSnapshot(laneWith([
      input(1, '拆分镜。', { approvalPolicy: { mode: 'step', spend: 'confirm' }, skillKey: 'workbench.storyboard.planner' }),
      input(2, '再来一句。', { approvalPolicy: { mode: 'step', spend: 'confirm' } }),
    ]), { pricing: 'unpriced', supportedThinkingLevels: ['off'] })
    expect(projection.parts.map((part) => part.kind === 'user' ? part.skillKey : 'not-user'))
      .toEqual(['workbench.storyboard.planner', undefined])
  })
})

describe('lane stop visibility', () => {
  /**
   * 用户点「停止」时模型还一个字都没吐出来是**常态**（真实会话 2026-09-12 的 5 次停止全是这个形状：
   * `stopReason:'aborted'` + `content: []`）。从前 `pushAssistantParts` 只按 `content` 逐项发段，
   * 空内容就一段都没有——面板上停止**不留任何痕迹**，用户只能判断成「没停下来」。
   * 停止的回执不是正文的一个属性，是这一回合本身的终局。
   */
  function abortedLane(content: unknown[]): LaneSnapshot {
    return {
      lane: 'main', tipId: 'stopped', operation: null, queues: [], faulted: false,
      configuration: { model: { provider: 'fixture', modelId: 'fixture' }, thinkingLevel: 'off', activeToolNames: [] },
      stats: { messageCount: 1, usage },
      transcript: [{ id: 'stopped', parentId: null, seq: 1, timestamp: 1, type: 'message', message: {
        role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'fixture',
        usage, stopReason: 'aborted', timestamp: 1,
      } }],
    } as unknown as LaneSnapshot
  }

  it('leaves an interrupted receipt when the stopped turn produced no text at all', () => {
    const projection = projectLaneSnapshot(abortedLane([]), { pricing: 'unpriced', supportedThinkingLevels: ['off'] })
    expect(projection.parts).toEqual([{
      kind: 'assistant-text', text: '', interrupted: true, streaming: false,
      sequence: 0, entryId: 'stopped', entrySeq: 1, contentIndex: 0,
    }])
  })

  it('carries no continuation entry for an empty stop, because there is nothing to continue from', () => {
    const projection = projectLaneSnapshot(abortedLane([]), { pricing: 'unpriced', supportedThinkingLevels: ['off'] })
    expect(projection.parts.every((part) => !('continuationEntryId' in part))).toBe(true)
  })

  it('still leaves one interrupted receipt when the stop happened after a tool call and before any prose', () => {
    const projection = projectLaneSnapshot(
      abortedLane([{ type: 'toolCall', id: 'call-1', name: 'look_at_canvas', arguments: {} }]),
      { pricing: 'unpriced', supportedThinkingLevels: ['off'] },
    )
    expect(projection.parts.map((part) => part.kind)).toEqual(['tool-call', 'assistant-text'])
    expect(projection.parts.at(-1)).toMatchObject({ kind: 'assistant-text', text: '', interrupted: true })
  })

  it('does not add a second receipt when the stopped turn already streamed prose', () => {
    const projection = projectLaneSnapshot(
      abortedLane([{ type: 'text', text: '开场先留一秒环境声。' }]),
      { pricing: 'unpriced', supportedThinkingLevels: ['off'] },
    )
    expect(projection.parts.filter((part) => part.kind === 'assistant-text')).toHaveLength(1)
    expect(projection.parts[0]).toMatchObject({ interrupted: true, continuationEntryId: 'stopped' })
  })
})
