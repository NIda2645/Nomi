import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRESETS } from 'img-fx'

/**
 * 等待动效（img-fx）编进 GPU 的程序只能含「当前这个预设」的那一种特效。
 *
 * 为什么钉这条：img-fx 0.5.1 原版把 26 种特效塞进同一个着色器、运行时按 u_effect 选，
 * 主函数还为模糊把它调了 5 次。Windows 上 WebGL 走 ANGLE→Direct3D11，驱动编译器会把这些
 * 全部展开：实测（RTX 4060 / Electron 43）编译 100 秒、渲染线程全程卡死，然后 GPU 进程崩溃，
 * 画布报「加载失败」。只留一种特效后同一台机器 0.19 秒，像素逐一相同。
 * 修法是 patches/img-fx@0.5.1.patch（上游 Jakubantalik/img-fx#3 仍未修）。
 * 这条测试守的是**机制**：哪天补丁没打上、或升级回到运行时分派，这里就红。
 */
// 包的 exports 不开放 dist 子路径：从包入口（dist/index.cjs.js）反推 dist 目录，两份构建都查。
const distDir = path.dirname(createRequire(import.meta.url).resolve('img-fx'))
const distFiles = ['index.es.js', 'index.cjs.js'].map((id) => ({ id, source: fs.readFileSync(path.join(distDir, id), 'utf8') }))

function fragmentShaderOf(source: string): string {
  const marker = source.indexOf('vec3 computeEffect(')
  expect(marker, 'img-fx 的片元着色器里应有 computeEffect').toBeGreaterThan(0)
  const open = source.lastIndexOf('`', marker)
  const close = source.indexOf('`', marker)
  return source.slice(open + 1, close)
}

/** 编译期特效链里每个分支的编号，按出现顺序。 */
function compiledEffectIds(shader: string): number[] {
  return [...shader.matchAll(/^\s*#(?:if|elif) IMG_FX_EFFECT == (\d+)\s*$/gm)].map((match) => Number(match[1]))
}

describe('img-fx waiting effect GPU program', () => {
  for (const { id, source } of distFiles) {
    it(`${id}: no runtime effect dispatch is shipped to the GPU`, () => {
      const shader = fragmentShaderOf(source)
      expect(shader).not.toMatch(/u_effect\s*==/)
      // 一条 #if/#elif 链、编号不重复：按 GLSL 预处理规则，每个程序只留下一个特效分支。
      const ids = compiledEffectIds(shader)
      expect(ids.length).toBe(26)
      expect(new Set(ids).size).toBe(ids.length)
      expect(shader.match(/^\s*#endif\s*$/gm)?.length).toBe(1)
    })

    it(`${id}: the shared material compiles one program per preset effect`, () => {
      expect(source).toMatch(/defines:\s*\{\s*IMG_FX_EFFECT:\s*-1\s*\}/)
      // 每次按预设写 uniform 时同步编译期常量，并让 three 换用（或首编）对应的程序。
      expect(source).toMatch(/\.material\.defines\.IMG_FX_EFFECT\s*!==\s*a\.effectIndex\s*&&\s*\(\s*e\.material\.defines\.IMG_FX_EFFECT\s*=\s*a\.effectIndex,\s*e\.material\.needsUpdate\s*=\s*!0\s*\)/)
    })
  }

  it('every bundled preset mode has its own compile-time branch', () => {
    const ids = new Set(compiledEffectIds(fragmentShaderOf(distFiles[0].source)))
    const modes = Object.values(PRESETS).flatMap((preset) => Object.values(preset.modes).map((mode) => ({ label: `${preset.name}/${mode.theme}`, effect: mode.effectIndex })))
    expect(modes.length).toBeGreaterThan(0)
    for (const { label, effect } of modes) expect(ids.has(effect), `${label} 用的 effect ${effect} 没有编译期分支`).toBe(true)
  })
})
