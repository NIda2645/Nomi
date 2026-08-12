// 回归钉：助手模型选择器必须按 (vendorKey, modelKey) 两段身份认模型。
// 用户 2026-08-12 反馈「右侧 agent 显示的模型不是真实模型」——同一个 modelKey 挂在多个供应商下时，
// 只认 modelKey 会显示成第一条、选中还会绑到另一个供应商去。
import { describe, expect, it } from 'vitest'

import { decodeModelIdentity, encodeModelIdentity, labelForModel } from './assistantModelIdentity'

describe('模型身份编解码', () => {
  it('两段身份可逆', () => {
    for (const identity of [
      { vendorKey: 'apimart', modelKey: 'gpt-5.2' },
      { vendorKey: 'code-newcli-com', modelKey: 'anthropic/claude-opus-4.8' },
      { vendorKey: 'http://127.0.0.1:8188', modelKey: 'a/b c?d=1&e' },
    ]) {
      expect(decodeModelIdentity(encodeModelIdentity(identity))).toEqual(identity)
    }
  })

  it('同名模型在不同供应商下编出的值必须不同（否则下拉里重复 value 就会张冠李戴）', () => {
    const a = encodeModelIdentity({ vendorKey: 'apimart', modelKey: 'gpt-5.2' })
    const b = encodeModelIdentity({ vendorKey: 'my-relay', modelKey: 'gpt-5.2' })
    expect(a).not.toBe(b)
  })

  it('残缺值解不出来就给 null，不猜', () => {
    expect(decodeModelIdentity('')).toBeNull()
    expect(decodeModelIdentity('gpt-5.2')).toBeNull()
  })
})

describe('标签消歧', () => {
  const apimart = { vendorKey: 'apimart', modelKey: 'gpt-5.2', labelZh: 'GPT-5.2' }
  const relay = { vendorKey: 'my-relay', modelKey: 'gpt-5.2', labelZh: 'GPT-5.2' }
  const solo = { vendorKey: 'apimart', modelKey: 'deepseek-v4', labelZh: 'DeepSeek V4' }
  const names = { apimart: 'APIMart', 'my-relay': '我的中转' }

  it('只接一家时不缀供应商名（凭空多出「· 某某」是噪音）', () => {
    expect(labelForModel(solo, [solo], names)).toBe('DeepSeek V4')
  })

  it('同名模型来自多家时缀上供应商名，让用户分得清', () => {
    const all = [apimart, relay, solo]
    expect(labelForModel(apimart, all, names)).toBe('GPT-5.2 · APIMart')
    expect(labelForModel(relay, all, names)).toBe('GPT-5.2 · 我的中转')
  })

  it('取不到供应商名时退回 key，不显示空白', () => {
    expect(labelForModel(relay, [apimart, relay], {})).toBe('GPT-5.2 · my-relay')
  })
})
