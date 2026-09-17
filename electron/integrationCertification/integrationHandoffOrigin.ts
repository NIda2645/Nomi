/**
 * 交接单展示用的 origin：只保留「能给用户看的那部分」。
 *
 * 从 integrationSession.ts 抽出来（R9：那份是已知巨壳，基线只减不增，而它本来就是一个纯函数、
 * 与会话状态无关）。行为逐字不变——权威的公网/内网判定仍在 handoffQueue 那一侧，这里只是
 * 不把内网 origin 放进展示载荷，避免本地 ComfyUI/供应商接入连打开安全页都失败。
 */
export function safeHandoffOrigin(baseUrl: string): { origin?: string } {
  try {
    const parsed = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return {};
    }
    // handoffQueue performs the authoritative public/private check. Keep a
    // private origin out of the display payload rather than making opening the
    // credentials page fail for a local ComfyUI/provider connection.
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    )
      return {};
    return { origin: parsed.origin };
  } catch {
    return {};
  }
}
