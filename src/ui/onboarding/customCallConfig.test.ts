import { describe, expect, it } from 'vitest'
import { configRecordFromRows, configRowsFromRecord, hasCustomConfig } from './customCallConfig'

describe('configRowsFromRecord', () => {
  // 对象的键序不可依赖；不排序的话每次打开弹窗行的顺序都可能变，用户会以为自己改错了。
  it('orders rows by name so the table does not reshuffle between opens', () => {
    expect(configRowsFromRecord({ region: 'cn', api_secret: 's', account: 'a' }).map((r) => r.name)).toEqual([
      'account',
      'api_secret',
      'region',
    ])
  })

  it('tolerates junk instead of throwing', () => {
    expect(configRowsFromRecord(null)).toEqual([])
    expect(configRowsFromRecord('nope')).toEqual([])
    expect(configRowsFromRecord(['a', 'b'])).toEqual([])
  })

  // 用户手填的东西什么类型都可能被写进来（旧版本、导入的包），别让非字符串漏进输入框。
  it('coerces non-string values so the inputs stay editable', () => {
    expect(configRowsFromRecord({ n: 3, ok: true, nul: null })).toEqual([
      { name: 'n', value: '3' },
      { name: 'nul', value: '' },
      { name: 'ok', value: 'true' },
    ])
  })
})

describe('configRecordFromRows', () => {
  // 点了「加一条」还没填就保存是常态 —— 不该因此存下一个空键。
  it('drops rows whose name is still empty', () => {
    expect(configRecordFromRows([{ name: '', value: 'x' }, { name: '  ', value: 'y' }])).toBeUndefined()
  })

  // 有名字没值要保留：有的服务确实要空串，替用户判断等于替他做决定。
  it('keeps a named row even when its value is empty', () => {
    expect(configRecordFromRows([{ name: 'flag', value: '' }])).toEqual({ flag: '' })
  })

  // 肉眼看不见的空格会让脚本里 config.x 取不到 —— 「看起来对却不工作」最难查，所以在入口就 trim。
  it('trims names so an invisible space cannot break config lookups', () => {
    expect(configRecordFromRows([{ name: '  api_secret  ', value: 'sk' }])).toEqual({ api_secret: 'sk' })
  })

  it('lets a later row win on duplicate names, matching object semantics', () => {
    expect(configRecordFromRows([{ name: 'k', value: 'first' }, { name: 'k', value: 'second' }])).toEqual({ k: 'second' })
  })

  // 全空要返回 undefined，好让调用方把 customConfig 整个删掉而不是留个 {} 垃圾。
  it('returns undefined when nothing is worth saving', () => {
    expect(configRecordFromRows([])).toBeUndefined()
    expect(configRecordFromRows([{ name: '', value: '' }])).toBeUndefined()
  })
})

describe('hasCustomConfig', () => {
  it('decides whether the section opens expanded', () => {
    expect(hasCustomConfig([])).toBe(false)
    expect(hasCustomConfig([{ name: '', value: '' }])).toBe(false)
    expect(hasCustomConfig([{ name: 'region', value: '' }])).toBe(true)
  })
})

// 往返不变式：存进去再读出来，语义不能变（值原样、名字 trim 过、空行消失）。
describe('round trip', () => {
  it('survives record → rows → record', () => {
    const original = { api_secret: 'sk-1', region: 'cn-beijing', empty: '' }
    expect(configRecordFromRows(configRowsFromRecord(original))).toEqual(original)
  })
})
