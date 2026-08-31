export type NativeFileBridgeDeps = {
  getPathForFile: (file: File) => string
  invoke: (channel: string, payload: Record<string, unknown>) => Promise<unknown>
}

/** Resolve the native path inside preload and overwrite any renderer field. */
export function importNativeFileFromPreload(
  file: File,
  payload: Record<string, unknown>,
  deps: NativeFileBridgeDeps,
): Promise<unknown | null> {
  const sourcePath = deps.getPathForFile(file)
  if (!sourcePath) return Promise.resolve(null)
  return deps.invoke('nomi:assets:import-native-file', { ...payload, sourcePath })
}
