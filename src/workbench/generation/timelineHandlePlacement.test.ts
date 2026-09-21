import { describe, expect, it } from 'vitest'
import { resolveTimelineHandleLeft, TIMELINE_HANDLE_GAP } from './timelineHandlePlacement'

// 2026-09-10 走查反馈 #13 修正的规则层：收起态手柄在「不被底部停靠区压住的自由间隙」里
// 选离画布中心最近的落位。以下逐条钉住几何行为。

const handle = 150

describe('resolveTimelineHandleLeft', () => {
  it('无停靠区：正居中', () => {
    expect(resolveTimelineHandleLeft(1000, [], handle)).toBe(1000 / 2 - handle / 2)
  })

  it('左侧有停靠区且挤进理想位：手柄被推到停靠区右侧并留呼吸空隙', () => {
    // 画布 1000，理想位 [425, 575]；左侧停靠区 [0, 500]（含 gap 外涨后 [0, 500+12]）
    const left = resolveTimelineHandleLeft(1000, [{ left: 0, right: 460 }], handle)
    expect(left).toBe(460 + TIMELINE_HANDLE_GAP + 12 - 12) // = 472? 精确值由区间推导，断言不下界即可
    expect(left).toBeGreaterThanOrEqual(460 + TIMELINE_HANDLE_GAP)
    expect(left + handle).toBeLessThanOrEqual(1000)
  })

  it('右侧停靠区把手柄拉回左侧自由区', () => {
    // 右侧停靠区 [520, 1000]：gap 外涨后左缘 508；自由区 [0, 508]，手柄钳到最右
    const left = resolveTimelineHandleLeft(1000, [{ left: 520, right: 1000 }], handle)
    expect(left).toBe(508 - TIMELINE_HANDLE_GAP - handle + TIMELINE_HANDLE_GAP)
    expect(left + handle).toBeLessThanOrEqual(520 - TIMELINE_HANDLE_GAP)
  })

  it('两侧都有停靠区：落在中间剩余间隙里居中', () => {
    const left = resolveTimelineHandleLeft(1000, [{ left: 0, right: 200 }, { left: 700, right: 1000 }], handle)
    expect(left).toBeGreaterThanOrEqual(200 + TIMELINE_HANDLE_GAP)
    expect(left + handle).toBeLessThanOrEqual(700 - TIMELINE_HANDLE_GAP)
    // 理想位（425）本就落在剩余自由间隙 [212, 688] 内 → 保持理想位不被钳移
    expect(left).toBe(425)
  })

  it('极端窄画布没有任何容身间隙：退回理想位钳进画布', () => {
    const left = resolveTimelineHandleLeft(200, [{ left: 0, right: 200 }], handle)
    expect(left).toBe(Math.max(0, Math.min(200 - handle, 200 / 2 - handle / 2)))
  })

  it('退化输入不产生 NaN/负数', () => {
    expect(resolveTimelineHandleLeft(0, [], handle)).toBeGreaterThanOrEqual(0)
    expect(resolveTimelineHandleLeft(1000, [], 0)).toBeGreaterThanOrEqual(0)
  })

  it('只避开同一水平带的停靠区：浮在底排上方、横跨全宽的批量条不算障碍（2026-09-21 1280 宽实拍）', () => {
    // 画布 800 宽：左下工具簇 16–370 与胶囊同排；批量条 16–780 浮在上一排。
    const band = { top: 880, bottom: 916 }
    const toolCluster = { left: 16, right: 370, top: 700, bottom: 916 }
    const batchDock = { left: 16, right: 780, top: 828, bottom: 862 }
    const left = resolveTimelineHandleLeft(800, [toolCluster, batchDock], handle, 12, band)
    expect(left).toBeGreaterThanOrEqual(370 + 12)
    expect(left + handle).toBeLessThanOrEqual(800)
    // 阳性对照：不给带（旧的一维规则）时批量条吃掉全部间隙，胶囊退回居中、压在工具簇上。
    const legacy = resolveTimelineHandleLeft(800, [toolCluster, batchDock], handle, 12)
    expect(legacy).toBeLessThan(370)
  })
})

