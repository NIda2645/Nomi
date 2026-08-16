import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockedUserDataRoot = ''
const tempRoots: string[] = []

vi.mock('electron', () => ({
  app: {
    getPath: () => mockedUserDataRoot,
    getAppPath: () => process.cwd(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}))

import { listModelCatalogModels, upsertModelCatalogModel } from './catalogStore'

const contract = {
  version: 1,
  kind: 'video',
  defaultModeId: 'text',
  transportTaskKind: 'text_to_video',
  modes: [{
    id: 'text',
    intent: 'text',
    vendorTerm: 'Text to video',
    hint: '',
    promptRequired: true,
    transportTaskKind: 'text_to_video',
    slots: [],
    params: [],
  }],
}

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-capability-upsert-'))
  tempRoots.push(dir)
  return dir
}

function readBack() {
  return listModelCatalogModels({ vendorKey: 'custom-relay' })
    .find((model) => model.modelKey === 'future-video-v1')
}

describe('custom capability contract catalog persistence', () => {
  beforeEach(() => {
    mockedUserDataRoot = makeTempDir()
  })

  afterEach(() => {
    for (const dir of tempRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips in model.meta and is preserved by unrelated model upserts', () => {
    upsertModelCatalogModel({
      vendorKey: 'custom-relay',
      modelKey: 'future-video-v1',
      kind: 'video',
      meta: { note: 'keep', customCapabilityContract: contract },
    })
    expect(readBack()?.meta).toEqual({ note: 'keep', customCapabilityContract: contract })

    upsertModelCatalogModel({
      vendorKey: 'custom-relay',
      modelKey: 'future-video-v1',
      labelZh: 'Renamed model',
    })
    expect(readBack()?.meta).toEqual({ note: 'keep', customCapabilityContract: contract })
  })
})
