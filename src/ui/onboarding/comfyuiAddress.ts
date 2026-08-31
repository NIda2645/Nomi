export function normalizeComfyuiAddressInput(value: string): string {
  const address = value.trim() || 'http://127.0.0.1:8188'
  return (/^https?:\/\//i.test(address) ? address : `http://${address}`).replace(/\/+$/, '')
}
