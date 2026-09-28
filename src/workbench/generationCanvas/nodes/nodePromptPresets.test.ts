import { describe, expect, it } from 'vitest'
import { compatibleNodePresets } from './nodePromptPresets'
import { filterPrompts, type LibraryPrompt } from '../../api/promptLibraryApi'

const prompt = (id: string, promptType: 'image' | 'video', origin: 'public' | 'user' = 'public'): LibraryPrompt => ({
  id, promptType, origin, title: id, prompt: `Create ${id}`, mediaType: promptType,
  mediaUrl: '', source: 'Library', sourceId: 'library', sourceUrl: '', tags: [],
})
const photo = prompt('sunset portrait', 'image')
const motion = prompt('slow camera', 'video')
const mine = prompt('my portrait', 'image', 'user')
const effect = { ...prompt('turntable', 'image'), curation: {
  kind: 'effect', appliesTo: ['image', 'video'], title: { 'zh-CN': '转台', en: 'Turntable' },
  group: { 'zh-CN': '镜头', en: 'Camera' },
} } as LibraryPrompt

describe('node prompt presets', () => {
  it('restores ordinary public prompts alongside my prompts and effects', () => {
    expect(compatibleNodePresets([photo, motion, effect], [mine], 'image').map(p => p.id))
      .toEqual([photo.id, effect.id, mine.id])
  })
  it('video uses declared effect applicability and compatible ordinary/user media', () => {
    const myVideo = prompt('my video', 'video', 'user')
    expect(compatibleNodePresets([photo, motion, effect], [mine, myVideo], 'video').map(p => p.id))
      .toEqual([motion.id, effect.id, myVideo.id])
    expect(compatibleNodePresets([photo, motion, effect], [mine], 'audio')).toEqual([])
  })
  it('keeps library search semantics for names, prompt text, tags and translated effects', () => {
    const rows = compatibleNodePresets([photo, effect], [mine], 'image')
    expect(filterPrompts(rows, 'all', 'sunset').map(p => p.id)).toEqual([photo.id])
    expect(filterPrompts(rows, 'all', '转台').map(p => p.id)).toEqual([effect.id])
    expect(filterPrompts(rows, 'all', 'not found')).toEqual([])
  })
})
