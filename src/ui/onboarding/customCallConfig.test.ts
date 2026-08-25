import { describe, expect, it } from 'vitest'
import { configPatchFromRows, configRowsFromMaskedEntries, hasCustomConfig } from './customCallConfig'

describe('masked custom-call configuration', () => {
  it('projects only names into empty renderer-side password rows', () => {
    expect(configRowsFromMaskedEntries([
      { name: 'secret_key', hasValue: true },
      { name: 'access_key', hasValue: true },
    ])).toEqual([
      { name: 'access_key', value: '', storedName: 'access_key', valueChanged: false },
      { name: 'secret_key', value: '', storedName: 'secret_key', valueChanged: false },
    ])
    expect(JSON.stringify(configRowsFromMaskedEntries([{ name: 'secret_key', hasValue: true }]))).not.toContain('secret-value')
  })

  it('keeps unchanged ciphertext, supports rename, and sends only replacements as plaintext', () => {
    expect(configPatchFromRows([
      { name: 'renamed_ak', value: '', storedName: 'ak', valueChanged: false },
      { name: 'sk', value: 'new-secret', storedName: 'sk', valueChanged: true },
      { name: 'empty', value: '', valueChanged: true },
    ])).toEqual([
      { name: 'empty', value: '' },
      { name: 'renamed_ak', keepFrom: 'ak' },
      { name: 'sk', value: 'new-secret' },
    ])
  })

  it('drops unnamed rows and lets the last duplicate win', () => {
    expect(configPatchFromRows([
      { name: '', value: 'ignored', valueChanged: true },
      { name: 'token', value: 'first', valueChanged: true },
      { name: ' token ', value: 'second', valueChanged: true },
    ])).toEqual([{ name: 'token', value: 'second' }])
  })

  it('derives whether the section has content from public names only', () => {
    expect(hasCustomConfig([])).toBe(false)
    expect(hasCustomConfig([{ name: 'ak', value: '', storedName: 'ak', valueChanged: false }])).toBe(true)
  })
})
