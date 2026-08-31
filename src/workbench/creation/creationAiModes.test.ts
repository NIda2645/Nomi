import { describe, expect, it } from 'vitest'
import {
  CREATION_AI_MODES,
  getCreationAiMode,
  modeAllowsIntentRouting,
  modeAllowsWriteTools,
} from './creationAiModes'

describe('creationAiModes — chatOnly 能力声明驱动写工具门禁', () => {
  it('chatOnly 模式（通用问答）不允许写文档工具', () => {
    const general = getCreationAiMode('general')
    expect(general.chatOnly).toBe(true)
    expect(modeAllowsWriteTools(general)).toBe(false)
  })

  it('创作类模式（写故事/写剧本…）允许写文档工具', () => {
    const story = getCreationAiMode('story')
    expect(story.chatOnly).toBeFalsy()
    expect(modeAllowsWriteTools(story)).toBe(true)
  })

  it('全部模式的写工具门禁 = chatOnly 取反（单一真相源，不另立第二份判定）', () => {
    for (const mode of CREATION_AI_MODES) {
      expect(modeAllowsWriteTools(mode)).toBe(!mode.chatOnly)
    }
  })
})

describe('creationAiModes — dedicatedJob 能力声明驱动跨面板意图路由门禁', () => {
  // 用户实测反馈（2026-08-17）：选了「素材规划」，说一句带「画面/场景」的话，
  // 仍被意图路由劫持去拆分镜。根因是旧守卫把模式名硬编码成 id === 'storyboard'，
  // 只保护了一个模式。这条锁死「专职模式一律不被劫走」。
  it('素材规划是专职模式 —— 不允许被拆分镜意图路由劫走（回归锁）', () => {
    const assets = getCreationAiMode('assets')
    expect(assets.dedicatedJob).toBe(true)
    expect(modeAllowsIntentRouting(assets)).toBe(false)
  })

  it('专职模式全员受保护，不只是写分镜文字稿那一个', () => {
    for (const id of ['assets', 'storyboard', 'seedance', 'review'] as const) {
      expect(modeAllowsIntentRouting(getCreationAiMode(id))).toBe(false)
    }
  })

  it('自由写作模式（通用/故事/剧本）保留意图路由 —— 那里「拆镜头」是真实的跨面板意图', () => {
    for (const id of ['general', 'story', 'script'] as const) {
      expect(modeAllowsIntentRouting(getCreationAiMode(id))).toBe(true)
    }
  })

  it('全部模式的路由门禁 = dedicatedJob 取反（单一真相源，新增模式自动纳管）', () => {
    for (const mode of CREATION_AI_MODES) {
      expect(modeAllowsIntentRouting(mode)).toBe(!mode.dedicatedJob)
    }
  })
})
