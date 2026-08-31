export type ComfyWorkflowOutputKind = 'image' | 'video' | 'model3d'
export type ComfyWorkflowTaskKind =
  | 'text_to_image'
  | 'image_edit'
  | 'text_to_video'
  | 'image_to_video'
  | 'text_to_3d'
  | 'image_to_3d'

type DeclaredMediaInput = { mediaKind?: 'image' | 'video' }

/**
 * ComfyUI transport is a property of the imported graph, not of the URLs filled
 * for one run. Video-only inputs stay in the text bucket because Nomi has no
 * video-to-video ProfileKind; any declared still-image input selects the image
 * variant of the output contract.
 */
export function resolveComfyWorkflowTaskKind(
  outputKind: ComfyWorkflowOutputKind,
  mediaInputs: readonly DeclaredMediaInput[],
): ComfyWorkflowTaskKind {
  const hasImageInput = mediaInputs.some((input) => input.mediaKind !== 'video')
  if (outputKind === 'model3d') return hasImageInput ? 'image_to_3d' : 'text_to_3d'
  if (outputKind === 'video') return hasImageInput ? 'image_to_video' : 'text_to_video'
  return hasImageInput ? 'image_edit' : 'text_to_image'
}
