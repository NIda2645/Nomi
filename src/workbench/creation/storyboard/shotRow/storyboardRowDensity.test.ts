import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRAME_COLUMN_WIDTH } from './shotFrameGeometry'
import { REFERENCE_COLUMN_WIDTH, REFERENCE_SLOT_BOX } from './shotReferenceStackGeometry'
import {
  NARROW_REFERENCE_COLUMN_WIDTH,
  ROW_COLUMN_GAP,
  ROW_COLUMN_COUNT,
  ROW_GRIP_WIDTH,
  ROW_PADDING_LEFT,
  ROW_PADDING_RIGHT,
  STORYBOARD_ROW_FIXED_WIDTH,
  STORYBOARD_ROW_NARROW_BELOW,
  referenceColumnWidthOf,
  storyboardRowGridTemplate,
  storyboardRowIsNarrow,
} from './storyboardRowDensity'

/**
 * 行密度档的不变量（2026-09-21 样张 v1）。
 *
 * 这一档是**最容易静默失效**的一类改动：判据是一个数、而这个数由另外三个文件里的常数加出来，
 * 改了盒子却没改判据不会报错，只会在某个宽度上突然又开始截断。所以每条都钉住「怎么算出来的」，
 * 而不是钉住今天的数值。
 */

const read = (relative: string): string => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

describe('行密度档：判据是算出来的，不是一个断点数字', () => {
  it('固定开销 = 三个固定列 + 三个间距 + 左右内边距', () => {
    expect(STORYBOARD_ROW_FIXED_WIDTH).toBe(
      ROW_GRIP_WIDTH + FRAME_COLUMN_WIDTH + REFERENCE_COLUMN_WIDTH
      + ROW_COLUMN_GAP * (ROW_COLUMN_COUNT - 1) + ROW_PADDING_LEFT + ROW_PADDING_RIGHT,
    )
  })

  /** 判据那句话：「提示词列比参考列还窄，就让参考列先收」。 */
  it('窄档门槛 = 固定开销 + 参考列宽（= 提示词列刚好等于参考列的那一点）', () => {
    expect(STORYBOARD_ROW_NARROW_BELOW).toBe(STORYBOARD_ROW_FIXED_WIDTH + REFERENCE_COLUMN_WIDTH)
  })

  /**
   * 真机量到的两态（样张第 1 节）：左栏收起行宽 807、左栏展开行宽 551。
   * 门槛必须把这两个**分在两边**，而且两边都要留余量——贴着门槛的判据等于没有判据。
   */
  it('左栏收起（807）走宽档、左栏展开（551）走窄档，两边各留 100px 以上余量', () => {
    expect(storyboardRowIsNarrow(807)).toBe(false)
    expect(storyboardRowIsNarrow(551)).toBe(true)
    expect(807 - STORYBOARD_ROW_NARROW_BELOW).toBeGreaterThan(100)
    expect(STORYBOARD_ROW_NARROW_BELOW - 551).toBeGreaterThan(50)
  })

  /** 还没量到就按宽档 = 今天的样子；首帧不许先画成窄档再跳回去。 */
  it('量不到宽度时按宽档', () => {
    expect(storyboardRowIsNarrow(null)).toBe(false)
  })

  /**
   * **不许有回环**：判据永远按宽档的固定开销算。若改成「按当前档剩下多少」判，
   * 收窄之后剩余宽变大、又判回宽档，两档之间会来回跳。这条用收窄后的剩余宽复算一次来钉住。
   */
  it('收窄后再判一次仍是窄档（判据与当前档位无关，不会来回跳）', () => {
    const rowWidth = STORYBOARD_ROW_NARROW_BELOW - 1
    expect(storyboardRowIsNarrow(rowWidth)).toBe(true)
    const narrowFixed = STORYBOARD_ROW_FIXED_WIDTH - REFERENCE_COLUMN_WIDTH + NARROW_REFERENCE_COLUMN_WIDTH
    expect(rowWidth - narrowFixed).toBeGreaterThan(REFERENCE_COLUMN_WIDTH)
    expect(storyboardRowIsNarrow(rowWidth)).toBe(true)
  })

  it('窄档参考列 = 一只固定盒；省下的宽度全部回到提示词列', () => {
    expect(NARROW_REFERENCE_COLUMN_WIDTH).toBe(REFERENCE_SLOT_BOX.width)
    expect(referenceColumnWidthOf(false)).toBe(REFERENCE_COLUMN_WIDTH)
    expect(referenceColumnWidthOf(true)).toBe(NARROW_REFERENCE_COLUMN_WIDTH)
    const promptWide = 551 - STORYBOARD_ROW_FIXED_WIDTH
    const promptNarrow = 551 - (STORYBOARD_ROW_FIXED_WIDTH - REFERENCE_COLUMN_WIDTH + NARROW_REFERENCE_COLUMN_WIDTH)
    expect(promptNarrow - promptWide).toBe(REFERENCE_COLUMN_WIDTH - NARROW_REFERENCE_COLUMN_WIDTH)
  })

  it('两档只差参考列那一格，其余列一格不动', () => {
    expect(storyboardRowGridTemplate(false)).toBe(`${ROW_GRIP_WIDTH}px ${FRAME_COLUMN_WIDTH}px ${REFERENCE_COLUMN_WIDTH}px minmax(0,1fr)`)
    expect(storyboardRowGridTemplate(true)).toBe(`${ROW_GRIP_WIDTH}px ${FRAME_COLUMN_WIDTH}px ${NARROW_REFERENCE_COLUMN_WIDTH}px minmax(0,1fr)`)
  })
})

