import { describe, expect, it } from 'vitest'
import { filterPrompts, type LibraryPrompt } from './promptLibraryApi'

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
})
