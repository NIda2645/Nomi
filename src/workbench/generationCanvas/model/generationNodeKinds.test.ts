import { describe, expect, it } from 'vitest'
import {
  getGenerationNodeExecutionKind,
  isAudioLikeGenerationNodeKind,
  isImageLikeGenerationNodeKind,
  isModel3dLikeGenerationNodeKind,
  isVideoLikeGenerationNodeKind,
} from './generationNodeKinds'

// The composer's `isGenerationNode` gate is the union of these predicates. A kind
// that no predicate claims renders no parameter bar → no model selector at all.
// This locks in that every executable kind (incl. model3d) is claimed by exactly
// one predicate, so the 3D node keeps its selector.
describe('generation node kind classification', () => {
  it('classifies the 3D model kind as a 3D-like generation node', () => {
    expect(getGenerationNodeExecutionKind('model3d')).toBe('model3d')
    expect(isModel3dLikeGenerationNodeKind('model3d')).toBe(true)
  })

  it('does not misclassify the 3D model kind as image/video/audio', () => {
    expect(isImageLikeGenerationNodeKind('model3d')).toBe(false)
    expect(isVideoLikeGenerationNodeKind('model3d')).toBe(false)
    expect(isAudioLikeGenerationNodeKind('model3d')).toBe(false)
  })

  it('keeps the 3D predicate scoped to 3D (image/video are not 3D-like)', () => {
    expect(isModel3dLikeGenerationNodeKind('image')).toBe(false)
    expect(isModel3dLikeGenerationNodeKind('video')).toBe(false)
    expect(isModel3dLikeGenerationNodeKind('text')).toBe(false)
  })
})
