import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DesktopBridge } from './bridge'

type ModelCatalogBridge = DesktopBridge['modelCatalog']
type AiInstructionPayload = Parameters<NonNullable<ModelCatalogBridge['customCallAiInstruction']>>[0]
type TestRunPayload = Parameters<NonNullable<ModelCatalogBridge['customCallTestRun']>>[0]

const bridgeSource = fs.readFileSync(path.join(process.cwd(), 'src/desktop/bridge.ts'), 'utf8')
const customCallBridgeSource = fs.readFileSync(path.join(process.cwd(), 'src/desktop/modelCatalogBridgeTypes.ts'), 'utf8')

describe('desktop custom-call bridge contract', () => {
  it('accepts the selected transport task kind and capability mode in both script methods', () => {
    const executionContext = {
      taskKind: 'image_to_video',
      modeId: 'first-last-frame',
    } as const
    const aiPayload: AiInstructionPayload = {
      vendorKey: 'future-cloud',
      modelKey: 'future-video-v1',
      material: 'POST /tasks',
      ...executionContext,
    }
    const testRunPayload: TestRunPayload = {
      runId: 'trial-future-cloud',
      vendorKey: 'future-cloud',
      modelKey: 'future-video-v1',
      script: 'return { url: "https://cdn.example/result.mp4" }',
      ...executionContext,
    }

    expect(aiPayload).toMatchObject(executionContext)
    expect(testRunPayload).toMatchObject(executionContext)
  })

  it('keeps taskKind and modeId optional for old preload callers', () => {
    const aiPayload: AiInstructionPayload = {
      vendorKey: 'legacy-cloud',
      modelKey: 'legacy-model',
      material: 'POST /generate',
    }
    const testRunPayload: TestRunPayload = {
      runId: 'trial-legacy-cloud',
      vendorKey: 'legacy-cloud',
      modelKey: 'legacy-model',
      script: 'return { text: "ok" }',
    }

    expect(aiPayload).not.toHaveProperty('taskKind')
    expect(aiPayload).not.toHaveProperty('modeId')
    expect(testRunPayload).not.toHaveProperty('taskKind')
    expect(testRunPayload).not.toHaveProperty('modeId')
    expect(customCallBridgeSource.match(/taskKind\?: ProfileKind/g)?.length).toBeGreaterThanOrEqual(3)
    expect(customCallBridgeSource.match(/modeId\?: string/g)?.length).toBeGreaterThanOrEqual(3)
    expect(bridgeSource).toContain('modelCatalog: CustomCallBridge &')
  })
})
