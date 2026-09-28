import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOMI_TIPTAP_EDITOR_OPTIONS } from './useNomiRichTextEditor'

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

describe('TipTap React lifecycle contract', () => {
  it('keeps the React adapter in client mode without transaction-driven remounts', () => {
    expect(NOMI_TIPTAP_EDITOR_OPTIONS).toEqual({
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
    })
  })

  it('applies the same lifecycle boundary to the canvas prompt and rich-text hook', () => {
    const promptEditor = source('src/workbench/assets/PromptEditor.tsx')
    const richTextHook = source('src/workbench/common/useNomiRichTextEditor.ts')
    expect(promptEditor).toContain('...NOMI_TIPTAP_EDITOR_OPTIONS')
    expect(richTextHook).toContain('...NOMI_TIPTAP_EDITOR_OPTIONS')
    expect(richTextHook).toContain('const extensions = React.useMemo')
    expect(richTextHook).toContain('const editorProps = React.useMemo')
  })
})
