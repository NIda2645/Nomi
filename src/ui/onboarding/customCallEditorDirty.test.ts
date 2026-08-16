import { describe, expect, it } from 'vitest'
import { customCallPersistedStateSignature } from './customCallEditorDirty'

const initialScripts = {
  fallback: "return 'fallback'",
  modes: {
    references: "return 'references'",
    frames: "return 'frames'",
  },
}

describe('custom-call editor persisted dirty state', () => {
  const initial = customCallPersistedStateSignature(initialScripts, [
    { name: 'region', value: 'cn' },
    { name: 'token', value: 'saved' },
  ])

  it('stays clean when scripts and effective config still match the saved values', () => {
    expect(customCallPersistedStateSignature({
      fallback: initialScripts.fallback,
      modes: { frames: initialScripts.modes.frames, references: initialScripts.modes.references, empty: '   ' },
    }, [
      { name: 'token', value: 'saved' },
      { name: '', value: 'ignored draft row' },
      { name: 'region', value: 'cn' },
    ])).toBe(initial)
  })

  it.each([
    ['fallback', { ...initialScripts, fallback: "return 'changed'" }],
    ['an unselected mode', {
      ...initialScripts,
      modes: { ...initialScripts.modes, frames: "return 'changed frames'" },
    }],
    ['a removed saved mode', {
      ...initialScripts,
      modes: { ...initialScripts.modes, frames: '' },
    }],
  ])('detects a change in %s', (_label, scripts) => {
    expect(customCallPersistedStateSignature(scripts, [
      { name: 'region', value: 'cn' },
      { name: 'token', value: 'saved' },
    ])).not.toBe(initial)
  })

  it('detects effective config changes but ignores editor-only material and test state', () => {
    const changed = customCallPersistedStateSignature(initialScripts, [
      { name: 'region', value: 'us' },
      { name: 'token', value: 'saved' },
    ])

    expect(changed).not.toBe(initial)
    // Material and test results are intentionally absent from the helper contract.
    expect(customCallPersistedStateSignature(initialScripts, [
      { name: 'region', value: 'cn' },
      { name: 'token', value: 'saved' },
    ])).toBe(initial)
  })
})
