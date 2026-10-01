// 监视器怎么认「这条提示点名了哪一家供应商」。
//
// 2026-09-30：失败提示点名供应商改用**显示名**（APIMart / 用户起的来源名称），不再写内部 key。监视器认「某某家：失败原因」
// 时原来只认 key——提示一改，它就对所有点名都静默失明：failure-reason-misstated / failure-blamed-on-wrong-vendor 永远报零，
// 不是因为产品对了，是因为它看不见。这里把「显示名 / key 都认、认成 key」钉死，并用真词典里的模板拼出提示文字来喂它。
import { describe, expect, test } from 'vitest'
import { vendorFailedClaim, vendorKeyByLabel } from './monitor.mjs'
import { uiText } from './invariants.mjs'

const catalog = {
  vendors: [
    { key: 'agent-runtime-loopback', name: 'Agent Runtime Loopback' },
    { key: 'agent-runtime-loopback-b', name: 'Agent Runtime Loopback B' },
    { key: 'apimart', name: 'APIMart' },
    { key: 'unnamed-relay' },
  ],
}
const vendors = vendorKeyByLabel(catalog)
const toastText = (locale, vendor, reason, hint) => uiText(locale, 'generationCommon.node.providerFailed')
  .replace('{{vendor}}', vendor).replace('{{reason}}', reason).replace('{{hint}}', hint)

describe('vendorKeyByLabel', () => {
  test('显示名和 key 都认，都认成 key；没有显示名的只认 key', () => {
    expect(vendors.get('APIMart')).toBe('apimart')
    expect(vendors.get('apimart')).toBe('apimart')
    expect(vendors.get('Agent Runtime Loopback')).toBe('agent-runtime-loopback')
    expect(vendors.get('Agent Runtime Loopback B')).toBe('agent-runtime-loopback-b')
    expect(vendors.get('unnamed-relay')).toBe('unnamed-relay')
    expect(vendors.get('随便一句话')).toBeUndefined()
  })
})

describe('vendorFailedClaim', () => {
  for (const locale of ['zh-CN', 'en']) {
    test(`${locale}：提示点名显示名 → 认出是哪一家（key）与原因`, () => {
      const reason = uiText(locale, 'generationCommon.observability.error.input.reason')
      const claim = vendorFailedClaim(toastText(locale, 'Agent Runtime Loopback', reason, 'hint text'), vendors)
      expect(claim).toEqual({ vendor: 'agent-runtime-loopback', reason, textLocale: locale })
    })

    test(`${locale}：旧写法（点名 key）照样认`, () => {
      const claim = vendorFailedClaim(toastText(locale, 'agent-runtime-loopback-b', 'reason text', 'hint text'), vendors)
      expect(claim?.vendor).toBe('agent-runtime-loopback-b')
    })

    test(`${locale}：点名的不是这一场有的家 → 不算点名`, () => {
      expect(vendorFailedClaim(toastText(locale, 'Some Other Gateway', 'reason text', 'hint text'), vendors)).toBeNull()
    })
  }

  test('不是提示的话不会被当成点名', () => {
    expect(vendorFailedClaim('已保存到项目', vendors)).toBeNull()
  })
})
