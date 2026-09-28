import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHIP_CHROME_PLAIN,
  CHIP_CHROME_WITH_ICON,
  COMPOSER_CHIP_YIELD,
  composerBarRequiredWidth,
  composerChipFloor,
  composerChipNaturalWidth,
  composerDemotedChipKeys,
  composerModelChipMinWidth,
  estimateLabelWidth,
} from './composerBarGeometry'

/**
 * 让位机制的三步（2026-09-17 用户拍板：方案 D + 让位下限）。
 *
 * 2026-09-06 只定了**让位优先级**，没定**下限**——于是最高优先级那枚一个人扛下全部亏空，
 * 英文下模型胶囊被压到 0–23px，只剩一颗齿轮图标。这一组钉住补上的后两步：
 *   ② 让到下限为止（下限不是"至少这么宽"，是"最多缩到这里"）；
 *   ③ 都到底了，把**可降级的枚举**整枚挪进行尾 ⋯。
 */

const read = (relative: string): string => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const bar = read('src/workbench/creation/storyboard/shotRow/ShotComposerBar.tsx')

describe('让位政策：优先级和下限写在同一处', () => {
  it('模型/供应商会让位，模式/时长/画幅从不让位', () => {
    expect(COMPOSER_CHIP_YIELD.model.shrink).toBeGreaterThan(COMPOSER_CHIP_YIELD.provider.shrink)
    for (const kind of ['mode', 'duration', 'aspect', 'param'] as const) {
      expect(COMPOSER_CHIP_YIELD[kind].shrink).toBe(0)
    }
  })

  /** 用户 2026-09-17 逐字：尺寸枚举可以进 ⋯，模型 / 模式 / 时长不可以。 */
  it('只有档案枚举参数可降级；模型/模式/时长/画幅都不许进 ⋯', () => {
    expect(COMPOSER_CHIP_YIELD.param.demotable).toBe(true)
    for (const kind of ['model', 'provider', 'mode', 'duration', 'aspect'] as const) {
      expect(COMPOSER_CHIP_YIELD[kind].demotable).toBe(false)
    }
  })

  /** 下限是一句「读得出型号名」的承诺，落到真机上量出来必须 ≥108px（用户给的验收数）。 */
  it('模型胶囊下限 ≥108px（§1.5.4 模型不许埋）', () => {
    expect(composerChipFloor({ kind: 'model', label: '', hasIcon: true })).toBeGreaterThanOrEqual(108)
  })

  /**
   * 从不让位的那几枚**不许**再声明一个字符下限：写了也没人读，迟早被当成真相
   *（而且会诱人拿它跟"字符个数"比大小——档案里最长的 vendorTerm 是「再生成（768P → 2K）」，
   * 14 个字符却宽得像 24 个拉丁字母，按个数比出来的结论一定是错的）。
   */
  it('不让位的那几枚不写下限数字（下限 = 自然宽，由算式表达）', () => {
    for (const kind of ['mode', 'duration', 'aspect', 'param'] as const) {
      expect(COMPOSER_CHIP_YIELD[kind].minLabelChars).toBeUndefined()
    }
    const mode = { kind: 'mode' as const, label: 'Text-to-image' }
    expect(composerChipFloor(mode)).toBe(composerChipNaturalWidth(mode))
  })
})

describe('下限不是“至少这么宽”，是“最多缩到这里”', () => {
  /**
   * 这条是 2026-09-17 真机上翻红过的那一条：中文「默认模型」自然宽 84px，而下限按
   * 「有身份图标」算成 110px，于是短胶囊被**撑胖** 6px，1680 那张本该逐像素不变的截图变了。
   */
  it('标签比下限短时，用它自己的宽度，不撑胖', () => {
    const short = composerModelChipMinWidth('默认模型', false)
    expect(short).toBeLessThan(composerChipFloor({ kind: 'model', label: '', hasIcon: true }))
    expect(short).toBe(Math.round(estimateLabelWidth('默认模型', { conservative: true })) + CHIP_CHROME_PLAIN)
  })

  it('标签比下限长时，停在下限（可以截断，但不许缩到没字）', () => {
    const long = composerModelChipMinWidth('Seedance 2.5 Pro Ultra', true)
    expect(long).toBe(composerChipFloor({ kind: 'model', label: '', hasIcon: true }))
    expect(long).toBeGreaterThanOrEqual(108)
  })

  /** 「默认模型」那一项没有身份图标，固定开销少 20px——两档必须真的不一样。 */
  it('有没有身份图标是两档固定开销，不是同一个数', () => {
    expect(CHIP_CHROME_WITH_ICON - CHIP_CHROME_PLAIN).toBe(20)
    expect(composerModelChipMinWidth('Seedance 2.5 Pro', false))
      .toBeLessThan(composerModelChipMinWidth('Seedance 2.5 Pro', true))
  })

  /** 全角字按 1em 算：不这么数，中文行会被判成「很窄，装得下」。 */
  it('全角字按 1em 算，不靠“乘以拉丁平均值”糊弄', () => {
    expect(estimateLabelWidth('改')).toBe(12)
    expect(estimateLabelWidth('改图')).toBeGreaterThan(estimateLabelWidth('ab'))
    expect(estimateLabelWidth('默认模型')).toBe(48)
  })
})

