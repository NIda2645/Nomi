import type { LibraryPrompt } from '../../api/promptLibraryApi'

/** Recommendations must never define the selectable library. Curated prompts can span media kinds. */
export function compatibleNodePresets(publicItems: LibraryPrompt[], userItems: LibraryPrompt[], kind: string): LibraryPrompt[] {
  if (kind !== 'image' && kind !== 'video') return []
  return [...publicItems, ...userItems].filter(item => item.curation
    ? item.curation.appliesTo.some(target => target === kind)
    : item.promptType === kind)
}
