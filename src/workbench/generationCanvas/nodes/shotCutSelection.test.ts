import { describe, expect, it } from 'vitest'
import {
  SHOT_SENSITIVITY_DEFAULT,
  SHOT_SENSITIVITY_MIN,
  evenFrameCount,
  evenFrameSeconds,
  filterShotCuts,
  formatShotTimestamp,
  pickDefaultSensitivity,
  shotCutNodePositions,
  shotSheetRows,
  shotSheetTileStyle,
} from './shotCutSelection'

const cuts = [
  { seconds: 2, score: 0.67 },
  { seconds: 4, score: 0.22 },
  { seconds: 6, score: 0.51 },
  { seconds: 9, score: 0.13 },
]

describe('filterShotCuts — 灵敏度过滤保住原始下标', () => {
  it('低阈值全留', () => {
    expect(filterShotCuts(cuts, 0.1).map((c) => c.index)).toEqual([0, 1, 2, 3])
  })

  it('调高阈值只留强切点，**下标不重编**（联系表切格靠它）', () => {
    const kept = filterShotCuts(cuts, 0.5)
    expect(kept.map((c) => c.seconds)).toEqual([2, 6])
    expect(kept.map((c) => c.index)).toEqual([0, 2])
  })

  it('阈值高过所有分数 → 空', () => {
    expect(filterShotCuts(cuts, 0.9)).toEqual([])
  })

  it('等于阈值算留下（>=，不是 >）', () => {
    expect(filterShotCuts([{ seconds: 1, score: 0.3 }], 0.3)).toHaveLength(1)
  })
})

describe('filterShotCuts — 合并「同一刀的余震」', () => {
  // 真实数据（某导入短片）：一个真切点会被 ffmpeg 连报两帧，差整整一帧。
  const echo = [
    { seconds: 5.4, score: 0.576 },
    { seconds: 5.433, score: 0.341 },
    { seconds: 13.933, score: 0.591 },
    { seconds: 13.967, score: 0.223 },
  ]

  it('紧邻的两帧算一刀，只留一个', () => {
    expect(filterShotCuts(echo, 0.2).map((c) => c.seconds)).toEqual([5.4, 13.933])
  })

  it('留的是分数最高那帧——它才是真正的切点位置', () => {
    const kept = filterShotCuts([{ seconds: 3, score: 0.2 }, { seconds: 3.05, score: 0.6 }], 0.1)
    expect(kept).toHaveLength(1)
    expect(kept[0]?.score).toBe(0.6)
    // 下标跟着赢家走，否则联系表会切到余震那格。
    expect(kept[0]?.index).toBe(1)
  })

  it('隔得开的快剪不会被误并（0.2s 窗口只吃紧邻余震）', () => {
    const fast = [{ seconds: 1, score: 0.5 }, { seconds: 1.3, score: 0.5 }, { seconds: 1.6, score: 0.5 }]
    expect(filterShotCuts(fast, 0.1)).toHaveLength(3)
  })
})

describe('pickDefaultSensitivity — 默认灵敏度从这条视频 derive，不写死', () => {
  it('有强切点 → 维持 0.3，常见片子行为不变', () => {
    expect(pickDefaultSensitivity([{ seconds: 1, score: 0.58 }])).toBe(SHOT_SENSITIVITY_DEFAULT)
  })

  it('最强只有 0.161（实测 nomi-clip-01）→ 退到看得见的那档，而不是打开即空', () => {
    const picked = pickDefaultSensitivity([{ seconds: 1, score: 0.161 }])
    expect(picked).toBe(0.15)
    expect(filterShotCuts([{ seconds: 1, score: 0.161 }], picked)).toHaveLength(1)
  })

  it('全集非空 → 选出的档必然能看到东西（面板不可能打开就是空的）', () => {
    for (const score of [0.101, 0.12, 0.199, 0.25, 0.299, 0.3, 0.7]) {
      const cuts = [{ seconds: 1, score }]
      expect(filterShotCuts(cuts, pickDefaultSensitivity(cuts)).length).toBeGreaterThan(0)
    }
  })

  it('浮点不漂：退档结果落在滑杆的合法刻度上', () => {
    expect(pickDefaultSensitivity([{ seconds: 1, score: 0.28 }])).toBe(0.25)
    expect(pickDefaultSensitivity([{ seconds: 1, score: 0.1001 }])).toBe(SHOT_SENSITIVITY_MIN)
  })

  it('空集 → 回默认（此时面板走一镜到底那条路，值用不上）', () => {
    expect(pickDefaultSensitivity([])).toBe(SHOT_SENSITIVITY_DEFAULT)
  })
})

