import { describe, expect, it } from 'vitest'
import {
  FLAT_OPTION_LIMIT,
  localizeAutoOption,
  parameterOptionLayout,
  resolveParameterOptionPurpose,
  soloOptionControl,
} from './parameterOptionPresentation'
import type { DynamicModelControl } from './controls/parameterControlModel'

describe('localizeAutoOption', () => {
  it('localizes the visible label without changing the internal auto value', () => {
    expect(localizeAutoOption('auto', 'auto', '自动')).toEqual({
      value: 'auto',
      text: '自动',
      isAuto: true,
    })
  })

  it('recognizes an auto label even when the value comes from another binding', () => {
    expect(localizeAutoOption('adaptive', 'Auto', '自动')).toEqual({
      value: 'adaptive',
      text: '自动',
      isAuto: true,
    })
  })

  it('uses the English translation and leaves numeric ratios untouched', () => {
    expect(localizeAutoOption('auto', 'auto', 'Auto').text).toBe('Auto')
    expect(localizeAutoOption('16:9', '16:9', '自动')).toEqual({
      value: '16:9',
      text: '16:9',
      isAuto: false,
    })
  })
})

describe('parameterOptionLayout', () => {
  const options = (...text: string[]) => text.map((label) => ({ value: label, text: label }))

  // 2026-09-14：普通枚举一律按内容宽换行。**不再按标签长度分两种摆法**——
  // 那条判据正是「7 个 1024x1024 各占一整行、每行大半空白」的来源（用户退回单参数直出那一格）。
  it('lays generic option groups out at content width, short labels included', () => {
    expect(parameterOptionLayout(options('1K', '2K', '4K'))).toBe('chips-wrap')
    expect(parameterOptionLayout(options('720p'))).toBe('chips-wrap')
    expect(parameterOptionLayout(options('自动', '16:9', '9:16', '1:1', '4:3', '3:4'))).toBe('chips-wrap')
  })

  // 长标签走的是同一条路：宽度由内容派生，一行放得下就一行，放不下按内容换行。
  it.each([
    ['1024x1024', '1536x1024', '1024x1536', '2048x2048'],
    ['model.safetensors', 'second.safetensors'],
    ['模型名称非常长而且没有空格', '另一个模型'],
    ['LTX\\ltx-2.3\\model.safetensors', 'MiniMax/H3/model.safetensors'],
  ])('wraps long labels by content instead of giving each one a full row: %j', (...labels) => {
    expect(parameterOptionLayout(options(...labels))).toBe('chips-wrap')
  })

  // 超过一屏（8 项）才给搜索框；**列表本身默认就展开**，搜索是用来缩短它的，不是用来藏起它的。
  it('switches to a searchable list only past the flat limit', () => {
    expect(parameterOptionLayout(options(...Array.from({ length: FLAT_OPTION_LIMIT }, (_, i) => `o${i}`)))).toBe('chips-wrap')
    expect(parameterOptionLayout(options(...Array.from({ length: FLAT_OPTION_LIMIT + 1 }, (_, i) => `o${i}`)))).toBe('searchable-list')
    expect(parameterOptionLayout(options(...Array.from({ length: 25 }, (_, i) => `opt${i}`)))).toBe('searchable-list')
  })

  it('uses visible labels, not opaque wire values, to decide layout', () => {
    const entries = [{ value: 'very-long-internal-provider-value', text: '1K' }]
    expect(parameterOptionLayout(entries)).toBe('chips-wrap')
  })

  it('keeps semantic aspect ratios explicit even when the model declares fifteen choices', () => {
    const ratios = options('auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '9:21', '2:1', '1:2', '3:1')
    expect(resolveParameterOptionPurpose(ratios)).toBe('aspect-ratio')
    expect(parameterOptionLayout(ratios, 'aspect-ratio')).toBe('chips-row')
  })

  it('recognizes ratio labels even when wire values are pixel buckets', () => {
    const pixelBuckets = [
      { value: '1024x1024', text: '1:1' },
      { value: '1536x1024', text: '3:2' },
      { value: '1024x1536', text: '2:3' },
    ]
    expect(resolveParameterOptionPurpose(pixelBuckets)).toBe('aspect-ratio')
  })

  it('keeps supplier selection explicit instead of changing with label length', () => {
    const providers = options('Kie', 'APIMart', 'A user-defined relay with a long name')
    expect(parameterOptionLayout(providers, 'provider')).toBe('chips-row')
  })

  it('does not mistake a generic automatic resolution group for aspect ratios', () => {
    expect(resolveParameterOptionPurpose(options('auto', '1K', '2K', '4K'))).toBe('generic')
  })
})

describe('soloOptionControl', () => {
  const size: DynamicModelControl = {
    key: 'size', label: '尺寸', type: 'select', binding: 'parameter',
    options: [{ value: '1024x1024', label: '1024x1024' }, { value: '1536x1024', label: '1536x1024' }],
    defaultValue: '1024x1024',
  }
  const duration: DynamicModelControl = {
    key: 'duration', label: '时长', type: 'number', binding: 'parameter', options: [], min: 4, max: 8, defaultValue: 5,
  }
  const base = { hasProvider: false, hasModeChoices: false, chipsMode: false }

  it('只有一个带候选项的参数时，pill 直接出它的选项（不套面板壳）', () => {
    expect(soloOptionControl({ ...base, controls: [size] })).toBe(size)
  })

  it('面板里还有别的东西就退回面板：第二个参数 / 供应商 / 生成方式 / chips 摆法', () => {
    expect(soloOptionControl({ ...base, controls: [size, duration] })).toBeNull()
    expect(soloOptionControl({ ...base, controls: [size], hasProvider: true })).toBeNull()
    expect(soloOptionControl({ ...base, controls: [size], hasModeChoices: true })).toBeNull()
    expect(soloOptionControl({ ...base, controls: [size], chipsMode: true })).toBeNull()
  })

  it('没有候选项的控件（滑杆/数字框/开关）不走直出：脱了小标题读不出它在调什么', () => {
    expect(soloOptionControl({ ...base, controls: [duration] })).toBeNull()
    expect(soloOptionControl({ ...base, controls: [] })).toBeNull()
  })
})
