import { describe, expect, it } from 'vitest'
import {
  POLLUTION_RULES,
  VARIATION_TYPE_GUIDE,
  checkShotLanguage,
  findCharacterNamesInMotion,
  findPollutionWords,
  verifyFocusForVariation,
} from './shotLanguage'

// W4 · 把 director-shot-translation 的方法论从「靠自觉」变成「可校验」。
// 铁律：只报告不阻断（同审片环哲学——增益不是关卡），但报告必须带「为什么坏 + 改成什么」，
// 否则就是在挑刺而不是在帮忙。

describe('variationType 路由（ViMax variation_type：生成策略与审片侧重的路由键）', () => {
  it('三档都有人话判定说明', () => {
    for (const key of ['large', 'medium', 'small'] as const) {
      expect(VARIATION_TYPE_GUIDE[key].length).toBeGreaterThan(8)
    }
  })

  it('large 镜先审「接不接得上」，small 镜先审「还是不是同一个人」（侧重不同，不是同一张表）', () => {
    expect(verifyFocusForVariation('large')[0]).toBe('continuity')
    expect(verifyFocusForVariation('small')[0]).toBe('identity')
    expect(verifyFocusForVariation('medium')[0]).toBe('identity')
  })

  it('三档都覆盖全部三轴（只调顺序不丢轴——不能因为路由把某轴漏掉）', () => {
    for (const key of ['large', 'medium', 'small'] as const) {
      expect([...verifyFocusForVariation(key)].sort()).toEqual(['composition', 'continuity', 'identity'])
    }
  })
})

describe('污染词校验（模型看到某词就脑补整套刻板印象，否定也没用）', () => {
  it('抽象概念命中：「意识」→ 报大脑发光的坑 + 给物理表现替代', () => {
    const hits = findPollutionWords('镜头推进，展现她的意识流动')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].word).toBe('意识')
    expect(hits[0].trap).toContain('大脑')
    expect(hits[0].fix).toContain('瞳孔')
  })

  it('★视线类命中：「望向」会强行出正脸——这条最容易毁掉背影镜', () => {
    const hits = findPollutionWords('她背对镜头，望向远处的灯塔')
    expect(hits.some((h) => h.word === '望向')).toBe(true)
    expect(hits.find((h) => h.word === '望向')!.fix).toContain('身体朝向')
  })

  it('事件名命中：「驾驶」→ 好莱坞刻板造型，建议拆成具体动作', () => {
    expect(findPollutionWords('他在驾驶').some((h) => h.word === '驾驶')).toBe(true)
  })

  it('干净的物理描述零命中（不误报——误报多了没人再看这个提示）', () => {
    expect(findPollutionWords('她背对镜头站立，画面右侧出现一扇亮着的窗，手指敲击窗框')).toEqual([])
  })

  it('每条规则都必须同时给「坑」与「改法」（只说不好不给出路 = 挑刺）', () => {
    for (const rule of POLLUTION_RULES) {
      expect(rule.words.length).toBeGreaterThan(0)
      expect(rule.trap.length).toBeGreaterThan(4)
      expect(rule.fix.length).toBeGreaterThan(4)
    }
  })
})

describe('运动描述里的角色名（视频模型认不出专有名词）', () => {
  it('命中自己声明的锚名 → 报出来', () => {
    expect(findCharacterNamesInMotion('小周缓缓抬头看钟', ['小周', '男人'])).toEqual(['小周'])
  })

  it('用外貌特征指代 → 零命中（这正是我们要的写法）', () => {
    expect(findCharacterNamesInMotion('短发圆脸的女性缓缓抬头', ['小周'])).toEqual([])
  })

  it('不猜谁是角色名：没声明锚名就不报（避免把普通词当人名误伤）', () => {
    expect(findCharacterNamesInMotion('小周缓缓抬头', [])).toEqual([])
    expect(findCharacterNamesInMotion('小周缓缓抬头', ['  '])).toEqual([])
  })
})

describe('checkShotLanguage 汇总体检', () => {
  it('两类问题同时命中时都报，且各带 fix', () => {
    const issues = checkShotLanguage({ motionText: '小周望向窗外', characterNames: ['小周'] })
    expect(issues.some((i) => i.kind === 'pollution')).toBe(true)
    expect(issues.some((i) => i.kind === 'character-name-in-motion')).toBe(true)
    for (const i of issues) expect(i.fix.length).toBeGreaterThan(4)
  })

  it('好的写法零问题（背影 + 物体 + 外貌指代）', () => {
    const issues = checkShotLanguage({
      motionText: '短发圆脸的女性背对镜头站立，画面右侧出现亮着的便利店招牌',
      characterNames: ['小周'],
    })
    expect(issues).toEqual([])
  })

  it('空输入不炸', () => {
    expect(checkShotLanguage({ motionText: '' })).toEqual([])
  })
})
