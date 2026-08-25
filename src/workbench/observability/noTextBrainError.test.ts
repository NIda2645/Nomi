import { describe, it, expect } from 'vitest'
import { classifyGenerationError } from './classifyError'

/**
 * F5 回归（2026-08-25「预算焦虑短剧创作者」走查）：拆镜头缺文本大脑时，agentChatV2 抛的错
 * **不得**原样把英文散句甩给用户。旧现场：错误串「No local text model is configured…」字面是
 * "is configured"，classifyError 的 model-config 分支只认 "not configured" → 落 unknown →
 * extractReadableErrorLine 把英文原串当 reason 回吐（用户看到「服务器：拆镜头失败：No local text
 * model is configured. Open model settings and add an API key.」半中半英）。
 *
 * 修法两层：① agentChatV2 把 throw 改成带稳定签名的 "Model is not configured: no usable text model"；
 * ② classifyError 加 no-usable/no-local-text-model 签名 → 归 model-config，reason/hint 走 narrate 词表。
 * 这里锁住新旧两种措辞都进 model-config、且 reason 是中文人话、不含英文原串。
 */
describe('classifyGenerationError — 缺文本大脑（no usable text model）', () => {
  const CODED = 'Model is not configured: no usable text model. Open model settings and add an API key.'
  const LEGACY = 'No local text model is configured. Open model settings and add an API key.'
  // 真机里 CreationAiPanel 曾把它再包一层中文前缀——即使带前缀也要认出来（includes 判据）。
  const WRAPPED = `拆镜头失败：${LEGACY}`

  for (const [label, raw] of [
    ['新的 code 化签名', CODED],
    ['存量英文散句', LEGACY],
    ['被中文前缀包过一层', WRAPPED],
  ] as const) {
    it(`${label} → 归 model-config`, () => {
      expect(classifyGenerationError(raw).kind).toBe('model-config')
    })

    it(`${label} → reason 是人话、不原样甩英文串`, () => {
      const report = classifyGenerationError(raw)
      // 人话 reason（中文词表「模型未配置」），不是英文散句。
      expect(report.reason).not.toContain('No local text model')
      expect(report.reason).not.toContain('Open model settings')
      expect(report.reason.length).toBeGreaterThan(0)
      // 命中 model-config 后，reason 出自 narrate（中文环境下是「模型未配置」）。
      expect(report.reason).toContain('模型未配置')
    })

    it(`${label} → 不把内部信号栽赃成「服务商原话」`, () => {
      // 这条错误里服务商根本没被请求到，providerMessage 不该出现英文散句。
      const pm = classifyGenerationError(raw).providerMessage
      if (pm) {
        expect(pm).not.toContain('No local text model')
        expect(pm).not.toContain('Open model settings')
      }
    })
  }
})
