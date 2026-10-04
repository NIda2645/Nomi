import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { extractFile } from '@electron/asar'
import { resolveAsar } from './check-packaged-intake.mjs'

export const FEATURE_FLAGS_RELATIVE = 'dist-electron/feature-flags.json'

export function readPackagedFlags(target) {
  const asar = resolveAsar(target)
  return JSON.parse(extractFile(asar, FEATURE_FLAGS_RELATIVE).toString('utf8'))
}

function expectedFromArg(value) {
  if (value == null) return null
  if (value !== 'true' && value !== 'false') throw new Error(`期望值必须是 true 或 false：${value}`)
  return value === 'true'
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const target = args[0]
  const expected = expectedFromArg(args[1]?.replace(/^--director3dbox=/, ''))
  if (!target) {
    console.error('用法：node scripts/check-packaged-flags.mjs <打包产物目录或 .app> [--director3dbox=true|false]')
    process.exit(2)
  }
  try {
    const flags = readPackagedFlags(target)
    if (flags.version !== 1 || typeof flags.director3dbox !== 'boolean' || flags.expiresOn !== '2026-11-15') {
      throw new Error(`配置字段不完整：${JSON.stringify(flags)}`)
    }
    if (expected !== null && flags.director3dbox !== expected) {
      throw new Error(`期望 director3dbox=${expected}，包内是 ${flags.director3dbox}`)
    }
    console.log(`出厂开关门岗 ✓ director3dbox=${flags.director3dbox} expiresOn=${flags.expiresOn}`)
  } catch (error) {
    console.error(`出厂开关门岗：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
