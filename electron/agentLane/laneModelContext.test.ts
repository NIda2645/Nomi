// 系统提示词里那句「去哪查完整模型目录」点名的工具，必须是模型此刻真能调的工具。
//
// 2026-09-14 的 20 动词改名（afe85411d8，不留别名）把模型目录读从 `nomi_read target=models` 改成了
// `list_models`，这句提示词没跟上：每一轮都在叫模型去调一个不存在的工具（2026-09-24 同类扫描发现）。
import { describe, expect, it } from 'vitest'
import { MODEL_FACING_TOOL_SPECS, modelCatalogReadSpec } from '../shared/agentCapabilities/modelFacingToolRegistry'
import type { LaneComposerContext } from '../shared/agentLane/laneDesktopContracts'
import { formatLaneModelIndex } from './laneModelContext'
import { LANE_TOOL_REQUEST_TOOL_NAME } from './laneToolGroups.mjs'

const context = {
  model: { vendorKey: 'fixture', modelKey: 'text-1' },
  availableModels: [{
    vendor: 'fixture', modelId: 'image-1', kind: 'image', defaultModeId: 'standard',
    modes: [{ modeId: 'standard', params: [] }],
  }],
} as unknown as LaneComposerContext

describe('模型索引那句指路，只点名真能调的工具', () => {
  it('每一个 x_y 形的工具名都在动词声明里（或是 lane 自己的按需加载工具）', () => {
    const text = formatLaneModelIndex(context)
    const callable = new Set([...MODEL_FACING_TOOL_SPECS.map((spec) => spec.name), LANE_TOOL_REQUEST_TOOL_NAME])
    // 先证判据会命中东西，免得「一个都不认识」在文案被改空时恒真。
    const named = [...text.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((match) => match[0])
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(callable.has(name), name).toBe(true)
    expect(text).not.toContain('nomi_read')
    expect(text).not.toContain('${')
    // 指路那句必须真的点名「读模型目录」的那个动词（它是谁由声明说了算）。
    expect(named).toContain(modelCatalogReadSpec().name)
  })
})

describe('用户声明的默认模型：模型看得到，且说的是同一个模型', () => {
  const declared = { text_to_image: { vendor: 'fixture', modelId: 'image-1' }, image_to_video: { vendor: 'fixture', modelId: 'video-9' } } as const

  it('索引里有「图片默认 / 视频默认」，并带着「没点名用默认、点名听用户、换了要先说」三条规则', () => {
    const text = formatLaneModelIndex(context, declared)
    expect(text).toContain('图片默认（文生图）：fixture/image-1')
    expect(text).toContain('视频默认（图生视频）：fixture/video-9')
    expect(text).toContain('用户没点名模型时')
    expect(text).toContain('以用户点名的为准')
    expect(text).toContain('先在回话里说清为什么换')
    // 没声明的任务不出行——不告诉模型一个不存在的默认。
    expect(text).not.toContain('改图')
    expect(text).not.toContain('文生视频')
  })

  it('一个默认都没有：整段不出', () => {
    expect(formatLaneModelIndex(context, {})).not.toContain('用户在设置里选的默认模型')
    expect(formatLaneModelIndex(context)).not.toContain('用户在设置里选的默认模型')
  })
})
