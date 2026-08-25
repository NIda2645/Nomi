// 「生成时可调参数」候选池必须跟着**当前绑定**走（用户 2026-08-03 报一次、08-11 又报一次的根因）。
//
// 症状是「我提示词应该输入的那个节点跑进了可调参数列表」。08-03 的修法是在分析时把
// 被建议当提示词的那一条从池子里删掉——治了首屏、没治交互：自动认错时用户会自己改提示词绑定，
// 那一刻钉死的池子既没排除新选中的、也没放回原先那个。这里锁住「现算」这个行为。
import { describe, expect, it } from 'vitest'
import { paramCandidates, roleBoundInputKeys } from './comfyuiParamCandidates'

const CANDIDATES = [
  { nodeId: '124', inputKey: 'prompt', value: '一段很长的提示词' },
  { nodeId: '130', inputKey: 'value', value: '另一段提示词' },
  { nodeId: '115', inputKey: 'aspect', value: '16:9' },
  { nodeId: '9', inputKey: 'steps', value: 20 },
]
const keysOf = (list: Array<{ nodeId: string; inputKey: string }>): string[] =>
  list.map((c) => `${c.nodeId} ${c.inputKey}`)

describe('ComfyUI 可调参数候选池（按当前绑定现算）', () => {
  it('被当前绑定占用的输入不进候选池', () => {
    const offered = paramCandidates(CANDIDATES, { promptNodeId: '124', promptInputKey: 'prompt' })
    expect(keysOf(offered)).toEqual(['130 value', '115 aspect', '9 steps'])
  })

  it('改了提示词绑定 → 新选中的退出候选、原先那个回来（这正是原 bug 治不到的那一刻）', () => {
    const before = paramCandidates(CANDIDATES, { promptNodeId: '124', promptInputKey: 'prompt' })
    expect(keysOf(before)).not.toContain('124 prompt')

    const after = paramCandidates(CANDIDATES, { promptNodeId: '130', promptInputKey: 'value' })
    expect(keysOf(after)).toContain('124 prompt') // 放回来了
    expect(keysOf(after)).not.toContain('130 value') // 新选中的退出去了
  })

  it('四个角色都会占位（首帧/尾帧/源视频与提示词同权，它们抢的是同一个 setInput 目标）', () => {
    const bound = roleBoundInputKeys({
      promptNodeId: 'a', promptInputKey: 'prompt',
      firstFrameNodeId: 'b', firstFrameInputKey: 'image',
      lastFrameNodeId: 'c', lastFrameInputKey: 'image',
      sourceVideoNodeId: 'd', sourceVideoInputKey: 'file',
    })
    expect([...bound].sort()).toEqual(['a prompt', 'b image', 'c image', 'd file'])
  })

  it('半截绑定（只有 nodeId 没有 inputKey）不占位，也不炸', () => {
    expect(roleBoundInputKeys({ promptNodeId: '124' }).size).toBe(0)
    expect(roleBoundInputKeys(null).size).toBe(0)
    expect(keysOf(paramCandidates(CANDIDATES, null))).toEqual(keysOf(CANDIDATES))
  })
})
