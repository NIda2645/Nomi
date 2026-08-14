import { describe, expect, it } from 'vitest'
import { normalizeComfyuiAddressInput } from './comfyuiAddress'

describe('normalizeComfyuiAddressInput', () => {
  it('defaults empty input and adds http to a bare host while preserving proxy paths', () => {
    expect(normalizeComfyuiAddressInput('')).toBe('http://127.0.0.1:8188')
    expect(normalizeComfyuiAddressInput(' 192.168.1.9:8188/comfy/ ')).toBe('http://192.168.1.9:8188/comfy')
    expect(normalizeComfyuiAddressInput('https://example.com/comfy/')).toBe('https://example.com/comfy')
  })
})