describe('evenFrame* — 一镜到底时的替代取法', () => {
  it.each([[5, 3], [10, 4], [28, 8], [600, 8], [0.5, 3]])('%s 秒 → %i 帧', (duration, expected) => {
    expect(evenFrameCount(duration)).toBe(expected)
  })

  it('均匀分布且避开首尾（首/尾帧在工具栏已经有家了）', () => {
    expect(evenFrameSeconds(10, 4)).toEqual([2, 4, 6, 8])
  })

  it('时长拿不到 → 空数组（主操作会被禁用，不会抽出 NaN 秒）', () => {
    expect(evenFrameSeconds(0, 4)).toEqual([])
    expect(evenFrameSeconds(Number.NaN, 4)).toEqual([])
  })
})

describe('shotSheetTileStyle — 联系表切格', () => {
  it('第 0 格在左上', () => {
    expect(shotSheetTileStyle(0, 8, 2)).toEqual({ backgroundSize: '800% 200%', backgroundPosition: '0% 0%' })
  })

  it('同一行往右推进', () => {
    expect(shotSheetTileStyle(7, 8, 2).backgroundPosition).toBe('100% 0%')
  })

  it('换行后落到第二行', () => {
    expect(shotSheetTileStyle(8, 8, 2).backgroundPosition).toBe('0% 100%')
  })

  it('单列/单行不除以 0', () => {
    expect(shotSheetTileStyle(0, 1, 1)).toEqual({ backgroundSize: '100% 100%', backgroundPosition: '0% 0%' })
  })
})

describe('shotSheetRows — 必须与主进程同一算式', () => {
  it.each([[1, 8, 1], [8, 8, 1], [9, 8, 2], [16, 8, 2], [17, 8, 3]])(
    '%i 个切点 / %i 列 → %i 行',
    (total, cols, expected) => {
      expect(shotSheetRows(total, cols)).toBe(expected)
    },
  )

  it('0 个切点也至少 1 行（不产生 tile=Nx0）', () => {
    expect(shotSheetRows(0, 8)).toBe(1)
  })
})

describe('formatShotTimestamp', () => {
  it.each([[0, '0:00'], [7, '0:07'], [65, '1:05'], [600, '10:00'], [3671, '1:01:11']])(
    '%i 秒 → %s',
    (seconds, expected) => {
      expect(formatShotTimestamp(seconds)).toBe(expected)
    },
  )

  it('小数秒向下取整', () => {
    expect(formatShotTimestamp(9.87)).toBe('0:09')
  })
})

describe('shotCutNodePositions — 成组紧凑网格', () => {
  const origin = { x: 100, y: 200 }
  const sourceSize = { width: 320, height: 180 }

  it('从源视频右侧开始，逐列铺开', () => {
    const positions = shotCutNodePositions({ origin, sourceSize, count: 2, columns: 4 })
    expect(positions[0]).toEqual({ x: 516, y: 200 })
    expect(positions[1]).toEqual({ x: 868, y: 200 })
  })

  it('满一行后换行', () => {
    const positions = shotCutNodePositions({ origin, sourceSize, count: 5, columns: 4 })
    expect(positions[4]).toEqual({ x: 516, y: 412 })
  })

  it('count 为 0 → 空数组', () => {
    expect(shotCutNodePositions({ origin, sourceSize, count: 0 })).toEqual([])
  })
})
