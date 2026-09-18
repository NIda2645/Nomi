import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { enStoryboardEditor, zhStoryboardEditor } from '../../../i18n/locales/storyboardEditor'

/**
 * 分镜面「装不下」的两条不变量（2026-09-17，EN 越界清零）。
 *
 * 现场：1280 视口 + Agent 面板展开 + 创作内容列收起时，分镜编辑器只有 840px。
 * 同一档下中文越界叶子 0，**英文 34** —— 被切的是 `Discard plan`、`Changes here apply to
 * all 8 shots…`、`3/8 shots generated…` 这类说明文字。两条根因、两条不变量：
 *
 *   ① 编辑器那张 grid **没写列模板** → 浏览器给一条隐式 `auto` 列 = max-content，
 *      最长的一行（页脚/批量条提示）把整列撑到 700+，再被 `overflow-hidden` 从右边剪掉。
 *      英文串长 1.5–2 倍，所以中文看不出、英文全线被切。
 *   ② 页脚的**让位顺序反了**：右组 `shrink-0` 里挂着一句零行动价值的重复说明，
 *      左组那句要用户去做事的进度/问题摘要反而靠 `truncate` 让位。
 *
 * 这两条都不是「英文的问题」——是英文把它们量出来了。
 */

const read = (relative: string): string => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const editor = stripComments(read('src/workbench/creation/storyboard/StoryboardPlanEditor.tsx'))

describe('分镜编辑器：列宽钉在容器上，不由最长那一行说了算', () => {
  /**
   * `grid-cols-1` = `repeat(1, minmax(0,1fr))`。缺了它，隐式 `auto` 列取 max-content——
   * 越界的不是某一个元素写错了，是**整列**被最长的一行拉宽后统一剪掉。
   */
  it('编辑器 grid 写死单列模板（不靠隐式 auto 列）', () => {
    const section = editor.slice(editor.indexOf('data-storyboard-editor="true"') - 900, editor.indexOf('data-storyboard-editor="true"'))
    expect(section).toContain('grid-cols-1')
    expect(section).toContain('grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]')
  })

  /** 第二道保险：内容反过来撑宽滚动区这条路也堵死，顺带给行提供容器查询的锚。 */
  it('滚动区是 inline-size 容器，内容撑不宽它', () => {
    expect(editor).toContain('[container-type:inline-size]')
    expect(editor).toContain('[container-name:storyboard]')
  })
})

describe('分镜页脚：让位的是说明文字，不是要用户去做事的那句', () => {
  /**
   * 删掉的那句 `footer.spendNote` 逐字等于提示行 `spendHint` 的后半句——同一屏写了两遍，
   * 且住在 `shrink-0` 里永不让位（EN ≈220px / zh ≈110px）。留着它，左边那句
   * 「3/8 shots generated · 1 waiting for reference cards…」在 1280 下被切掉 426px。
   */
  it('页脚不再挂重复的花费说明（词条也一并删掉，不留死词条）', () => {
    expect(editor).not.toContain("t('storyboardEditor.footer.spendNote')")
    expect(zhStoryboardEditor.footer).not.toHaveProperty('spendNote')
    expect(enStoryboardEditor.footer).not.toHaveProperty('spendNote')
  })

  /** zh 轨：那句话还在屏上，只是只剩一份——在提示行里。 */
  it('zh：「每次生成前确认花费」仍在提示行里，只有一份', () => {
    expect(zhStoryboardEditor.spendHint).toContain('每次生成前确认花费')
    const zhFooterValues: string[] = Object.values(zhStoryboardEditor.footer)
    expect(zhFooterValues.some((value) => value.includes('确认花费'))).toBe(false)
  })

  /** en 轨：同一条，英文串更长，所以它白占的宽度也更多——这条才是把摘要挤没的那一条。 */
  it('en：Cost is confirmed… 仍在提示行里，只有一份', () => {
    expect(enStoryboardEditor.spendHint).toContain('Cost is confirmed before every generation')
    const enFooterValues: string[] = Object.values(enStoryboardEditor.footer)
    expect(enFooterValues.some((value) => value.includes('Cost is confirmed'))).toBe(false)
  })

  /** 页脚右组只剩主动作；左组仍是 `min-w-0` + `truncate`（摘要让位、按钮不让位）。 */
  it('右组只剩主动作，左组仍然是会让位的那一侧', () => {
    const footer = editor.slice(editor.indexOf('<footer'), editor.indexOf('</footer>'))
    expect(footer).toContain('data-storyboard-batch="true"')
    expect(footer).toContain('data-storyboard-progress="true"')
    expect(footer.slice(footer.indexOf('shrink-0'))).not.toContain('text-micro text-nomi-ink-40')
    expect(footer).toContain('min-w-0')
  })
})
