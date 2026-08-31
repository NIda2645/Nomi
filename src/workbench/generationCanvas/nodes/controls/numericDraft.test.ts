import { describe, expect, it } from 'vitest'
import { hasUsableSliderStep, isCompleteNumericDraft } from './numericDraft'

describe('isCompleteNumericDraft', () => {
  it('treats mid-typing fragments as incomplete so they are never written back', () => {
    // 这四个就是「小数打不进去」的现场：回写任何一个都会把输入框重置掉。
    expect(isCompleteNumericDraft('')).toBe(false)
    expect(isCompleteNumericDraft('-')).toBe(false)
    expect(isCompleteNumericDraft('0.')).toBe(false)
    expect(isCompleteNumericDraft('.')).toBe(false)
    expect(isCompleteNumericDraft('1e')).toBe(false)
    expect(isCompleteNumericDraft('1e+')).toBe(false)
  })

  it('accepts every shape a finished number can take', () => {
    expect(isCompleteNumericDraft('0.4')).toBe(true)
    expect(isCompleteNumericDraft('.5')).toBe(true)
    expect(isCompleteNumericDraft('-1')).toBe(true)
    expect(isCompleteNumericDraft('-0.25')).toBe(true)
    expect(isCompleteNumericDraft('0')).toBe(true)
    expect(isCompleteNumericDraft('1e5')).toBe(true)
    expect(isCompleteNumericDraft(' 12 ')).toBe(true)
  })

  it('rejects non-numeric text that Number() would still coerce', () => {
    // Number('') === 0、Number('0x10') === 16——都不能当成用户输完了。
    expect(isCompleteNumericDraft('abc')).toBe(false)
    expect(isCompleteNumericDraft('0x10')).toBe(false)
    expect(isCompleteNumericDraft('Infinity')).toBe(false)
  })
})

describe('hasUsableSliderStep', () => {
  it('keeps the slider for ranges it can actually divide', () => {
    expect(hasUsableSliderStep(1, 10, undefined)).toBe(true) // 时长秒数：默认步长 1 够切
    expect(hasUsableSliderStep(0, 1, 0.1)).toBe(true) // denoise 声明了 0.1 步长
  })

  it('rejects ranges where the default step would leave fewer than two increments', () => {
    // 0–1 不带步长：默认 1 只切得出 0 和 1 两个端点，滑杆等于废掉——必须退回数字框。
    expect(hasUsableSliderStep(0, 1, undefined)).toBe(false)
    expect(hasUsableSliderStep(0, 0, undefined)).toBe(false)
    expect(hasUsableSliderStep(5, 1, undefined)).toBe(false)
  })
})
