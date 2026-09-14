import { describe, expect, it } from 'vitest'
import { SHOT_TIME_PRECISION_SECONDS, quantizeShotSeconds } from './shotTime'

describe('quantizeShotSeconds：镜头时间的精度 owner', () => {
  it('把 ffmpeg/ffprobe 的原始双精度测量值吸到最近的格子上', () => {
    expect(quantizeShotSeconds(1.4681260000000001)).toBe(1.5)
    expect(quantizeShotSeconds(3.9033329999999998)).toBe(3.9)
    expect(quantizeShotSeconds(8.033333)).toBe(8)
  })

  it('结果的字面量不留浮点尾数——用户看到的就是这个字符串', () => {
    for (let raw = 0; raw < 12; raw += 0.013) {
      expect(String(quantizeShotSeconds(raw))).toMatch(/^\d+(\.\d)?$/)
    }
  })

  it('幂等：已经在格子上的值再吸一次不动（读入口会反复经过它）', () => {
    for (const value of [0, 0.1, 0.3, 2.4, 8]) {
      expect(quantizeShotSeconds(quantizeShotSeconds(value))).toBe(quantizeShotSeconds(value))
      expect(quantizeShotSeconds(value)).toBe(value)
    }
  })

  it('非有限值与负值收敛到 0，绝不把 NaN 漏进落库的文档', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, -0.04]) {
      expect(quantizeShotSeconds(value)).toBe(0)
    }
  })

  it('半格是「贴边」判据的派生来源：低于半格吸到 0，达到半格进下一格', () => {
    const half = SHOT_TIME_PRECISION_SECONDS / 2
    expect(quantizeShotSeconds(half * 0.99)).toBe(0)
    expect(quantizeShotSeconds(half)).toBe(SHOT_TIME_PRECISION_SECONDS)
  })
})
