import { describe, expect, it } from 'vitest'
import { pickFirstFramePainter } from './firstFramePainter'

// L3-F1b 复验抓出的真根因：两跳第 1 跳拿**视频模型**去画图，findExecutableModel 按 kind 过滤必然失败，
// 错误被 runFirstHop 吞掉 → 静默降级。单测当年没抓到，是因为 runTaskFn 是桩（桩不管 kind 都还你一张图）。
// 所以这一层要钉的正是「别把视频模型当画师」。

const IMG = (vendorKey: string, modelKey: string, refImage = true, keyStatus = 'ok') =>
  ({ vendorKey, modelKey, kind: 'image', keyStatus, references: { image: refImage } })
const VID = (vendorKey: string, modelKey: string) =>
  ({ vendorKey, modelKey, kind: 'video', keyStatus: 'ok', references: { image: true } })

describe('pickFirstFramePainter', () => {
  it('★视频模型永远不会被选来画图（这正是两跳静默失败的根因）', () => {
    expect(pickFirstFramePainter([VID('apimart', 'doubao-seedance-2.0')], 'apimart')).toBeNull()
  })

  it('同 vendor 优先（同一家的画风更接近后面那跳的视频模型）', () => {
    const picked = pickFirstFramePainter(
      [IMG('other', 'flux'), IMG('apimart', 'doubao-seedream-4.5'), VID('apimart', 'seedance')],
      'apimart',
    )
    expect(picked).toEqual({ vendorKey: 'apimart', modelKey: 'doubao-seedream-4.5' })
  })

  it('同 vendor 没有可用图片模型 → 退到别家（有画师总比不画强）', () => {
    expect(pickFirstFramePainter([IMG('other', 'flux'), VID('apimart', 'seedance')], 'apimart'))
      .toEqual({ vendorKey: 'other', modelKey: 'flux' })
  })

  it('★不吃图片参考的图片模型不选：那张首帧图会是个陌生人，比不画更糟', () => {
    expect(pickFirstFramePainter([IMG('apimart', 'text-only-img', false)], 'apimart')).toBeNull()
  })

  it('key 不可用的不选（选了也只会在真发请求时才炸）', () => {
    expect(pickFirstFramePainter([IMG('apimart', 'img', true, 'missing')], 'apimart')).toBeNull()
  })

  it('一个都挑不到 → null（调用方据此降级并**说明理由**，不静默）', () => {
    expect(pickFirstFramePainter([], 'apimart')).toBeNull()
  })
})
