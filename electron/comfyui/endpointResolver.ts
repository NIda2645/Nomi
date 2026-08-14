export type ComfyuiEndpoint =
  | "features"
  | "systemStats"
  | "objectInfo"
  | "prompt"
  | "history"
  | "queue"
  | "interrupt"
  | "ws";

/** 保留用户配置里的路径前缀（反向代理可能把 ComfyUI 挂在子路径），只补协议和去尾斜杠。 */
export function normalizeComfyuiBaseUrl(baseUrl: string): string {
  const value = String(baseUrl || "http://127.0.0.1:8188").trim() || "http://127.0.0.1:8188";
  return (/^https?:\/\//i.test(value) ? value : `http://${value}`).replace(/\/+$/, "");
}

export function comfyuiEndpoint(baseUrl: string, endpoint: ComfyuiEndpoint, id?: string): string {
  const base = normalizeComfyuiBaseUrl(baseUrl);
  const paths: Record<Exclude<ComfyuiEndpoint, "history" | "ws">, string> = {
    features: "/features",
    systemStats: "/system_stats",
    objectInfo: "/object_info",
    prompt: "/prompt",
    queue: "/queue",
    interrupt: "/interrupt",
  };
  if (endpoint === "history") return `${base}/history/${encodeURIComponent(String(id || ""))}`;
  if (endpoint === "objectInfo" && id) return `${base}/object_info/${encodeURIComponent(id)}`;
  if (endpoint === "ws") return `${base.replace(/^http/i, "ws")}/ws`;
  return `${base}${paths[endpoint]}`;
}

/** Jobs 是官方新 API 命名空间；base 本身已以 /api 结尾时不重复追加。 */
export function comfyuiJobCancelEndpoint(baseUrl: string, promptId: string): string {
  const base = normalizeComfyuiBaseUrl(baseUrl);
  const apiBase = /\/api$/i.test(base) ? base : `${base}/api`;
  return `${apiBase}/jobs/${encodeURIComponent(promptId)}/cancel`;
}

export function comfyuiWebSocketUrl(baseUrl: string, clientId: string): string {
  const url = new URL(comfyuiEndpoint(baseUrl, "ws"));
  url.searchParams.set("clientId", clientId);
  return url.toString();
}
