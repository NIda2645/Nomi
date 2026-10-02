import { describe, expect, it } from 'vitest'
import { resources } from '../../i18n/resources'
import { ERROR_KEY_BY_KIND, NEVER_SENT_KINDS } from './narrate'

/**
 * 「不扣费」这一族的话只有一个出处资格：Nomi 自己确知请求没发出去（NEVER_SENT_KINDS）。
 *
 * 2026-09-30：模型已下线那条错误卡写着「这次失败不计费 / This failure is not billed」——证据只有 apimart 一家回的
 * `credits_cost: 0`，中转站计不计费 Nomi 不知道。请求发出去之后（被服务商拒绝、结果已送达读不出来、下载被拦……）
 * 花没花钱它不知道，任何一条文案都不许替它说；请求根本没出门的那几类（出站策略拦下、素材上传失败、素材本机检查不过）
 * 是 Nomi 自己确知的，照说。
 *
 * 这里不逐个类别抽样，而是把目录（generationCommon.observability.error）里的**每一条字符串**读出来，两种语言各一遍：
 * 以后任何人往目录里加一句，都要过这一关。
 */
const NO_CHARGE_CLAIM = /不计费|未计费|不扣费|没有扣费|没扣费|未扣费|不扣额度|没花钱|没有花钱|不花钱|不收费|not billed|not charged|no charge|nothing was charged|wasn['’]t charged|was not charged|without charge|never billed|no cost/i

type Leaf = { path: string; text: string }
function leaves(node: unknown, path: string[] = []): Leaf[] {
  if (typeof node === 'string') return [{ path: path.join('.'), text: node }]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, [...path, key]))
}

const catalog = (language: 'zh-CN' | 'en') => resources[language].translation.generationCommon.observability.error
const neverSentKeys = new Set(NEVER_SENT_KINDS.map((kind) => ERROR_KEY_BY_KIND[kind]))

describe('失败文案目录里的「不扣费」断言', () => {
  it.each(['zh-CN', 'en'] as const)('%s：探针活着——请求没出门的那几类确实说了，这条判据看得见它', (language) => {
    const said = NEVER_SENT_KINDS.filter((kind) => leaves(catalog(language)[ERROR_KEY_BY_KIND[kind] as keyof ReturnType<typeof catalog>]).some((leaf) => NO_CHARGE_CLAIM.test(leaf.text)))
    // 至少出站策略那两类一定说（它们的整个意义就是「没发出去、没扣费」）；判据若连它们都看不见，下面的「没有」就是空话。
    expect(said).toEqual(expect.arrayContaining(['outbound-blocked-submit', 'outbound-blocked-credential-origin']))
  })

  it.each(['zh-CN', 'en'] as const)('%s：请求可能已经发出去的类别，一条字符串都不说「不扣费」（花没花钱 Nomi 不知道）', (language) => {
    const offenders = leaves(catalog(language))
      .filter((leaf) => !neverSentKeys.has(leaf.path.split('.')[0]))
      .filter((leaf) => NO_CHARGE_CLAIM.test(leaf.text))
      .map((leaf) => `${leaf.path}: ${leaf.text.slice(0, 80)}`)
    expect(offenders).toEqual([])
  })

  it('NEVER_SENT_KINDS 里的每一类都有目录词条（改了类别名不会悄悄失效）', () => {
    for (const kind of NEVER_SENT_KINDS) expect(ERROR_KEY_BY_KIND[kind], kind).toBeTruthy()
  })
})
