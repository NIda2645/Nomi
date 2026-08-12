// 「自定义配置」的行 ↔ 存储对象转换（纯函数，便于钉住边界情况）。
//
// 存储形态是 `vendor.meta.customConfig`（Record<string,string>），编辑形态必须是**有序数组**：
// 用户在表格里加/删/改行，对象没有稳定顺序，直接用对象做 state 会让行在每次输入后乱跳。
//
// 注入端在 electron/catalog/customCallRunner.ts 的 customConfigOf()——那边同样只收字符串值。

export type CustomConfigRow = { name: string; value: string }

/** 存储对象 → 编辑行。按键名排序，保证每次打开顺序一致（对象自身的插入序不可依赖）。 */
export function configRowsFromRecord(raw: unknown): CustomConfigRow[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>)
    .filter(([name]) => name.trim().length > 0)
    .map(([name, value]) => ({
      name: name.trim(),
      value: typeof value === 'string' ? value : value == null ? '' : String(value),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 编辑行 → 存储对象。
 * - 名字为空的行**整行丢弃**：用户点了「加一条」还没填就保存是常态，不该存个空键。
 * - 值为空但名字有的**保留**：有的服务就是要一个空串（或用户想先占位），替他判断等于替他做决定。
 * - 重名后者覆盖前者，与对象语义一致；名字前后空格一律 trim（肉眼看不出的空格会让 config.x 取不到，
 *   这类「看起来对却不工作」最难查）。
 * - 全空 → 返回 undefined，让调用方把 customConfig 整个删掉，而不是存一个 {} 占位。
 */
export function configRecordFromRows(rows: readonly CustomConfigRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    out[name] = row.value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 有没有实际内容——决定折叠区默认展开还是收起。 */
export function hasCustomConfig(rows: readonly CustomConfigRow[]): boolean {
  return rows.some((row) => row.name.trim().length > 0)
}
