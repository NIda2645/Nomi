import type { HttpOperation } from "./types";

/** Agnes 供应商种子（裸 baseUrl + bearer；providerKind 缺省 openai-compatible，文本走 /v1/chat/completions）。 */
export const AGNES_VENDOR_SEED = {
  key: "agnes",
  name: "Agnes AI",
  baseUrl: "https://apihub.agnes-ai.com",
  authType: "bearer" as const,
  authHeader: "Authorization",
} as const;

/** AGNES status 动词 → 归一态。 */
export const AGNES_STATUS_MAPPING: Record<string, string[]> = {
  queued: ["queued", "pending", "submitted"],
  running: ["in_progress", "processing", "running"],
  succeeded: ["completed", "succeeded", "success"],
  failed: ["failed", "error", "cancelled"],
};

// Checked 2026-08-26: actual responses return top-level url; current docs also use metadata.url.
// remixed_from_video_id is now null, not an output URL contract.
export const AGNES_VIDEO_QUERY_OP: HttpOperation = {
  method: "GET",
  path: "/agnesapi",
  headers: { Authorization: "Bearer {{user_api_key}}" },
  query: { video_id: "{{providerMeta.video_id}}" },
  response_mapping: {
    task_id: "video_id",
    status: "status",
    video_url: ["url", "metadata.url"],
    error_message: "error",
  },
};

// 2.5 keyframe/reference queries require the model; supply it for all 2.5 modes.
export const AGNES_VIDEO_25_QUERY_OP: HttpOperation = {
  ...AGNES_VIDEO_QUERY_OP,
  query: { ...AGNES_VIDEO_QUERY_OP.query, model_name: "{{model.modelKey}}" },
};
