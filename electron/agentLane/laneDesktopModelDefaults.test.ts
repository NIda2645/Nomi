import { describe, expect, it, vi } from 'vitest'

const resolver = vi.hoisted(() => vi.fn())
vi.mock('../capabilityCore/generationDefaultModelResolver', () => ({ readGenerationDefaultModelResolver: () => resolver }))

import { readLaneDeclaredDefaults } from './laneDesktopModelDefaults'

describe('告诉模型的默认 = 宿主没点名时实际补上的默认（同一个函数回答）', () => {
  it('每个任务都问 resolver 一次；resolver 答不出（没设 / 此刻用不了）的任务不出现', () => {
    resolver.mockImplementation((taskKind: string) => taskKind === 'text_to_image'
      ? { moduleId: 'generation.single-shot', providerId: 'apimart', modelId: 'gpt-image-2', mode: taskKind }
      : taskKind === 'image_to_video' ? { moduleId: 'generation.single-shot', providerId: 'kie', modelId: 'seedance', mode: taskKind, modeId: 'i2v' } : undefined)
    expect(readLaneDeclaredDefaults()).toEqual({
      text_to_image: { vendor: 'apimart', modelId: 'gpt-image-2' },
      image_to_video: { vendor: 'kie', modelId: 'seedance' },
    })
    expect(resolver.mock.calls.map((call) => call[0]).sort()).toEqual(['image_edit', 'image_to_video', 'text_to_image', 'text_to_video'])
  })
})
