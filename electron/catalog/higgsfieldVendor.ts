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
  credentialProbe: {
    request: {
      method: "POST",
      path: "/estimate/higgsfield-ai/soul/v2/standard",
      body: { prompt: "ping" },
    },
    successPath: "credits",
    // 零费用（2026-09-17 实测 200 `{"type":"estimate","credits":"0.050","usd":"0.004"}`，不排任务、不扣费）。
    // 对照组就在 T-MO-20 的账上：把 `POST /marketing-studio/image` 当探针时它**真排了任务**，
    // 烧掉 $0.439——所以这个 `free` 是实测出来的，不是从端点名字推的。
    cost: "free" as const,
    source: { url: "https://docs.higgsfield.ai/docs/concepts/pricing", checkedAt: "2026-09-17" },
  },
} as const;

/**
 * Higgsfield 的 status 动词 → 我们的归一态。**只声明共享词表不认识的那一个。**
 *
 * Higgsfield 实际会吐六个动词：`queued / in_progress / completed / failed / canceled / nsfw`。
 * 其中前五个 `resolveTaskStatus` 的通用词表已经认得（responseParsing.ts），
 * 再抄一份进这里不会改变任何行为，只会多一份会漂的并行映射（P1）——kie 当初正是
 * 因此**故意不带 statusMapping**。所以这里只留 `nsfw`。
 *
 * 为什么 `nsfw` 必须归 failed：它是内容策略拒绝，**有退款、没有产物**。落进未知分支的话
 * resolveTaskStatus 会乐观返回 queued 继续轮询，直到超时才判死——用户要多等一整个宽限期
 * 才看得到「这条被拒了」。
 *
 * 为什么不把 `nsfw` 加进通用词表：那会改掉所有供应商的行为（今天别家吐 nsfw 是走
 * 「未知动词 + 宽限期」那条路的），属于跨供应商的判据变更，不该顺手夹带在接一家的改动里。
 *
 * ⚠️ 这张表的正确性由 higgsfieldContract.test.ts 守着：那里既断言 nsfw 由**本表**认出
 * （删掉就红），也断言另外五个词确实被**通用词表**认出（上游若改词表，我们立刻知道）。
 */
export const HIGGSFIELD_STATUS_MAPPING: Record<string, string[]> = {
  failed: ["nsfw"],
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

/**
 * 视频轮询 op（DoP 用）。
 *
 * ⚠️ 产物键与图片**不对称**：图片是 `images: [{url}]`（数组），视频是
 * `video: {url}`（**单数对象**）。这一条是 2026-09-17 真机跑出来才发现的——
 * 本文件最初按「和图片平行」写成 `videos.0.url`，那样会一个字都取不到、
 * 任务明明成功却拿不到产物。录下来的终态在
 * fixtures/higgsfield/dop-terminal.json，测试打在它上面。
 */
export const HIGGSFIELD_VIDEO_QUERY_OP: HttpOperation = {
  method: "GET",
  path: STATUS_PATH,
  response_mapping: {
    task_id: "request_id",
    status: "status",
    video_url: "video.url",
    error_message: "detail",
  },
};
