// 临时：证明 CI 上「重试后才过」会出现「疑似不稳定」注解。下一个提交删除。
import { expect, it } from 'vitest'
let attempts = 0
it('flaky demo passes only on the second attempt', () => { attempts += 1; expect(attempts).toBeGreaterThan(1) })
