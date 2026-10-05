import { beforeEach, expect, it, vi } from 'vitest'
import { confirmAndRunNode, confirmAndRunNodeVariants, regenerateNodeInPlace } from './generationRunController'
import { useGenerationCanvasStore } from '../store/generationCanvasStore'
const calls = vi.hoisted(() => ({ confirm: vi.fn(), mint: vi.fn(), current: true }))
vi.mock('../../project/projectCanvasReadSurface', () => ({ withProjectAction: (fn: (value: unknown) => unknown) => fn({ binding: { projectId: 'p' }, assertCurrent() {} }), isProjectExecutionContextCurrent: () => true }))
vi.mock('../../api/taskApi', () => ({ mintSpendGrant: calls.mint }))
vi.mock('../spend/spendConfirm', async original => ({ ...await original<typeof import('../spend/spendConfirm')>(), confirmGenerationSpend: calls.confirm }))
vi.mock('./assetUploadConsent', async original => ({ ...await original<typeof import('./assetUploadConsent')>(), resolveAssetUploadConsent: async () => ({allowed:true, needsConfirmation:false}) }))
beforeEach(() => {
  calls.current = true; calls.mint.mockReset().mockResolvedValue('grant'); calls.confirm.mockReset().mockImplementation(async () => { calls.current=false; return true })
  // 令牌路（本地 ComfyUI 等登记的例外）才有「确认之后、铸令牌这段异步空档」；单镜 Run 路的批准在主进程同一次调用里。
  useGenerationCanvasStore.getState().restoreSnapshot({nodes:[{id:'node',kind:'image',title:'Image',position:{x:0,y:0},prompt:'old',meta:{modelKey:'workflow',modelVendor:'comfyui-local',vendor:'comfyui-local'}}],edges:[],groups:[],selectedNodeIds:[]})
})
const assertCurrent = async () => { if (!calls.current) throw new Error('storyboard_content_conflict') }
it.each(['single','variants','regenerate'])('rejects changed author target after human confirmation before minting on %s', async kind => {
  const action = kind==='single' ? () => confirmAndRunNode('node',{initiator:'user',assertCurrent,assertAuthorCurrent:assertCurrent})
    : kind==='variants' ? () => confirmAndRunNodeVariants('node',3,{initiator:'user',assertCurrent,assertAuthorCurrent:assertCurrent}) : () => regenerateNodeInPlace('node',{initiator:'user',assertCurrent,assertAuthorCurrent:assertCurrent})
  await action().catch(() => {})
  expect(calls.confirm).toHaveBeenCalledOnce()
  expect(calls.mint).not.toHaveBeenCalled()
})
it.each(['single','variants','regenerate'])('rechecks author target after asynchronous grant minting on %s', async kind => {
  calls.confirm.mockResolvedValue(true)
  calls.mint.mockImplementation(async () => { calls.current=false; return 'grant' })
  const checked = vi.fn(assertCurrent)
  const action = kind==='single' ? () => confirmAndRunNode('node',{initiator:'user',assertCurrent:checked,assertAuthorCurrent:checked})
    : kind==='variants' ? () => confirmAndRunNodeVariants('node',3,{initiator:'user',assertCurrent:checked,assertAuthorCurrent:checked}) : () => regenerateNodeInPlace('node',{initiator:'user',assertCurrent:checked,assertAuthorCurrent:checked})
  await action().catch(() => {})
  expect(calls.mint).toHaveBeenCalledOnce()
  expect(checked).toHaveBeenCalledTimes(2)
  expect(useGenerationCanvasStore.getState().nodes[0].status).toBeUndefined()
})
