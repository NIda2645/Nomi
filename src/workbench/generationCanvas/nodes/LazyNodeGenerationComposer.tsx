import { Suspense } from 'react'
import { NomiSkeleton } from '../../../design/status'
import { lazyWithChunkBoundary } from '../../../ui/chunkBoundary'
import type { ComponentProps } from 'react'
import type NodeGenerationComposer from './NodeGenerationComposer'

// Both real hosts must keep the composer outside their eager module graph.
// An eager payment-card import would make a failed composer chunk take down
// WorkbenchShell instead of degrading only the composer region.
// chunk 失败的恢复由 chunkBoundary 的自动整页重载负责（见该文件的说明：
// React.lazy 一旦 reject 会永久缓存失败、同一 JS 上下文里无法复活），
// 这里只负责「别被 eager 进宿主模块图」和两个宿主各自的等待骨架。
const Composer = lazyWithChunkBoundary('i18n:generationCommon.chunk.composer', () => import('./NodeGenerationComposer'))

const canvasPending = (
  <div className="absolute left-0 top-full min-h-24 w-full rounded-nomi border border-nomi-line bg-nomi-paper p-4">
    <NomiSkeleton lines={3} />
  </div>
)
const panelPending = (
  <div className="min-h-24 w-full rounded-nomi border border-nomi-line bg-nomi-paper p-4">
    <NomiSkeleton lines={3} />
  </div>
)

export default function LazyNodeGenerationComposer(props: ComponentProps<typeof NodeGenerationComposer>): JSX.Element {
  return (
    <Suspense fallback={props.host === 'panel' ? panelPending : canvasPending}>
      <Composer {...props} />
    </Suspense>
  )
}
