// 「重试后才过」的测试 → PR 检查结果里的 warning 注解（标题「疑似不稳定」，带文件和测试名）。
// 为什么要它：vitest 4.1 自带的 github-actions reporter 只把 flaky 写进 Job Summary，不出注解；
// 读 PR 检查注解（gh api .../check-runs/<id>/annotations）的人看不到。判据一行没自己写——
// flaky 就是 vitest 自己的 TestCase.diagnostic().flaky，这里只把它换成一条 workflow command。
const escapeProperty = (text) => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C')
const escapeData = (text) => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

export default class FlakyAnnotationReporter {
  onTestRunEnd(testModules) {
    for (const module of testModules) {
      for (const test of module.children.allTests()) {
        const diagnostic = test.diagnostic()
        if (!diagnostic?.flaky) continue
        const line = test.location?.line
        process.stdout.write(`\n::warning file=${escapeProperty(module.relativeModuleId)}${line ? `,line=${line}` : ''},title=${escapeProperty('疑似不稳定')}::${escapeData(`${test.fullName}（重试 ${diagnostic.retryCount} 次后才通过）`)}\n`)
      }
    }
  }
}
