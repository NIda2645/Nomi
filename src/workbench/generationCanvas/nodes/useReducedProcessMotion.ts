import React from 'react'
import { readProcessMotionCapability, shouldReduceProcessMotion } from './processMotionCapability'

const rendererByDocument = new WeakMap<Document, string | null>()

function readReducedMotion(): boolean {
  if (typeof document === 'undefined') return false
  if (!rendererByDocument.has(document)) rendererByDocument.set(document, readProcessMotionCapability().renderer)
  return shouldReduceProcessMotion({
    renderer: rendererByDocument.get(document)!,
    prefersReducedMotion: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  })
}

export function useReducedProcessMotion(): boolean {
  const [reduced, setReduced] = React.useState(readReducedMotion)
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(readReducedMotion())
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}
