import { describe, expect, it } from 'vitest'
import { filterPrompts, promptSourceOptions, PROMPT_SOURCE_ALL, type LibraryPrompt } from './promptLibraryApi'

const prompt = (overrides: Partial<LibraryPrompt>): LibraryPrompt => ({
  id: 'p',
  title: 'Untitled',
  prompt: 'A cinematic shot',
  mediaUrl: '',
  mediaType: 'image',
  promptType: 'image',
  tags: [],
  source: 'Nomi',
  sourceId: 'nomi',
  sourceUrl: '',
  origin: 'public',
  ...overrides,
})
describe('filterPrompts', () => {
  it('uses existing tags as searchable fields without changing type filtering', () => {
    const items = [
      prompt({ id: 'portrait', title: 'Portrait', tags: ['character', 'close-up'] }),
      prompt({ id: 'motion', title: 'Motion', promptType: 'video', mediaType: 'video', tags: ['camera'] }),
    ]
    expect(filterPrompts(items, 'all', 'close-up').map((item) => item.id)).toEqual(['portrait'])
    expect(filterPrompts(items, 'image', 'camera')).toEqual([])
    expect(filterPrompts(items, 'video', 'camera').map((item) => item.id)).toEqual(['motion'])
  })

  it('filters by source and derives source options from data (no hardcoded vocabulary)', () => {
    const items = [
      prompt({ id: 'a', source: 'GPT Image 2' }),
      prompt({ id: 'b', source: 'Sora 2', promptType: 'video', mediaType: 'video' }),
      prompt({ id: 'c', source: 'GPT Image 2' }),
      prompt({ id: 'd', source: '   ' }), // blank source ignored in options
    ]
    // options preserve first-seen order and dedupe; blank dropped.
    expect(promptSourceOptions(items)).toEqual(['GPT Image 2', 'Sora 2'])
    // default sentinel keeps everything.
    expect(filterPrompts(items, 'all', '', PROMPT_SOURCE_ALL).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    // narrowing to one source.
    expect(filterPrompts(items, 'all', '', 'GPT Image 2').map((i) => i.id)).toEqual(['a', 'c'])
    // source + type compose.
    expect(filterPrompts(items, 'video', '', 'Sora 2').map((i) => i.id)).toEqual(['b'])
  })
})
