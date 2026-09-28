// Preview / RC 与稳定版「配置分家 + 首次启动拷一份」的行为与配置测试（批次 E，2026-09-21）。
//
// 拦的是 `rootcause-config-loss-on-reinstall.md` §4 那颗定时炸弹：Preview 只分了 appId，
// `app.getName()` 仍是 `nomi` → 两者共用同一个 userData → 装一次 Preview 就能把稳定版
// 推进「读得出来、改不了、界面空白」的事故态。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DELIBERATELY_NOT_SEEDED, SEEDED_CONFIG_FILES, seedFromStableInstall, STABLE_APP_NAME } from './sideBySideInstallSeed'

let appData = ''
const stableRoot = (): string => path.join(appData, STABLE_APP_NAME)
const previewRoot = (): string => path.join(appData, 'Nomi Preview')

beforeEach(() => {
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-side-by-side-'))
  fs.mkdirSync(stableRoot(), { recursive: true })
})

afterEach(() => fs.rmSync(appData, { recursive: true, force: true }))

const seedPreview = (): ReturnType<typeof seedFromStableInstall> =>
  seedFromStableInstall({ appName: 'Nomi Preview', settingsRoot: previewRoot(), appDataRoot: appData })

describe('the preview build never shares the stable config', () => {
  it('copies the stable config once and leaves the stable copy byte for byte', () => {
    const catalog = '{"version":13,"vendors":[{"key":"higgsfield"}],"models":[],"mappings":[],"apiKeysByVendor":{}}'
    fs.writeFileSync(path.join(stableRoot(), 'model-catalog.json'), catalog, 'utf8')
    fs.writeFileSync(path.join(stableRoot(), 'vendor-preference.json'), '{"orderedVendorKeys":["higgsfield"]}', 'utf8')

    const first = seedPreview()

    expect(first.seeded).toEqual(['model-catalog.json', 'vendor-preference.json'])
    expect(fs.readFileSync(path.join(previewRoot(), 'model-catalog.json'), 'utf8')).toBe(catalog)
    expect(fs.readFileSync(path.join(stableRoot(), 'model-catalog.json'), 'utf8')).toBe(catalog)

    // 拷过一次之后每次启动都是 no-op：Preview 升级目录版本也碰不到稳定版那一份。
    fs.writeFileSync(path.join(previewRoot(), 'model-catalog.json'), '{"version":99}', 'utf8')
    const second = seedPreview()
    expect(second.skippedBecauseAlreadyPresent).toBe(true)
    expect(second.seeded).toEqual([])
    expect(fs.readFileSync(path.join(stableRoot(), 'model-catalog.json'), 'utf8')).toBe(catalog)
  })

  it('does nothing for the stable build itself', () => {
    fs.writeFileSync(path.join(stableRoot(), 'model-catalog.json'), '{"version":13}', 'utf8')
    const result = seedFromStableInstall({ appName: STABLE_APP_NAME, settingsRoot: stableRoot(), appDataRoot: appData })
    expect(result).toEqual({ seeded: [], skippedBecauseAlreadyPresent: false, source: null })
  })

  it('leaves machine-bound state behind instead of duplicating it', () => {
    fs.writeFileSync(path.join(stableRoot(), 'model-catalog.json'), '{"version":13}', 'utf8')
    for (const name of DELIBERATELY_NOT_SEEDED) fs.writeFileSync(path.join(stableRoot(), name), '{}', 'utf8')

    seedPreview()

    for (const name of DELIBERATELY_NOT_SEEDED) {
      expect(fs.existsSync(path.join(previewRoot(), name)), `${name} 明确不该带过去`).toBe(false)
    }
  })
})

describe('the packaged preview really gets its own userData', () => {
  it('overrides the asar package.json name, which is what app.getName() reads', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const preview = require('../../electron-builder.preview.cjs') as { appId: string; extraMetadata?: { name?: string } }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stable = require('../../package.json') as { name: string }

    expect(preview.appId).not.toBe('com.nomi.app')
    expect(
      preview.extraMetadata?.name,
      'Preview 必须用 extraMetadata.name 覆盖 asar 内的 package.json name——'
        + 'appId 分开只让两者能并存安装，数据并没有分家（app.getName() 读的是 name，不是 productName）',
    ).toBeTruthy()
    expect(preview.extraMetadata?.name).not.toBe(stable.name)
  })

  it('keeps the seed list in step with the config files the code actually writes', () => {
    // 新增一个配置文件却忘了让 Preview 带过去，用户会以为「试新版丢了东西」。
    // 判据取自代码里真实出现的文件名，不是一张手抄的表。
    const roots = ['electron']
    const found = new Set<string>()
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(file)
        } else if (/\.ts$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const source = fs.readFileSync(file, 'utf8')
          for (const match of source.matchAll(/["'`]([a-z0-9-]+\.json)["'`]/g)) {
            if (/getSettingsRoot|SETTINGS_ROOT/.test(source)) found.add(match[1])
          }
        }
      }
    }
    for (const root of roots) walk(path.join(process.cwd(), root))

    const known = new Set<string>([...SEEDED_CONFIG_FILES, ...DELIBERATELY_NOT_SEEDED])
    // `model-catalog.json` 之外，settings 根下真实出现的配置文件名必须都被裁决过。
    const undecided = [...found].filter((name) => !known.has(name)).sort()
    expect(
      undecided,
      '这些配置文件名出现在读写 settings 根的模块里，却既不在 SEEDED_CONFIG_FILES、也不在 DELIBERATELY_NOT_SEEDED：'
        + '请显式裁决 Preview 首次启动要不要带走它（带走就加进第一张表，不带就加进第二张并写理由）。',
    ).toEqual([])
  })
})
