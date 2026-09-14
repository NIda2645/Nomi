import { describe, expect, it } from 'vitest'
import { createStoryboardShotTable, normalizeShotTableMeta, readShotTable, shotTableDocumentSchema } from './shotTable'

const table = () => createStoryboardShotTable('document-1', 'design-1', '2026-09-10T00:00:00.000Z')

describe('shot table persistence ownership', () => {
  it('round trips only a storyboard reference and view state, with no owned rows', () => {
    const value = table()
    value.view.selectedRowIds = ['shot-3']
    value.view.density = 'compact'
    const restored = readShotTable(JSON.parse(JSON.stringify({ shotTable: value })))
    expect(restored).toEqual(value)
    expect(restored).not.toHaveProperty('rows')
  })

  it('rejects cached production rows at the shared persistence boundary', () => {
    const meta = { shotTable: { ...table(), rows: [{ rowId: 'shot-3' }] } }
    expect(readShotTable(meta)).toBeUndefined()
    expect(() => normalizeShotTableMeta(meta)).toThrow()
    expect(meta.shotTable.rows).toEqual([{ rowId: 'shot-3' }])
  })

  it('rejects missing and future schemas without rewriting the source', () => {
    expect(() => normalizeShotTableMeta(undefined)).toThrow()
    const future = { shotTable: { ...table(), schemaVersion: 2 } }
    expect(() => normalizeShotTableMeta(future)).toThrow()
    expect(future.shotTable.schemaVersion).toBe(2)
  })

  it('keeps fact cells keyed by stable column identity when a column is removed', () => {
    const value = {
      ...table(), source: { kind: 'deconstruction', sourceNodeId: 'video-1', title: 'Reference', status: 'ready' },
      columnSetId: 'facts',
      columns: [{ columnId: 'visual', kind: 'builtin', labelKey: 'visual', order: 2, visible: true }],
      rows: [{ rowId: 'fact-1', order: 1, startSeconds: 0, endSeconds: 3, durationSeconds: 3, carriedOver: false,
        keyframeRef: 'nomi-local://project/frame.png', cells: { removed: 'old', visual: 'A doorway' } }],
    }
    const restored = shotTableDocumentSchema.parse(value)
    expect(restored.rows?.[0].cells.visual).toBe('A doorway')
    expect(shotTableDocumentSchema.safeParse({ ...value, rows: [...value.rows, ...value.rows] }).success).toBe(false)
    expect(shotTableDocumentSchema.safeParse({ ...value, rows: [{ ...value.rows[0], keyframeRef: 'data:image/png;base64,AA==' }] }).success).toBe(false)
  })
})

describe('shot time precision is owned by the persistence boundary', () => {
  const factsTable = (rows: unknown[], sourceDuration?: number) => ({
    ...table(),
    source: {
      kind: 'deconstruction', sourceNodeId: 'video-1', title: 'Reference', status: 'ready',
      ...(sourceDuration === undefined ? {} : { durationSeconds: sourceDuration }),
    },
    columnSetId: 'facts',
    columns: [{ columnId: 'visual', kind: 'builtin', labelKey: 'visual', order: 0, visible: true }],
    rows,
  })

  // 老项目里已经躺着的长小数：读入口归一，显示层不写任何 round。
  it('normalizes long-decimal rows already saved in a project', () => {
    const legacy = factsTable([
      { rowId: 'fact-1', order: 1, startSeconds: 0, endSeconds: 1.4681260000000001,
        durationSeconds: 1.4681260000000001, carriedOver: false, cells: {} },
      { rowId: 'fact-2', order: 2, startSeconds: 1.4681260000000001, endSeconds: 3.9033329999999998,
        durationSeconds: 2.4352069999999997, carriedOver: false, cells: {} },
    ], 3.9033329999999998)
    const restored = readShotTable({ shotTable: legacy })
    expect(restored?.rows?.map((row) => [row.startSeconds, row.endSeconds, row.durationSeconds]))
      .toEqual([[0, 1.5, 1.5], [1.5, 3.9, 2.4]])
    expect(restored?.source.kind === 'deconstruction' && restored.source.durationSeconds).toBe(3.9)
    // 没有一个数字的字面量还带尾数——这正是用户看到的那一串。
    for (const row of restored?.rows ?? []) {
      for (const value of [row.startSeconds, row.endSeconds, row.durationSeconds]) {
        expect(String(value)).toMatch(/^\d+(\.\d)?$/)
      }
    }
  })

  it('derives duration from the quantized ends instead of trusting a stale cached subtraction', () => {
    const drifted = factsTable([{ rowId: 'fact-1', order: 1, startSeconds: 1.5, endSeconds: 3.9,
      durationSeconds: 99, carriedOver: false, cells: {} }])
    expect(readShotTable({ shotTable: drifted })?.rows?.[0].durationSeconds).toBe(2.4)
  })

  it('heals the saved copy through the normalizing write boundary, and is idempotent', () => {
    const meta = { shotTable: factsTable([{ rowId: 'fact-1', order: 1, startSeconds: 0.04999,
      endSeconds: 2.0500001, durationSeconds: 2.0000101, carriedOver: false, cells: {} }]) }
    const once = normalizeShotTableMeta(meta)
    expect((once.shotTable as { rows: Array<{ startSeconds: number; endSeconds: number }> }).rows[0])
      .toMatchObject({ startSeconds: 0, endSeconds: 2.1, durationSeconds: 2.1 })
    expect(normalizeShotTableMeta(once)).toEqual(once)
  })
})
