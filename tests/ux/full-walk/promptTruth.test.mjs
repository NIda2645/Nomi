// 「所见即所发」提示词判据的契约测试：既要拦得住「巨龙 + 看不见的人物特征」，也不许对正常写法乱红。
import { describe, expect, it } from 'vitest'

import { unseenPromptAdditions } from './promptTruth.mjs'

const DRAGON = '一条巨龙盘在山顶'
const HERO_LINE = '林薇·身份特征（跨镜保持一致）：黑色齐肩短发、瓜子脸的年轻女子，左眉有一道浅疤'
const MOOD_LINE = '全片风格：赛博霓虹，冷蓝洋红'
// 分镜编辑器此刻的全部文字：有提示词、有锚的名字，没有锚的身份特征。
const EDITOR_TEXT = `巨龙走查\n林薇\n被 3 镜引用\n全片风格\n不生成图\n01\n${DRAGON}\n生成剩余`

describe('unseenPromptAdditions · 该红的', () => {
  it('分镜行：用户写「巨龙」，发出去多了定妆卡的身份特征和文本锚整段 → 两段都是看不见的追加', () => {
    const unseen = unseenPromptAdditions({ shown: DRAGON, sentRaw: `${DRAGON}\n${HERO_LINE}\n${MOOD_LINE}`, surfaceText: EDITOR_TEXT })
    expect(unseen).toEqual([HERO_LINE, MOOD_LINE])
  })

  it('只追加一段也红；追加在前面（替换式）也红', () => {
    expect(unseenPromptAdditions({ shown: DRAGON, sentRaw: `${DRAGON}\n${MOOD_LINE}`, surfaceText: EDITOR_TEXT })).toEqual([MOOD_LINE])
    expect(unseenPromptAdditions({ shown: DRAGON, sentRaw: `${HERO_LINE}\n${DRAGON}`, surfaceText: EDITOR_TEXT })).toEqual([HERO_LINE])
  })

  it('用户看到的那句被换成别的（整句都不是他写的）→ 整句都是看不见的', () => {
    expect(unseenPromptAdditions({ shown: DRAGON, sentRaw: '一个穿风衣的女人', surfaceText: EDITOR_TEXT })).toEqual(['一个穿风衣的女人'])
  })
})

describe('unseenPromptAdditions · 不该红的', () => {
  it('发出去的和看到的一字不差', () => {
    expect(unseenPromptAdditions({ shown: DRAGON, sentRaw: DRAGON, surfaceText: EDITOR_TEXT })).toEqual([])
  })

  it('追加的字就摆在同一个界面上（用户看得见）→ 不红：画布节点的提示词框里本来就是完整的一份', () => {
    const nodeText = `${DRAGON}\n${HERO_LINE}\n${MOOD_LINE}\n生成`
    expect(unseenPromptAdditions({ shown: DRAGON, sentRaw: `${DRAGON}\n${HERO_LINE}\n${MOOD_LINE}`, surfaceText: nodeText })).toEqual([])
  })

  it('空白数量不同不算改字（编辑器把换行渲染成什么样，不是用户写的字）', () => {
    expect(unseenPromptAdditions({ shown: '一条巨龙   盘在山顶\n\n', sentRaw: '一条巨龙 盘在山顶', surfaceText: EDITOR_TEXT })).toEqual([])
  })

  it('多行提示词：每一行都是用户自己写的 → 不红', () => {
    const shown = '第一句\n第二句'
    expect(unseenPromptAdditions({ shown, sentRaw: '第一句\n第二句', surfaceText: 'x' })).toEqual([])
  })

  it('这个入口读不到「界面上有什么」（没有 surfaceText）、或用户此刻没有提示词 → 不判，不乱红', () => {
    expect(unseenPromptAdditions({ shown: DRAGON, sentRaw: `${DRAGON}\n${HERO_LINE}` })).toEqual([])
    expect(unseenPromptAdditions({ shown: '', sentRaw: HERO_LINE, surfaceText: EDITOR_TEXT })).toEqual([])
  })
})
