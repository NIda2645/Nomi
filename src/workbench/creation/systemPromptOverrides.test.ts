import { describe, expect, it } from 'vitest'

import { CREATION_AI_MODES, defaultCreationAiPrompt, getCreationAiMode } from './creationAiModes'
import {
  hasPromptOverride,
  pruneRedundantOverrides,
  resolveEffectivePrompt,
  resetSystemPromptOverridesForTest,
  type SystemPromptOverrideMap,
} from './systemPromptOverrides'

const DEFAULT_STORY_PROMPT = defaultCreationAiPrompt('story') as string

describe('resolveEffectivePrompt — 覆盖合并', () => {
  it('有覆盖时覆盖胜出', () => {
    expect(resolveEffectivePrompt('默认', '我的')).toBe('我的')
  })

  it('没有覆盖时退回默认', () => {
    expect(resolveEffectivePrompt('默认', undefined)).toBe('默认')
    expect(resolveEffectivePrompt('默认', null)).toBe('默认')
  })

  it('空白覆盖退回默认（清空 = 回默认）', () => {
    expect(resolveEffectivePrompt('默认', '')).toBe('默认')
    expect(resolveEffectivePrompt('默认', '  \n ')).toBe('默认')
  })

  it('非字符串覆盖退回默认', () => {
    expect(resolveEffectivePrompt('默认', 42 as unknown as string)).toBe('默认')
  })

  it('覆盖值原样返回，不做 trim/规整', () => {
    expect(resolveEffectivePrompt('默认', '  前后有空格的自定义  ')).toBe('  前后有空格的自定义  ')
  })
})

describe('hasPromptOverride — 「已自定义」判定', () => {
  it('无覆盖 = 未自定义', () => {
    expect(hasPromptOverride({}, 'story', DEFAULT_STORY_PROMPT)).toBe(false)
  })

  it('有实质覆盖 = 已自定义', () => {
    expect(hasPromptOverride({ story: '我改过的' }, 'story', DEFAULT_STORY_PROMPT)).toBe(true)
  })

  it('覆盖值和默认值一模一样 = 不算自定义', () => {
    expect(hasPromptOverride({ story: DEFAULT_STORY_PROMPT }, 'story', DEFAULT_STORY_PROMPT)).toBe(false)
  })

  it('空白覆盖 = 不算自定义', () => {
    expect(hasPromptOverride({ story: '   ' }, 'story', DEFAULT_STORY_PROMPT)).toBe(false)
  })
})

describe('pruneRedundantOverrides — 写盘前剔除等于默认值的条目', () => {
  const defaultOf = (modeId: string): string | undefined => defaultCreationAiPrompt(modeId)

  it('剔除与默认值相同的条目（否则默认值一改，老用户被旧副本钉死）', () => {
    const input: SystemPromptOverrideMap = { story: DEFAULT_STORY_PROMPT, script: '我的剧本提示词' }
    expect(pruneRedundantOverrides(input, defaultOf)).toEqual({ script: '我的剧本提示词' })
  })

  it('剔除空白条目', () => {
    expect(pruneRedundantOverrides({ story: '  ', script: '有效' }, defaultOf)).toEqual({ script: '有效' })
  })

  it('保留真正的覆盖', () => {
    const input: SystemPromptOverrideMap = { story: '自定义 A', review: '自定义 B' }
    expect(pruneRedundantOverrides(input, defaultOf)).toEqual(input)
  })
})

describe('getCreationAiMode — 覆盖层接到模式清单上', () => {
  it('没有覆盖时返回内置默认提示词', () => {
    resetSystemPromptOverridesForTest({})
    expect(getCreationAiMode('story').prompt).toBe(DEFAULT_STORY_PROMPT)
  })

  it('有覆盖时返回覆盖后的提示词', () => {
    resetSystemPromptOverridesForTest({ overrides: { story: '我自己的故事提示词' } })
    expect(getCreationAiMode('story').prompt).toBe('我自己的故事提示词')
  })

  it('覆盖只影响被覆盖的那个模式', () => {
    resetSystemPromptOverridesForTest({ overrides: { story: '只改故事' } })
    expect(getCreationAiMode('script').prompt).toBe(defaultCreationAiPrompt('script'))
  })

  it('清掉覆盖后逐字节回到默认值', () => {
    resetSystemPromptOverridesForTest({ overrides: { story: '临时改一下' } })
    expect(getCreationAiMode('story').prompt).toBe('临时改一下')
    resetSystemPromptOverridesForTest({})
    expect(getCreationAiMode('story').prompt).toBe(DEFAULT_STORY_PROMPT)
  })

  it('覆盖不会污染 CREATION_AI_MODES 这份真相源', () => {
    const before = CREATION_AI_MODES.find((mode) => mode.id === 'story')?.prompt
    resetSystemPromptOverridesForTest({ overrides: { story: '改一个覆盖' } })
    getCreationAiMode('story')
    expect(CREATION_AI_MODES.find((mode) => mode.id === 'story')?.prompt).toBe(before)
    resetSystemPromptOverridesForTest({})
  })

  it('覆盖保留模式的其余能力声明（chatOnly / dedicatedJob 不被覆盖弄丢）', () => {
    resetSystemPromptOverridesForTest({ overrides: { general: '自定义通用提示词', assets: '自定义素材提示词' } })
    expect(getCreationAiMode('general').chatOnly).toBe(true)
    expect(getCreationAiMode('assets').dedicatedJob).toBe(true)
    resetSystemPromptOverridesForTest({})
  })
})
