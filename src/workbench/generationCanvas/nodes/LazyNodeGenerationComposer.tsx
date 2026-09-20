import { NomiSkeleton } from '../../../design/status'
import { lazyWithChunkBoundary } from '../../../ui/chunkBoundary'
import type { ComponentProps } from 'react'
import type NodeGenerationComposer from './NodeGenerationComposer'

// Both real hosts must keep the composer outside their eager module graph.
// An eager payment-card import would make a failed composer chunk take down
// WorkbenchShell before the canvas's local recovery boundary could mount.
const loadComposer = () => import('./NodeGenerationComposer')
const CanvasComposer = lazyWithChunkBoundary('i18n:generationCommon.chunk.composer', loadComposer, {
  recovery: 'local',
  errorClassName: 'absolute left-0 top-full h-auto',
  pending: <div className="absolute left-0 top-full min-h-24 w-full rounded-nomi border border-nomi-line bg-nomi-paper p-4"><NomiSkeleton lines={3} /></div>,
})
const PanelComposer = lazyWithChunkBoundary('i18n:generationCommon.chunk.composer', loadComposer, {
  recovery: 'local',
  pending: <div className="min-h-24 w-full rounded-nomi border border-nomi-line bg-nomi-paper p-4"><NomiSkeleton lines={3} /></div>,
})

export default function LazyNodeGenerationComposer(props: ComponentProps<typeof NodeGenerationComposer>): JSX.Element {
  return props.host === 'panel' ? <PanelComposer {...props} /> : <CanvasComposer {...props} />
}
