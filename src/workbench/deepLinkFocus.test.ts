import { describe, expect, it } from 'vitest'
import { DEEP_LINK_FOCUS_MAX_ATTEMPTS, focusCanvasNodeWhenReady } from './deepLinkFocus'

// 这一层守的是「点了没反应」与「点了弹假警告」两个用户可见故障。
// 真实时序：深链 → hydrate 工程 → 节点异步入 store。派早了画布会说「源节点已不存在」——它明明存在。

const noWait = () => Promise.resolve()

describe('focusCanvasNodeWhenReady', () => {
  it('节点已在 store：立刻派事件，不空转等帧', async () => {
    const dispatched: string[] = []
    let frames = 0
    const ok = await focusCanvasNodeWhenReady({
      nodeId: 'shot-3',
      hasNode: () => true,
      dispatch: (id) => dispatched.push(id),
      waitFrame: () => {
        frames += 1
        return Promise.resolve()
      },
    })
    expect(ok).toBe(true)
    expect(dispatched).toEqual(['shot-3'])
    expect(frames).toBe(0)
  })

  it('节点晚几帧才落库：等到它出现再派，且只派一次', async () => {
    const dispatched: string[] = []
    let ticks = 0
    const ok = await focusCanvasNodeWhenReady({
      nodeId: 'shot-7',
      hasNode: () => ticks >= 3, // 前 3 帧 store 里还没有
      dispatch: (id) => dispatched.push(id),
      waitFrame: () => {
        ticks += 1
        return Promise.resolve()
      },
    })
    expect(ok).toBe(true)
    expect(dispatched).toEqual(['shot-7'])
  })

  it('节点真的不存在（被删了）：不派事件 → 不会弹「源节点已不存在」的假警告，静默停在工程页', async () => {
    const dispatched: string[] = []
    const ok = await focusCanvasNodeWhenReady({
      nodeId: 'deleted',
      hasNode: () => false,
      dispatch: (id) => dispatched.push(id),
      waitFrame: noWait,
      maxAttempts: 5,
    })
    expect(ok).toBe(false)
    expect(dispatched).toEqual([])
  })

  it('等待有上界（不会挂死在一个永不出现的节点上）', async () => {
    let frames = 0
    await focusCanvasNodeWhenReady({
      nodeId: 'never',
      hasNode: () => false,
      dispatch: () => {},
      waitFrame: () => {
        frames += 1
        return Promise.resolve()
      },
    })
    expect(frames).toBe(DEEP_LINK_FOCUS_MAX_ATTEMPTS)
    expect(DEEP_LINK_FOCUS_MAX_ATTEMPTS).toBeLessThanOrEqual(120) // 上界本身也别放飞
  })

  it('空 nodeId 直接判否，不派空事件', async () => {
    const dispatched: string[] = []
    for (const bad of ['', '   ']) {
      const ok = await focusCanvasNodeWhenReady({
        nodeId: bad,
        hasNode: () => true,
        dispatch: (id) => dispatched.push(id),
        waitFrame: noWait,
      })
      expect(ok).toBe(false)
    }
    expect(dispatched).toEqual([])
  })
})
