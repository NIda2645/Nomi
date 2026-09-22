import { describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import { encodeMention } from '../../assets/promptMentions'
import {
  buildTranslatePrompt,
  cleanTranslationOutput,
  detectTranslateDirection,
  protectMentions,
  restoreMentions,
  splitOuterWhitespace,
} from './promptTranslate'

// 翻译「翻坏了用户看不出来」的两种方式：方向反了、@引用被模型吃掉。两件都钉在这里。

const REF_A = encodeMention('nomi-asset://project/cat.png')
const REF_B = encodeMention('https://example.com/a very long/english-url.jpg')

describe('detectTranslateDirection', () => {
  it('纯中文 → 译成英文', () => {
    expect(detectTranslateDirection('一只橘猫坐在窗台上，黄昏的光')).toBe('zh-to-en')
  })

  it('纯英文 → 译成中文', () => {
    expect(detectTranslateDirection('An orange cat sitting on a windowsill at dusk')).toBe('en-to-zh')
  })

  it('中文为主、夹几个英文术语 → 仍是中文为主', () => {
    expect(detectTranslateDirection('赛博朋克城市夜景，霓虹灯倒映在积水里，cinematic, 8k')).toBe('zh-to-en')
  })

  it('英文为主、夹一个中文词 → 英文为主', () => {
    expect(detectTranslateDirection('A samurai walking through a bamboo forest in heavy rain, 武士')).toBe('en-to-zh')
  })

  it('引用标记里的英文 url 不参与判断：中文 + 引用仍是中文', () => {
    expect(detectTranslateDirection(`让${REF_B}里的女孩转身微笑`)).toBe('zh-to-en')
  })

  it('只有引用/数字/标点 → null（没有可翻译的文字）', () => {
    expect(detectTranslateDirection(`${REF_A} 123 ，。`)).toBeNull()
    expect(detectTranslateDirection('')).toBeNull()
  })
})

describe('protectMentions / restoreMentions', () => {
  it('引用按出现顺序换成占位符，重复引用各占一个号', () => {
    const guarded = protectMentions(`${REF_A}里的猫跳到${REF_B}上，再看${REF_A}`)
    expect(guarded.text).toBe('⟦1⟧里的猫跳到⟦2⟧上，再看⟦3⟧')
    expect(guarded.mentions).toEqual([REF_A, REF_B, REF_A])
  })

  it('往返：占位符被挪了位置也能还原成原引用', () => {
    const guarded = protectMentions(`${REF_A}里的猫跳到${REF_B}上`)
    const restored = restoreMentions('The cat from ⟦1⟧ jumps onto ⟦2⟧', guarded.mentions)
    expect(restored).toEqual({ ok: true, prompt: `The cat from ${REF_A} jumps onto ${REF_B}` })
  })

  it('没有引用的文本原样往返', () => {
    const guarded = protectMentions('a cat')
    expect(guarded).toEqual({ text: 'a cat', mentions: [] })
    expect(restoreMentions('一只猫', guarded.mentions)).toEqual({ ok: true, prompt: '一只猫' })
  })

  it('模型丢了一个占位符 → 拒绝（不静默丢参考图）', () => {
    const guarded = protectMentions(`${REF_A}和${REF_B}`)
    expect(restoreMentions('⟦1⟧ and the other one', guarded.mentions)).toEqual({ ok: false, reason: 'placeholder-mismatch' })
  })

  it('模型重复了一个占位符 → 拒绝', () => {
    const guarded = protectMentions(`${REF_A}和${REF_B}`)
    expect(restoreMentions('⟦1⟧ and ⟦1⟧ and ⟦2⟧', guarded.mentions).ok).toBe(false)
  })

  it('模型编出一个不存在的占位符 → 拒绝', () => {
    const guarded = protectMentions(`${REF_A}`)
    expect(restoreMentions('⟦1⟧ ⟦2⟧', guarded.mentions).ok).toBe(false)
    expect(restoreMentions('⟦0⟧', guarded.mentions).ok).toBe(false)
  })
})

describe('cleanTranslationOutput / splitOuterWhitespace', () => {
  it('剥掉最外层代码围栏和两端空白，正文不动', () => {
    expect(cleanTranslationOutput('```text\nA cat\non a roof\n```')).toBe('A cat\non a roof')
    expect(cleanTranslationOutput('  A cat  ')).toBe('A cat')
  })

  it('选区两端空白拆出来，替换时接回', () => {
    expect(splitOuterWhitespace('  黄昏 \n')).toEqual({ lead: '  ', core: '黄昏', trail: ' \n' })
    expect(splitOuterWhitespace('   ')).toEqual({ lead: '   ', core: '', trail: '' })
  })
})

describe('buildTranslatePrompt', () => {
  it('中译英：目标语言、原文、输出只要译文三件都在', async () => {
    await i18n.changeLanguage('zh-CN')
    const p = buildTranslatePrompt('一只猫', 'zh-to-en', 0)
    expect(p).toContain('英文')
    expect(p).toContain('"""\n一只猫\n"""')
    expect(p).toContain('只输出译文')
    expect(p).not.toContain('⟦1⟧') // 没引用就不提占位符，免得模型凭空造一个
  })

  it('有引用时把「占位符原样保留」写进指令', async () => {
    await i18n.changeLanguage('zh-CN')
    const p = buildTranslatePrompt('⟦1⟧里的猫', 'zh-to-en', 1)
    expect(p).toContain('⟦1⟧')
    expect(p).toContain('原样保留')
  })

  it('英译中指向中文', async () => {
    await i18n.changeLanguage('en')
    const p = buildTranslatePrompt('a cat', 'en-to-zh', 0)
    expect(p).toContain('Simplified Chinese')
    await i18n.changeLanguage('zh-CN')
  })
})
