import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Model } from './types'
import { modelListReconciliation } from './modelListReconcile'

const model = (vendorKey: string, modelKey: string): Model => ({ vendorKey, modelKey, labelZh: modelKey, kind: 'text', enabled: true, meta: { catalogLifecycle: 'value' }, createdAt: 'a', updatedAt: 'a' })
describe('catalog list reconciliation', () => {
  it('只落「供应商清单里暂时没有它」这条旁注，绝不替用户改 enabled', () => {
    const missing = modelListReconciliation([model('a', 'gone')], 'a', { ok: true, models: ['present'], statuses: [200] })
    expect(missing).toEqual([{ vendorKey: 'a', modelKey: 'gone', unlisted: true }])
    // 关键负例：用户的启用决定不在这条边界的产出里（2026-09-21 用户拍板：停不停用由用户决定）。
    expect(missing[0]).not.toHaveProperty('enabled')
    const restored = modelListReconciliation([{ ...model('a', 'gone'), ...missing[0] }], 'a', { ok: true, models: ['gone'], statuses: [200] })
    expect(restored).toEqual([{ vendorKey: 'a', modelKey: 'gone', unlisted: false }])
    expect(restored[0]).not.toHaveProperty('enabled')
  })
  it('isolates vendors, manual entries and non-text models', () => {
    const rows = [model('b', 'gone'), { ...model('a', 'manual'), meta: {} }, { ...model('a', 'image'), kind: 'image' as const }]
    expect(modelListReconciliation(rows, 'a', { ok: true, models: ['anything'], statuses: [200] })).toEqual([])
  })
  it('does not treat failed, partial or unchanged responses as absence evidence', () => {
    for (const result of [{ ok: false as const, error: 'offline', statuses: [] }, { ok: true as const, models: [], statuses: [200], partial: true }, { ok: true as const, models: [], statuses: [304], notModified: true }]) {
      expect(modelListReconciliation([model('a', 'gone')], 'a', result)).toEqual([])
    }
  })
  it('一份成功但空的清单也不是证据（鉴权降级/网关抖动都会回 200 + 空数组）', () => {
    expect(modelListReconciliation([model('a', 'gone')], 'a', { ok: true, models: [], statuses: [200] })).toEqual([])
  })
  it('结构：没有第二处拿「供应商清单」去改用户 enabled 的地方', () => {
    // 这一条守的是形状，不是这一个文件：清单证据只可以落旁注（unlisted），
    // 用户的启用决定只能由用户改。把两件事写在同一个赋值里，就是这次的 bug。
    const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(full); continue }
        if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) return
          if (!/\bunlisted\b/.test(line) || !/\benabled\b/.test(line)) return
          // 读 unlisted 顺手读 enabled 没问题；把 unlisted 当条件去**写** enabled 才是那个 bug。
          if (!/enabled\s*:/.test(line)) return
          offenders.push(`${path.relative(electronRoot, full)}:${index + 1} ${line.trim().slice(0, 90)}`)
        })
      }
    }
    walk(electronRoot)
    expect(offenders).toEqual([])
  })
})
