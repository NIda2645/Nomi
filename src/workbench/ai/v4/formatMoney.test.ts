import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatMoney'

describe('金额按货币码出符号，不把货币码印给人看', () => {
  // 四格：CNY / USD × zh / en。用户在付钱的那颗按钮上读到的就是这个字符串。
  it.each([
    ['zh-CN', 'CNY', 0.3, '¥0.30'],
    ['en', 'CNY', 0.3, '¥0.30'],
    ['zh-CN', 'USD', 0.3, '$0.30'],
    ['en', 'USD', 0.3, '$0.30'],
  ])('%s · %s → %s', (locale, currency, amount, expected) => {
    expect(formatMoney(locale, currency, amount)).toBe(expected)
  })

  it('英文环境下 CNY 是窄符号 ¥，不是 CN¥', () => {
    expect(formatMoney('en', 'CNY', 1.2)).not.toContain('CN')
  })

  it('小数位跟着货币自己的规矩走（JPY 没有小数），不手写 toFixed(2)', () => {
    expect(formatMoney('en', 'JPY', 120)).toBe('¥120')
  })

  it('货币码不合法：退回「码 + 两位小数」，不抛——一次格式化失败不许把整张付费卡渲成空白', () => {
    expect(formatMoney('zh-CN', 'NOT-A-CODE', 0.3)).toBe('NOT-A-CODE 0.30')
    expect(formatMoney('zh-CN', '', 0.3)).toBe(' 0.30')
  })
})
