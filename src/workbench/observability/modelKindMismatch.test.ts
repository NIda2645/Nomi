import { describe, it, expect } from 'vitest'
import { classifyGenerationError } from './classifyError'

/**
 * 「类型登记错了」这一类的分类回归（2026-08-11）。
 *
 * 旧行为：electron 把这种情形也抛成 `Model is not enabled`，分类成 model-config，用户读到
 * 「模型未配置 / 请去模型接入页设置」——那句话是**假的**（模型明明启用着），而且指了条死路
 * （去那页只会看到一切正常）。这里锁住三件事：分对类、说出两个 kind、带出可执行的修复目标。
 */
describe('classifyGenerationError — model-kind-mismatch', () => {
  const raw = 'Model kind mismatch: seedream-4-0 (registered=text, requested=image)'

  it('分成独立一类，不再冒充「模型未配置」', () => {
    expect(classifyGenerationError(raw).kind).toBe('model-kind-mismatch')
  })

  it('抽出三个事实交给 UI（不让 UI 去正则文案）', () => {
    expect(classifyGenerationError(raw).modelKindFix).toEqual({
      modelKey: 'seedream-4-0',
      registered: 'text',
      requested: 'image',
    })
  })

  it('文案点名说清「登记成什么 / 这里要什么」', () => {
    const hint = classifyGenerationError(raw).hint
    expect(hint).toContain('seedream-4-0')
    expect(hint).toContain('文本')
    expect(hint).toContain('图像')
  })

  it('主动作是「一键改对」，次动作不是重试（不改就重试是确定性再撞）', () => {
    const report = classifyGenerationError(raw)
    expect(report.primary).toBe('fix-model-kind')
    expect(report.secondary).not.toBe('retry')
  })

  it('不把我们自己的内部信号栽赃成「服务商原话」', () => {
    // 那个框写着「服务商说：」——这条错误里服务商根本没被请求到，贴上去是纯栽赃。
    expect(classifyGenerationError(raw).providerMessage).toBeUndefined()
  })

  it('真·停用 / 真·退役 仍各归各类（三分没有互相吞掉）', () => {
    expect(classifyGenerationError('Model is not enabled: x').kind).toBe('model-config')
    expect(classifyGenerationError('Model is retired: x').kind).toBe('model-retired')
  })
})
