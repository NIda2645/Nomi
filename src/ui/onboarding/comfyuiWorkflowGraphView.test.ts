// 只读节点图视图模型。夹具用**真实模板展开后的形状**：
// LTX 常量节点形态取自 scripts/comfyui-workflow-params-walkthrough.mjs 的走查图，
// MiniMax H3 形态取自 electron/catalog/comfyuiSubgraphPrompt.test.ts（其节点名来自
// Comfy-Org 官方模板 video_minimax_h3_t2v.json 真身）——不自己编节点名，这仓库栽过。
import { describe, expect, it } from 'vitest'
import { buildWorkflowGraphView, type GraphInput } from './comfyuiWorkflowGraphView'

/** LTX：常量节点 → 计算 → 主节点 → 保存。 */
const LTX: GraphInput = {
  108: { class_type: 'LTXVImgToVideo', inputs: { width: ['292', 0], height: ['293', 0], length: ['287', 0], positive: ['110', 0], image: ['200', 0] } },
  110: { class_type: 'CLIPTextEncode', inputs: { text: 'default prompt', clip: ['111', 0] } },
  111: { class_type: 'CLIPLoader', inputs: { clip_name: 't5xxl_fp16.safetensors' } },
  200: { class_type: 'LoadImage', inputs: { image: 'start.png' } },
  285: { class_type: 'PrimitiveFloat', _meta: { title: 'FPS' }, inputs: { value: 24 } },
  287: { class_type: 'SimpleCalculatorKJ', inputs: { a: ['291', 0], b: ['285', 0], operation: 'multiply' } },
  291: { class_type: 'INTConstant', _meta: { title: 'LENGTH (in seconds)' }, inputs: { value: 5 } },
  292: { class_type: 'INTConstant', _meta: { title: 'WIDTH' }, inputs: { value: 960 } },
  293: { class_type: 'INTConstant', _meta: { title: 'HEIGHT' }, inputs: { value: 544 } },
  300: { class_type: 'SaveVideo', inputs: { video: ['108', 0], filename_prefix: 'ltx' } },
}

const nodeById = (view: ReturnType<typeof buildWorkflowGraphView>, id: string) =>
  view.nodes.find((n) => n.nodeId === id)

describe('ComfyUI 只读节点图视图模型', () => {
  it('生产者永远排在消费者左边（分层用最长路径，不是最短）', () => {
    const view = buildWorkflowGraphView(LTX, {})
    const col = (id: string) => nodeById(view, id)!.column
    expect(col('291')).toBe(0) // 常量
    expect(col('287')).toBeGreaterThan(col('291')) // 计算在常量右边
    expect(col('108')).toBeGreaterThan(col('287')) // 主节点在计算右边
    expect(col('300')).toBeGreaterThan(col('108')) // 成品最右
    // 292/293 只喂 108，但 108 还有更深的上游（291→287），最长路径保证 108 仍在它俩右边。
    expect(col('108')).toBeGreaterThan(col('292'))
  })

  it('每条连线画一次；悬空边（指向不存在的节点）不画也不影响分层', () => {
    const withDangling: GraphInput = {
      ...LTX,
      400: { class_type: 'SaveImage', inputs: { images: ['999', 0] } }, // 999 不存在
    }
    const view = buildWorkflowGraphView(withDangling, {})
    expect(view.edges.some((e) => e.from === '999' || e.to === '999')).toBe(false)
    expect(nodeById(view, '400')!.column).toBe(0) // 没有有效上游 → 第一列
    const keys = view.edges.map((e) => `${e.from}->${e.to}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('作者在 ComfyUI 里改过的节点标题优先于 class_type（不做中文对照表）', () => {
    const view = buildWorkflowGraphView(LTX, {})
    expect(nodeById(view, '292')!.title).toBe('WIDTH') // _meta.title
    expect(nodeById(view, '292')!.classType).toBe('INTConstant') // class_type 仍单独给出
    expect(nodeById(view, '111')!.title).toBe('CLIPLoader') // 没标题 → 退回 class_type
  })

  it('角色标在节点上，一个节点最多一个角色', () => {
    const view = buildWorkflowGraphView(LTX, {
      promptNodeId: '110', firstFrameNodeId: '200', outputNodeId: '300',
    })
    expect(nodeById(view, '110')!.role).toBe('prompt')
    expect(nodeById(view, '200')!.role).toBe('firstFrame')
    expect(nodeById(view, '300')!.role).toBe('output')
    expect(nodeById(view, '111')!.role).toBeNull()
    expect(view.nodes.filter((n) => n.role !== null)).toHaveLength(3)
  })

  it('「N 已用」按节点聚合——同一个节点暴露两个输入就是 2', () => {
    const view = buildWorkflowGraphView(LTX, {
      params: [
        { nodeId: '292', inputKey: 'value' },
        { nodeId: '293', inputKey: 'value' },
        { nodeId: '287', inputKey: 'a' },
        { nodeId: '287', inputKey: 'b' },
      ],
    })
    expect(nodeById(view, '287')!.exposedCount).toBe(2)
    expect(nodeById(view, '292')!.exposedCount).toBe(1)
    expect(nodeById(view, '111')!.exposedCount).toBe(0)
  })

  it('列内顺序按节点号数值序，不随 JSON 键的书写顺序跳', () => {
    const reordered: GraphInput = {}
    for (const id of Object.keys(LTX).reverse()) reordered[id] = LTX[id]
    const a = buildWorkflowGraphView(LTX, {})
    const b = buildWorkflowGraphView(reordered, {})
    const key = (v: typeof a) => v.nodes.map((n) => `${n.column}:${n.row}:${n.nodeId}`).join('|')
    expect(key(b)).toBe(key(a))
  })

  it('用户手改出的环不会把页面卡死（就地收住，仍产出完整视图）', () => {
    const cyclic: GraphInput = {
      1: { class_type: 'A', inputs: { x: ['2', 0] } },
      2: { class_type: 'B', inputs: { x: ['1', 0] } },
      3: { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
    }
    const view = buildWorkflowGraphView(cyclic, {})
    expect(view.nodes).toHaveLength(3)
    expect(view.nodes.every((n) => Number.isFinite(n.column))).toBe(true)
  })

  it('MiniMax H3 子图展开后的形态：提示词节点在最左、SaveVideo 在最右', () => {
    const h3: GraphInput = {
      92: { class_type: 'SaveVideo', inputs: { video: ['91', 0] } },
      91: { class_type: 'CreateVideo', inputs: { images: ['124', 0] } },
      115: { class_type: 'ResolutionSelector', inputs: { megapixels: 1, aspect: '16:9' } },
      13: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen3vl.safetensors' } },
      124: { class_type: 'MiniMaxH3ImageToVideo', inputs: { clip: ['13', 0], width: ['115', 0], length: 121, prompt: ['130', 0] } },
      130: { class_type: 'PrimitiveStringMultiline', inputs: { value: 'action movie trailer' } },
    }
    const view = buildWorkflowGraphView(h3, { promptNodeId: '130', outputNodeId: '92' })
    expect(nodeById(view, '130')!.column).toBe(0)
    const maxColumn = Math.max(...view.nodes.map((n) => n.column))
    expect(nodeById(view, '92')!.column).toBe(maxColumn)
    expect(nodeById(view, '130')!.role).toBe('prompt')
  })
})
