// 断言层自己的契约测试。
//
// 这里钉的不是「helper 能跑」，而是**它必须拦得住那种写法**：
// `expectAbsent` 没有 provenBy 就得当场抛错。这条一旦松了，整套加固就退回成一句口号——
// 因为「没有基线的『没看到』」正是本仓 94% 的「不存在」断言在犯的错，也是我两天内栽的两次。
import { describe, expect, it } from 'vitest'
import { expectAbsent, proveProbe, stripCommentsAndStrings } from './_assert.mjs'

/** 假 locator：这些测试只验签名契约，不碰真浏览器。 */
const fakeLocator = { toString: () => 'locator(fake)' }

describe('expectAbsent 强制要基线', () => {
  it('不给 provenBy → 抛错（而不是默默通过）', async () => {
    await expect(expectAbsent(fakeLocator)).rejects.toThrow(/需要 provenBy/)
  })

  it('给个随手编的对象也不认 —— 必须是 proveProbe 真跑出来的证明', async () => {
    // 关键：不能让人用 `{ provenBy: true }` 之类糊过去，那等于把门开回原样。
    await expect(expectAbsent(fakeLocator, { provenBy: true })).rejects.toThrow(/需要 provenBy/)
    await expect(expectAbsent(fakeLocator, { provenBy: { label: '我说有就有' } })).rejects.toThrow(/需要 provenBy/)
  })

  it('报错信息要给出可照抄的正确写法（不是只骂一句「缺参数」）', async () => {
    const error = await expectAbsent(fakeLocator).catch((e) => e)
    expect(error.message).toContain('proveProbe')
    expect(error.message).toContain('provenBy: proof')
    // 还要讲清「为什么」，不然下一个人只会照着补个参数、不理解拦的是什么。
    expect(error.message).toContain('空洞的通过')
  })
})

describe('proveProbe 要求说人话的 label', () => {
  it('不给 label → 抛错：失败信息里没有人话，等于让人对着 selector 猜', async () => {
    await expect(proveProbe(fakeLocator)).rejects.toThrow(/label 必填/)
    await expect(proveProbe(fakeLocator, '')).rejects.toThrow(/label 必填/)
  })
})

describe('stripCommentsAndStrings', () => {
  // 结构测试扫源码找违禁串时不剥注释，会**反噬文档**：
  // 我本轮就被自己写的、专门记录该 bug 的注释打红过（注释里出现 'assets' → 命中「禁止硬编码模式名」）。
  it('剥掉行注释和块注释，只留代码', () => {
    const source = [
      "// 旧代码硬编码了 onModeChange('assets')，这行是注释不该被扫到",
      '/* 块注释里也提到 assets */',
      "const real = 'story'",
    ].join('\n')
    const stripped = stripCommentsAndStrings(source)
    expect(stripped).not.toContain('assets')
    expect(stripped).toContain("'story'")
  })
})
