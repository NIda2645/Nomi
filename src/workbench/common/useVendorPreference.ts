import * as React from 'react'
import { getVendorPreference, setVendorPreference } from '../api/vendorPreferenceApi'
let order: string[] = []
let loaded = false
let promise: Promise<void> | null = null
const listeners = new Set<() => void>()
function notify(): void { for (const listener of listeners) listener() }
export function loadVendorPreference(): Promise<void> {
  if (promise) return promise
  promise = getVendorPreference().then((value) => { order = value.orderedVendorKeys; loaded = true; notify() }).catch(() => { loaded = true; notify() }).finally(() => { promise = null })
  return promise
}
export function useVendorPreferenceOrder(): readonly string[] {
  React.useEffect(() => { void loadVendorPreference() }, [])
  return React.useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => order, () => order)
}
export async function saveVendorPreferenceOrder(next: readonly string[]): Promise<void> {
  const value = await setVendorPreference(next)
  order = value.orderedVendorKeys; loaded = true; notify()
}
export function vendorPreferenceLoaded(): boolean { return loaded }
/** 非 React 的纯派生层读同一份缓存（与 useVendorPreferenceOrder 同源），用于「旧数据落哪家」的同一把尺。 */
export function peekVendorPreferenceOrder(): readonly string[] { return order }
