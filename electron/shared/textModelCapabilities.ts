/** Missing metadata preserves existing API models; explicit false is authoritative. */
export function modelSupportsToolCalls(meta: unknown): boolean {
  return !(meta && typeof meta === "object" && (meta as { supportsToolCalls?: unknown }).supportsToolCalls === false);
}
