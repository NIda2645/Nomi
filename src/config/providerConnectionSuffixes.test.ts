/**
 * 「同一家的多条连接才改用连接名」——只在重名时换，不重名一个字都不动（R2，issue #831）。
 * 这里只测「哪几个 provider 该换」；换成什么字由 `modelProviderLabel` 渲染。
 */
import { describe, expect, it } from 'vitest'
import { providerConnectionSuffixes, type ModelProviderRef } from './modelIdentity'

const ref = (vendor: string, vendorName: string): ModelProviderRef => ({
  vendor,
  modelKey: 'seedance-2.0',
  modelAlias: null,
  option: { value: `${vendor}:seedance-2.0`, label: 'Seedance 2.0', vendor, vendorName } as ModelProviderRef['option'],
})

describe('providerConnectionSuffixes', () => {
  it('只有一家 → 不进表（不改标签）', () => {
    expect(providerConnectionSuffixes([ref('apimart', 'APIMart')]).size).toBe(0)
  })

  it('两家不同 root（APIMart vs Kie）→ 不进表（厂商名本来就分得开）', () => {
    const map = providerConnectionSuffixes([ref('apimart', 'APIMart'), ref('kie', 'Kie.ai')])
    expect(map.size).toBe(0)
  })

  it('同一家的两条连接 → 各自拿自己的连接名', () => {
    const map = providerConnectionSuffixes([
      ref('apimart', '满血组'),
      ref('apimart--mini', 'Mini 特价组'),
    ])
    expect(map.get('apimart')).toBe('满血组')
    expect(map.get('apimart--mini')).toBe('Mini 特价组')
  })

  it('三条连接全部进表；另一家仍然不进', () => {
    const map = providerConnectionSuffixes([
      ref('apimart', '满血组'),
      ref('apimart--mini', 'Mini'),
      ref('apimart--fast', 'Fast'),
      ref('kie', 'Kie.ai'),
    ])
    expect([...map.keys()].sort()).toEqual(['apimart', 'apimart--fast', 'apimart--mini'])
    expect(map.has('kie')).toBe(false)
  })

  it('没有连接名的那条不进表（宁可不说，也不说半句）', () => {
    const map = providerConnectionSuffixes([ref('apimart', '满血组'), ref('apimart--mini', '  ')])
    expect(map.get('apimart')).toBe('满血组')
    expect(map.has('apimart--mini')).toBe(false)
  })
})
