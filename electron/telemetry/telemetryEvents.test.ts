import { describe, expect, it } from 'vitest'
import { buildTelemetryEnvelope, durationBucket, isTelemetryEnvelope, isTelemetryProps, toolCallBucket } from './telemetryEvents'

describe('telemetry event contract', () => {
  it('uses fixed enums and rejects free text or extra fields', () => {
    expect(isTelemetryProps({ featureId: 'generation', result: 'success' }, 'feature.used')).toBe(true)
    expect(isTelemetryProps({ featureId: 'generation', result: 'success', prompt: 'secret' }, 'feature.used')).toBe(false)
    expect(isTelemetryProps({ featureId: 'unknown', result: 'success' }, 'feature.used')).toBe(false)
  })

  it('bucketizes durations and validates the complete envelope', () => {
    expect(durationBucket(0)).toBe('<1s')
    expect(durationBucket(5000)).toBe('1-5s')
    const envelope = buildTelemetryEnvelope({ eventName: 'generation.completed', props: { capability: 'image', durationBucket: '<1s', result: 'success', attemptCountBucket: '1' } }, 'short-session', '1.2.3')
    expect(isTelemetryEnvelope(envelope)).toBe(true)
    expect(isTelemetryEnvelope({ ...envelope, props: { ...envelope.props, prompt: 'secret' } })).toBe(false)
  })

  it('Agent 回合成不成功可以上报，但模型身份只到「种类」', () => {
    expect(isTelemetryProps({ result: 'failure', toolCallBucket: '1-3', modelClass: 'custom' }, 'agent.turn.completed')).toBe(true)
    // 模型 id / 供应商 key 不许当 props：自建中转的 key 由用户自己的 base-url 派生。
    expect(isTelemetryProps({ result: 'failure', toolCallBucket: '1-3', modelClass: 'my-proxy-corp-local' }, 'agent.turn.completed')).toBe(false)
    expect(isTelemetryProps({ result: 'failure', toolCallBucket: '1-3', modelClass: 'custom', model: 'gpt-5.5' }, 'agent.turn.completed')).toBe(false)
    // 工具调用次数只分桶：原数在小样本上就是指纹。
    expect(isTelemetryProps({ result: 'success', toolCallBucket: '7', modelClass: 'builtin' }, 'agent.turn.completed')).toBe(false)
    expect([toolCallBucket(0), toolCallBucket(3), toolCallBucket(4), toolCallBucket(Number.NaN)]).toEqual(['0', '1-3', '4+', '0'])
    const envelope = buildTelemetryEnvelope({ eventName: 'agent.turn.completed', props: { result: 'success', toolCallBucket: '4+', modelClass: 'local' } }, 'short-session', '0.22.0')
    expect(isTelemetryEnvelope(envelope)).toBe(true)
  })

  it('Agent 也是一个可上报的功能面（功能用了哪些）', () => {
    expect(isTelemetryProps({ featureId: 'agent', result: 'success' }, 'feature.used')).toBe(true)
  })
})