describe('第三步：装不下才挪，一次一枚', () => {
  const chips = [
    { kind: 'model' as const, label: 'Fixture 图片', hasIcon: true },
    { kind: 'mode' as const, label: 'Text-to-image' },
    { kind: 'duration' as const, label: '3 sec' },
    { kind: 'param' as const, label: '1024x1024', key: 'size' },
  ]
  const tail = { dots: false, generate: true }

  it('宽屏装得下：一枚都不挪（1680 前后逐像素一致靠的就是这条）', () => {
    expect(composerDemotedChipKeys(chips, 789, tail)).toEqual([])
  })

  it('窄了才把可降级的那枚挪进 ⋯', () => {
    expect(composerDemotedChipKeys(chips, 389, tail)).toEqual(['size'])
  })

  it('还没量到宽度时一枚都不挪（不拿猜出来的宽度闪一下）', () => {
    expect(composerDemotedChipKeys(chips, null, tail)).toEqual([])
  })

  /** 能让的都让完了就停：宁可这一行溢出，也不把一等决策挪走。 */
  it('可降级的挪完还是装不下，也不动模型/模式/时长', () => {
    expect(composerDemotedChipKeys(chips, 40, tail)).toEqual(['size'])
  })

  /**
   * 挪走一枚要连它那个 gap 一起省下来，而 ⋯ 自己要占回 24px——算错这两笔就会多挪一枚。
   * 断言写成「规则」而不是某个宽度：可用宽正好等于「少一枚就够了」的那个数时，就该只挪一枚。
   */
  it('挪一枚之后重算，够了就不再挪第二枚', () => {
    const twoParams = [...chips, { kind: 'param' as const, label: '1K', key: 'quality' }]
    const justEnough = composerBarRequiredWidth(chips, { dots: true, generate: true })
    const demoted = composerDemotedChipKeys(twoParams, justEnough, tail)
    expect(demoted).toEqual(['quality'])
    expect(composerBarRequiredWidth(
      twoParams.filter((chip) => !demoted.includes(chip.key ?? '')),
      { dots: true, generate: true },
    )).toBeLessThanOrEqual(justEnough)
  })
})

describe('zh / en 两轨：同一条算式，两种字宽', () => {
  const row = (modeLabel: string, durationLabel: string) => [
    { kind: 'model' as const, label: 'Fixture 图片', hasIcon: true },
    { kind: 'mode' as const, label: modeLabel },
    { kind: 'duration' as const, label: durationLabel },
    { kind: 'param' as const, label: '1024x1024', key: 'size' },
  ]

  /** 英文串长 1.5–2 倍，所以同一个宽度下英文更早需要 ⋯——这正是 EN 34 个越界叶子的来处。 */
  it('en：1280 档（底栏 389）装不下 → 尺寸进 ⋯', () => {
    expect(composerDemotedChipKeys(row('Text-to-image', '3 sec'), 389, { dots: false, generate: true })).toEqual(['size'])
  })

  it('zh：同一档也装不下（模型不许再被压成图标，所以中文一样要让）', () => {
    expect(composerDemotedChipKeys(row('文生图', '3 秒'), 389, { dots: false, generate: true })).toEqual(['size'])
  })

  it('zh/en：1680 档（底栏 789）都装得下，两轨都不挪', () => {
    expect(composerDemotedChipKeys(row('Text-to-image', '3 sec'), 789, { dots: false, generate: true })).toEqual([])
    expect(composerDemotedChipKeys(row('文生图', '3 秒'), 789, { dots: false, generate: true })).toEqual([])
  })
})

describe('接线：政策表真的被底栏用上了', () => {
  it('每一枚胶囊都声明了自己是哪一类（不再各写各的 shrink 数字）', () => {
    expect(bar).not.toContain('const SHRINK =')
    for (const kind of ['model', 'provider', 'mode', 'aspect', 'duration', 'param'] as const) {
      expect(bar).toContain(`kind="${kind}"`)
    }
  })

  it('模型胶囊的下限同时写在壳和触发上（只写一边会压到隔壁那枚）', () => {
    expect(bar).toContain('composerModelChipMinWidth(modelChipLabel, modelChipHasIcon)}px`}')
    expect(bar).toContain('triggerMinWidth={composerModelChipMinWidth(modelChipLabel, modelChipHasIcon)}')
  })

  it('被挪下来的枚举在 ⋯ 里是能改值的控件，不是只读文字', () => {
    const panel = bar.slice(bar.indexOf('data-storyboard-composer-switch-panel'))
    expect(panel).toContain('demotedParams.map(')
    expect(panel).toContain('<NomiSelect')
    expect(panel).toContain('onUpdate({ params:')
  })

  it('行上只渲染没被挪走的那几枚（不留两份同一个控件）', () => {
    expect(bar).toContain('{shownParams.map(')
    expect(bar).not.toContain('{inlineParams.map(')
  })
})