describe('常数与 Tailwind 类名不许各说各的', () => {
  const shell = read('src/workbench/creation/storyboard/shotRow/StoryboardRowShell.tsx')

  /**
   * 间距和内边距今天写在 className 里（`gap-3 pl-1.5 pr-3`），判据却按数字算。
   * 两边分家不会报错，只会让门槛悄悄偏几像素——所以这一条盯着类名。
   */
  it('外壳的 gap / 内边距类名与算判据用的数字对得上', () => {
    expect(shell).toContain('gap-3')
    expect(ROW_COLUMN_GAP).toBe(12)
    expect(shell).toContain('pl-1.5')
    expect(ROW_PADDING_LEFT).toBe(6)
    expect(shell).toContain('pr-3')
    expect(ROW_PADDING_RIGHT).toBe(12)
  })

  it('外壳把档位量在自己身上，并往下发（参考列拿不到外壳的局部变量）', () => {
    expect(shell).toContain('useElementWidth')
    expect(shell).toContain('StoryboardRowNarrowContext.Provider')
    expect(shell).toContain('data-storyboard-row-density')
  })

  it('参考列与锚行的文字格都按档位取列宽，没有第二处写死 211', () => {
    for (const relative of [
      'src/workbench/creation/storyboard/shotRow/ShotReferenceZone.tsx',
      'src/workbench/creation/storyboard/anchorZone/StoryboardAnchorRow.tsx',
    ]) {
      const source = read(relative)
      expect(source).toContain('referenceColumnWidthOf')
      expect(source).not.toMatch(/width:\s*REFERENCE_COLUMN_WIDTH/)
    }
  })
})

describe('Tiptap 占位：官方配方的零高度浮动盒必须配一只撑高盒', () => {
  const classes = read('src/workbench/assets/tiptapPlaceholderClasses.ts')

  it('可见那份仍是官方配方（浮动 + 零高度），插入符留在第 0 列', () => {
    expect(classes).toContain('before:float-left')
    expect(classes).toContain('before:h-0')
    expect(classes).toContain('before:max-w-full')
  })

  /** 少了这只盒，占位折到第 3 行就画到卡外面去（样张成因②）。 */
  it('撑高那份：同一句话、看不见、减掉插入符那条行盒', () => {
    expect(classes).toContain('after:content-[attr(data-placeholder)]')
    expect(classes).toContain('after:invisible')
    expect(classes).toContain('after:[margin-bottom:-1lh]')
  })

  /** 一份规则两个调用方；再抄一份，同一个 bug 就要被发现两次。 */
  it('提示词框与创作编辑器共用这一份，不许各写各的', () => {
    for (const relative of [
      'src/workbench/assets/PromptEditor.tsx',
      'src/workbench/creation/WorkbenchEditor.tsx',
    ]) {
      const source = read(relative)
      expect(source).toContain('TIPTAP_PLACEHOLDER_CLASSES')
      expect(source).not.toContain('is-editor-empty]:before:')
    }
  })
})
