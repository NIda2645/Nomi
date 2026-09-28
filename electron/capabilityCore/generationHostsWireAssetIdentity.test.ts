// 「`look_at_media` 给出的 id，`draft_shots` 必须认得」——这条对拍的机器化持有者。
//
// ── 它在解决哪个真实摩擦 ──
//
// 2026-09-22 run2 的 A1：`look_at_media` 刚返回 `{"id":"asset-c7ce766b72152ae3f5de"}`，
// 下一句 `draft_shots` 就说「参考素材 asset-c7ce766b72152ae3f5de **不在这个项目的素材库里**」。
// 两句话都是我们自己发的，必有一句在撒谎。
//
// 撒谎的不是判据，是**接线**：`resolveAssetReferenceIdentity` 这个 dep，`mcpStdioServer`
// （外部 MCP 宿主）一直递，而 `appIntegration`（App 内的 Agent 面板——真实用户唯一走的那条路）
// **没递**。于是 `resolve?.(assetId)` 恒 `undefined`，`draft_shots` 的 `references` 在真机上
// **必定**被拒，一次都没成功过。判据的单测全绿，宿主级别没有任何东西会红
// （与 report-B 项 4「判据写对了，但没人把状态交给它」逐字同形）。
//
// ── 判据为什么扫源码 ──
//
// 要证的是「**每一个**造 planning handler 的宿主都把它递下去」，这是对一组调用点的断言。
// 行为测试只能一个宿主一个宿主证，而漏掉的那个恰恰是没人想起来写测试的那个（R17）。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DEP = 'resolveAssetReferenceIdentity'
const FACTORY = 'createGenerationPlanningHandler('

/** 扫描范围：生产里造 planning handler 的宿主（测试夹具不在内——它们有自己的注入）。 */
const HOST_FILES = [
  'electron/capabilityCore/appIntegration.ts',
  'electron/capabilityCore/mcpStdioServer.ts',
]

/** 从一个文件里取出每个 `createGenerationPlanningHandler({ … })` 的入参正文。 */
function factoryCalls(file: string): readonly string[] {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  const calls: string[] = []
  let from = source.indexOf(FACTORY)
  while (from >= 0) {
    let index = source.indexOf('{', from + FACTORY.length)
    let depth = 0
    const start = index
    while (index < source.length) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') { depth -= 1; if (depth === 0) break }
      index += 1
    }
    calls.push(source.slice(start, index + 1))
    from = source.indexOf(FACTORY, index)
  }
  return calls
}

describe('每个宿主都把素材身份解析器递给生成域', () => {
  // 阳性对照：抓不到任何一个调用点时，下面的断言会「空集通过」。
  it('扫描器真的抓得到那几个调用点', () => {
    for (const file of HOST_FILES) {
      expect(fs.existsSync(path.join(process.cwd(), file)), `${file} 不在盘上`).toBe(true)
      expect(factoryCalls(file).length, `${file} 里一个 ${FACTORY} 都没抓到 = 扫描器坏了`).toBeGreaterThan(0)
    }
  })

  it('一个都不许漏：漏掉的那个宿主上，references 在真机上必定 100% 被拒', () => {
    const missing = HOST_FILES.flatMap((file) => factoryCalls(file)
      .filter((call) => !call.includes(DEP))
      .map(() => file))
    expect(
      missing,
      `这些宿主造了 planning handler 却没递 ${DEP}：`
        + '`resolve?.(assetId)` 会恒 undefined，模型拿着 look_at_media 刚给的 id 也会被告知'
        + '「不在这个项目的素材库里」。递同一个 owner（assets/projectAssetStore 的 resolveProjectAssetReferenceIdentity）。',
    ).toEqual([])
  })

  it('递的是同一个 owner，不是各写一份解析', () => {
    for (const file of HOST_FILES) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source, `${file} 应当用 assets/projectAssetStore 那一份，而不是自己再解析一遍素材库`)
        .toContain('resolveProjectAssetReferenceIdentity')
    }
  })
})
