import { describe, expect, it, vi } from 'vitest'

import Reporter from './vitest-flaky-reporter.mjs'

const module = (tests) => ({ relativeModuleId: 'src/a.test.ts', children: { allTests: () => tests } })
const test = (diagnostic, name = 'suite > case, with: chars') => ({ fullName: name, location: { line: 7 }, diagnostic: () => diagnostic })

function run(modules) {
  const out = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { out.push(String(chunk)); return true })
  try { new Reporter().onTestRunEnd(modules) } finally { spy.mockRestore() }
  return out.join('')
}

describe('疑似不稳定注解', () => {
  it('重试后才过的 → 一条 warning，带文件、行号、测试名', () => {
    const text = run([module([test({ flaky: true, retryCount: 1 })])])
    expect(text).toContain('::warning file=src/a.test.ts,line=7,title=疑似不稳定::suite > case, with: chars（重试 1 次后才通过）')
  })
  it('稳定的、一次就过的、没有 diagnostic 的 → 不出注解', () => {
    expect(run([module([test({ flaky: false, retryCount: 0 }), test(undefined)])])).toBe('')
  })
})
