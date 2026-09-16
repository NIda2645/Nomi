import { describe, expect, it, vi } from 'vitest'
import { notifications, notificationsStore } from '@mantine/notifications'
import type { GenerationCanvasNode } from '../model/generationCanvasTypes'
import { extractVideoFrameToNode } from './extractVideoFrameToNode'
import { buildContactSheetNode } from './buildContactSheetNode'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'

const source = { id: 'feedback-source', kind: 'video', title: 'source', position: { x: 0, y: 0 }, categoryId: 'shots', result: { id: 'r', type: 'video', url: 'nomi-local://asset/project/source.mp4', createdAt: 1 } } as GenerationCanvasNode

describe('node action feedback stays separate from generation state', () => {
  it('five missing-project frame extractions report to their real caller without global notifications or node mutation', async () => {
    notifications.clean()
    useGenerationCanvasStore.setState({ nodes: [source], edges: [] })
    let feedback = ''
    const present = vi.fn((message: string) => { feedback = message })
    for (let index = 0; index < 5; index++) await extractVideoFrameToNode(source, 'first', present)
    expect(present).toHaveBeenCalledTimes(5)
    expect(feedback).not.toBe('')
    expect(useGenerationCanvasStore.getState().nodes).toEqual([source])
    expect(notificationsStore.getState().notifications).toHaveLength(0)
    expect(notificationsStore.getState().queue).toHaveLength(0)
  })

  it('contact-sheet prerequisite failure reaches the caller instead of creating a failed generation node', async () => {
    useGenerationCanvasStore.setState({ nodes: [], edges: [] })
    const present = vi.fn()
    expect(await buildContactSheetNode([], present)).toBe(false)
    expect(present).toHaveBeenCalledOnce()
    expect(present.mock.calls[0][0]).not.toBe('')
    expect(useGenerationCanvasStore.getState().nodes).toEqual([])
  })
})
