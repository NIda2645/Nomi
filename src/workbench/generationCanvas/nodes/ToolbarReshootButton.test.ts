import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let nodeMeta: Record<string, unknown> | undefined

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../store/generationCanvasStore', () => ({
  useGenerationCanvasStore: (selector: (state: unknown) => unknown) => selector({ nodes: [{ id: 'shot-1', meta: nodeMeta }] }),
}))

const { ToolbarReshootButton } = await import('./NodeFloatingToolbar')

// 「重拍这镜」的家：节点浮条。只有制作流程的镜头（meta 里带 productionRunId）才有，与有几版无关；
// 结果托盘里不再放它（版本角标因此只在 ≥2 版时出现，见 useNodeResultHistory.test.ts）。
describe('ToolbarReshootButton', () => {
  beforeEach(() => { nodeMeta = undefined })

  it('制作流程的镜头：浮条里有「重拍这镜」', () => {
    nodeMeta = { productionRunId: 'run-1', productionShotId: 'shot-1' }
    const html = renderToStaticMarkup(React.createElement(ToolbarReshootButton, { nodeId: 'shot-1' }))
    expect(html).toContain('generationCommon.node.reshoot')
    expect(html.match(/<button/g)).toHaveLength(1)
  })

  it('普通节点（没有制作流程印记）：一个按钮都不出', () => {
    nodeMeta = { modelKey: 'x' }
    expect(renderToStaticMarkup(React.createElement(ToolbarReshootButton, { nodeId: 'shot-1' }))).toBe('')
    nodeMeta = undefined
    expect(renderToStaticMarkup(React.createElement(ToolbarReshootButton, { nodeId: 'shot-1' }))).toBe('')
  })
})
