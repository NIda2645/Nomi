// 第 6 类门岗（语义 token 定义困在作用域）的负向/正向自证：
// 门岗自己必须先证明「真违规抓得到、根层定义不误伤」，否则它只是又一个假绿源。
import { describe, expect, it } from 'vitest'

import {
  isRootAnchoredSelector,
  scanCssText,
  scanScopedTokenDefinitions,
  scanTailwindConfigText,
} from './lib/scopedTokenScan.mjs'

describe('isRootAnchoredSelector', () => {
  it('根元素本身（含属性/伪类后缀）算根层', () => {
    expect(isRootAnchoredSelector(':root')).toBe(true)
    expect(isRootAnchoredSelector(':root[data-mantine-color-scheme="dark"]')).toBe(true)
    expect(isRootAnchoredSelector('html')).toBe(true)
    expect(isRootAnchoredSelector('body')).toBe(true)
  })
  it('后代组合器 = 选中的不是根元素，portal 继承不到 → 不算根层', () => {
    expect(isRootAnchoredSelector(':root[data-mantine-color-scheme="dark"] .workbench-shell')).toBe(false)
    expect(isRootAnchoredSelector('.workbench-shell')).toBe(false)
    expect(isRootAnchoredSelector(':root, .workbench-shell')).toBe(false) // 任一分段困在作用域即整条不算
  })
})

describe('scanCssText', () => {
  it('抓住类作用域下的 --workbench-* 定义（含跨行选择器与暗色后代形态）', () => {
    const css = [
      '.workbench-shell,',
      '.app-ai-chat-dialog.tc-ai-chat {',
      '  --workbench-success: #34c759;',
      '}',
      ':root[data-mantine-color-scheme="dark"] .workbench-shell {',
      '  --workbench-danger: #ff6961',
      '}',
    ].join('\n')
    const found = scanCssText(css)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ token: '--workbench-success', line: 3 }) // 报声明行,不是选择器行
    expect(found[1].token).toBe('--workbench-danger') // 块尾无分号的声明也得抓到
  })

  it(':root 定义、注释里的假定义、非 token 族、var() 消费都不误伤', () => {
    const css = [
      ':root {',
      '  --workbench-success: #34c759;',
      '  --tc-legacy: red;', // 不在两族里,不管
      '}',
      '/* .fake { --workbench-danger: #f00; } */',
      '.consumer { color: var(--workbench-success); --local-knob: 4px; }',
    ].join('\n')
    expect(scanCssText(css)).toHaveLength(0)
  })
})

describe('scanTailwindConfigText', () => {
  it('抓住 addBase 里选择器 key 作用域下的定义，放行 :root 与非选择器对象', () => {
    const config = [
      'const plugin = ({ addBase }) => {',
      '  addBase({',
      "    ':root': {",
      "      '--workbench-success': '#34c759',",
      '    },',
      "    '.workbench-shell': {",
      "      '--workbench-danger': '#ff3b30',",
      '    },',
      "    ':root[data-mantine-color-scheme=\"dark\"]': {",
      "      '--nomi-bg': 'oklch(0.18 0.006 80)',",
      '    },',
      '  })',
      '}',
      'const theme = { colors: { nomi: { bg: "var(--nomi-bg)" } } }',
    ].join('\n')
    const found = scanTailwindConfigText(config)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ token: '--workbench-danger', selector: '.workbench-shell', line: 7 })
  })
})

describe('scanScopedTokenDefinitions', () => {
  it('按扩展名分派并带上文件名', () => {
    const found = scanScopedTokenDefinitions([
      { path: 'src/a.css', content: '.x { --nomi-accent: red; }' },
      { path: 'tailwind.config.ts', content: "addBase({ '.y': {\n'--workbench-ink': 'x',\n} })" },
      { path: 'src/ignored.tsx', content: "style={{ '--workbench-ink': v }}" }, // 内联覆写不扫
    ])
    expect(found.map((f) => `${f.file}:${f.token}`)).toEqual([
      'src/a.css:--nomi-accent',
      'tailwind.config.ts:--workbench-ink',
    ])
  })
})
