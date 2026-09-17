// Higgsfield（higgsfield.ai）供应商种子 —— 官方端点直连，不经中转。
//
// 契约**不是抄文档抄来的**，是 2026-09-17 从服务端校验器一手反推 + 字节级实测的，
// 逐条证据在 docs/evidence/2026-09-17-higgsfield-contract/（含探针原文）。
// 反推法：生成端点是 FastAPI/Pydantic 且静默忽略未知字段，所以给字段塞一个类型/枚举
// 一定错的值——报错=该字段存在且这是它的真实约束，不报错=该字段不存在。
//
// 与 apimart/kie 同构（async create→poll），三处不同：
//   1) 鉴权是 `Authorization: Key <id>:<secret>`，**方案词不是 Bearer** → 用 vendor.authScheme 声明；
//   2) 状态词多一个文档没列的 `in_progress`，且 `nsfw` 是「被内容策略拒绝」的独立终态；
//   3) 有自己的文件上传通道（见 assetIngestionRegistry 的 higgsfield 条目），参考图不经第三方。
//
// baseUrl/path 约定（同 kie/apimart，避开 joinUrl 双前缀坑）：
//   vendor.baseUrl = "https://api.higgsfield.ai"（裸）
//   operation.path = 完整 "/higgsfield-ai/soul/v2/standard" / "/requests/{{providerMeta.request_id}}/status"

import type { HttpOperation } from "./types";

/**
 * Higgsfield 供应商种子。
 *
 * `authScheme: "Key"` —— 实测 `Authorization: Key <id>:<secret>` 认证通过（假 request-id 回 404
 * 而不是 401），换成无效 key 回 401，对照组成立。用户在设置里粘的就是 `id:secret` 这一整串。
 */
export const HIGGSFIELD_VENDOR_SEED = {
  key: "higgsfield",
  name: "Higgsfield",
  baseUrl: "https://api.higgsfield.ai",
  authType: "bearer" as const,
  authHeader: "Authorization",
  authScheme: "Key",
  credentialMode: "direct-key" as const,
  /**
   * 零成本存活探针：`/estimate/<slug>` 是官方的**报价**端点，返回价格、不排任务、不扣费
   * （2026-09-17 实测 200 `{"type":"estimate","credits":"0.050","usd":"0.004"}`）。
   * 用它而不是 `GET /models`：后者对两把不同额度的 key 返回逐字节相同的 76 条全局目录，
   * 证明不了「这把 key 能用」；而且它连 Soul Cinema / DoP 都没列（目录不是权威源）。
   * ⚠️ estimate **不判余额**：它 200 不代表这一单发得出去（余额不足是提交时的 403）。
   */
  livenessProbe: {
    request: {
      method: "POST",
      path: "/estimate/higgsfield-ai/soul/v2/standard",
      body: { prompt: "ping" },
    },
    successPath: "credits",
    source: { url: "https://docs.higgsfield.ai/docs/concepts/pricing", checkedAt: "2026-09-17" },
  },
  keyValidation: "liveness-probe" as const,
} as const;

/**
 * Higgsfield 的 status 动词 → 我们的归一态。
 *
 * **一张表，不散落**（这是本文件唯一一处状态词知识）。两条来自实测而非文档：
 * - `in_progress`：官方文档与调研都只列了 queued/completed/failed/nsfw/canceled，
 *   真实轮询里出现的却是它。只按文档写，它会落进 resolveTaskStatus 的「未知动词」分支。
 * - `nsfw`：内容策略拒绝，**是失败终态且自动退款**。归到 failed，让轮询立刻停；
 *   不归 succeeded（没有产物），也不留成未知（那会一直轮询到超时）。
 */
export const HIGGSFIELD_STATUS_MAPPING: Record<string, string[]> = {
  queued: ["queued"],
  running: ["in_progress"],
  succeeded: ["completed"],
  failed: ["failed", "nsfw", "canceled", "cancelled"],
};

/**
 * 创建响应里任务 id 的路径。实测形状：
 * `{"status":"queued","request_id":"…","status_url":"…","cancel_url":"…"}`
 */
export const HIGGSFIELD_CREATE_REQUEST_ID_PATH = "request_id" as const;

/** 每个 create op 都带这一份：把 request_id 存进 providerMeta.task_id（沿用全仓通用键名）。 */
export const HIGGSFIELD_PROVIDER_META_MAPPING = { task_id: HIGGSFIELD_CREATE_REQUEST_ID_PATH } as const;

/** 轮询路径（request_id 走路径参数，会被模板渲染）。 */
const STATUS_PATH = "/requests/{{providerMeta.task_id}}/status";

/**
 * 图片轮询 op（Soul 2 / Soul Cinema 共用）。
 * 终态载荷实测：`{"status":"completed", …, "images":[{"url":"https://…cloudfront.net/….png"}]}`
 * —— 注意 `images[].url` 是**裸字符串**，不是 apimart 那种数组。
 */
export const HIGGSFIELD_IMAGE_QUERY_OP: HttpOperation = {
  method: "GET",
  path: STATUS_PATH,
  response_mapping: {
    task_id: "request_id",
    status: "status",
    image_url: "images.0.url",
    error_message: "detail",
  },
};

/** 视频轮询 op（DoP 用）。产物键与图片平行（videos[].url）。 */
export const HIGGSFIELD_VIDEO_QUERY_OP: HttpOperation = {
  method: "GET",
  path: STATUS_PATH,
  response_mapping: {
    task_id: "request_id",
    status: "status",
    video_url: "videos.0.url",
    error_message: "detail",
  },
};
