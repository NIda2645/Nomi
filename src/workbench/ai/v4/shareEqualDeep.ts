function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Reuse equal subtrees while preserving identity for functions and non-plain objects. */
export function replaceEqualDeep<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous

  if (Array.isArray(previous) && Array.isArray(next)) {
    let equal = previous.length === next.length
    const shared = next.map((value, index) => {
      const item = replaceEqualDeep(previous[index], value)
      if (!Object.is(item, previous[index])) equal = false
      return item
    })
    return equal ? previous : shared as T
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    const previousKeys = Object.keys(previous)
    const nextKeys = Object.keys(next)
    let equal = previousKeys.length === nextKeys.length
    const shared: Record<string, unknown> = {}
    for (const key of nextKeys) {
      const value = replaceEqualDeep(previous[key], next[key])
      shared[key] = value
      if (!Object.prototype.hasOwnProperty.call(previous, key) || !Object.is(value, previous[key])) equal = false
    }
    return equal ? previous : shared as T
  }

  return next
}
