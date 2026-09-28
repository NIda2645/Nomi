# Higgsfield 契约实测（2026-09-17，一手，未用第三方镜像）

所有字段表**不是抄文档**，是用「必然被拒的探针」从服务端校验器反推出来的：
Higgsfield 的生成端点是 FastAPI/Pydantic，**未知字段被静默忽略**（实测：`{"__nonexistent_probe__":1}`
不报 `extra_forbidden`）。所以判据是——

> 给某个字段塞一个**类型/枚举一定错**的值：报错 ⇒ 该字段存在且这是它的真实约束；不报错 ⇒ 该字段不存在。

探针原文在 `probes/`（与本文件同目录）。探针都缺必填字段或被余额拦下，**没有产生任何生成任务**。

## 1. 鉴权

`Authorization: Key <id>:<secret>`（单个 header 值，冒号分隔，不是 Bearer）。
- 假 request-id + 有效 key → `404 {"detail":"Not found"}`（认证通过）
- 无效 key → `401 {"detail":"Invalid credentials"}`
- 未映射的 GET 路由一律 `405 Method Not Allowed` —— **405 不能证明路由存在**，只是网关兜底。

## 2. 三个旗舰模型的真实字段表（一手反推）

### Soul 2 — `POST /higgsfield-ai/soul/v2/standard`
| 字段 | 约束（服务端校验器原话） | 必填 |
|---|---|---|
| `prompt` | string | ✅ |
| `aspect_ratio` | `'9:16','16:9','4:3','3:4','1:1','2:3','3:2'` | |
| `resolution` | `'720p','1080p'` | |
| `batch_size` | `1` 或 `4` | |
| `enhance_prompt` | bool | |
| `seed` | int ≥ 1 | |
| `style_id` | UUID | |
| `style_strength` | float | |

**没有任何图片输入字段**（`image_url` / `image_urls` / `input_images` / `reference_image_url` 全部塞脏值不报错 ⇒ 不存在）。
Soul 2 是**纯文生图**；它唯一的「参考」是 `custom_reference_id`(UUID，Soul ID 身份)，不是图片 URL。

### Soul Cinema — `POST /higgsfield-ai/soul/cinema`
`prompt`(✅) / `aspect_ratio`(同上 7 值) / `resolution`(720p,1080p) / `batch_size`(1,4) / `enhance_prompt`(bool) / `seed`(≥1) / `custom_reference_id`(UUID)。
**没有** `style_id` / `style_strength` / `image_url`。
⚠️ Soul Cinema **不在 `GET /models` 目录里**，但端点是活的 —— 目录不是权威源。

### DoP — `POST /higgsfield-ai/dop/standard` | `/dop/turbo`
| 字段 | 约束 | 必填 |
|---|---|---|
| `prompt` | string | ✅ |
| `image_url` | URL | ✅ |
| `end_image_url` | URL | |
| `motions` | list of `{id, strength}`（两个子字段都必填） | |
| `enhance_prompt` | bool | |
| `seed` | int ≥ 1 | |

**推翻第三方镜像（mindcloud.co）的说法**：它给的 `duration` / `webhookUrl` **不存在**（塞脏值无错）；
`resolution` / `aspect_ratio` / `quality` / `batch_size` 也都不存在。
它没提到的 `end_image_url`（首尾帧）与 `motions`（运镜，DoP 的招牌）**才是真的**。
⇒ 按 R5「凭记忆/二手资料判断 = 没查」，这份表以服务端校验器为准。

## 3. 状态机（实测，含文档没写的一个词）

`queued → in_progress → completed | failed | nsfw | canceled`

**`in_progress` 是调研文档和官方文档都没有列出的**，是真实轮询里出现的（见 `probes/`）。
只按文档写 STATUS_MAPPING 会把它当未知动词。

终态载荷（真实录制，`probes/05-marketing-terminal.json`）：
```json
{"status":"completed","request_id":"…","status_url":"…","cancel_url":"…",
 "images":[{"url":"https://d3u0tzju9qaucj.cloudfront.net/…/….png"}]}
```

## 4. 文件上传（自有通道，字节级实测通过）

`POST /files/generate-upload-url` body **只有 `content_type` 必填**，枚举是服务端给的：
`image/png, image/jpeg, image/jpg, image/gif, image/webp, audio/x-wav, audio/wav, video/mp4`。

响应四个键：`{public_url, upload_url, content_type, upload_headers}`。

实测三项（8x8 PNG，75 字节）：
| 项 | 结果 |
|---|---|
| PUT 到 `upload_url`（**不带 Higgsfield 凭据**） | 200 |
| `GET public_url` 取回后 sha256 | `57cda64c…88921`，与本地**逐字节相同** |
| 有效期 | 见下，**与文档不符** |

### ⚠️ 文档说 1 小时，实际是两个不同的有效期
- `upload_url` 的 `X-Amz-Expires=3600` —— **1 小时**，这是「预签名上传窗口」。
- `public_url` 的对象保留：`x-amz-expiration: expiry-date="Fri, 25 Sep 2026", rule-id="Delete after 7 days"`
  —— **7 天**，这才是「参考图能被供应商读多久」。

文档把前者写成了整个上传的有效期。档案里 `ttlSeconds` 取 **7 天**（对象保留），不是 1 小时。

### ⚠️ `x-amz-tagging` 是被签名的头，漏了就 403
预签名 URL 的 `X-Amz-SignedHeaders = content-type;host;x-amz-tagging`。
实测：PUT 只带 `Content-Type`（现役 `upload-initiate-put` 今天的行为）→
**403 `SignatureDoesNotMatch`**；带上响应里的 `upload_headers` → 200。
⇒ 这就是本次要给 `upload-initiate-put` 加 `uploadHeadersPath` 的原因：
**PUT 头从供应商响应里读，不写死 `x-amz-tagging`**。

## 5. 域名（四个，都是公网 IP，无需白名单）

| 域名 | 用途 | 来源 |
|---|---|---|
| `api.higgsfield.ai` | API baseUrl | 固定 |
| `platform.higgsfield.ai` | 响应里的 `status_url` / `cancel_url` | **响应动态给**，与 baseUrl 不同域 |
| `fnf-api-input-prod-*.s3.amazonaws.com` | 上传 PUT 目标 | 响应动态给 |
| `d3snorpfx4xhv8.cloudfront.net` | 上传后的 `public_url` | 响应动态给 |
| `d3u0tzju9qaucj.cloudfront.net` | 生成产物 | 响应动态给，**与上传的 CF 分发不同** |

本仓库的出站策略是 **IP 类别制**（`electron/networkOutboundPolicy.ts:271` 只拒私网/不可解析），
**没有域名白名单**，故以上动态域名无需登记。

## 6. 拿不到的（不猜，标「待索要」）

| 缺口 | 证据 | 处置 |
|---|---|---|
| SOUL styles 列表（`style_id` 的合法 UUID） | `/soul-styles`、`/styles`、`/soul/styles`、`/higgsfield-ai/soul/styles` 全部 405（=未映射） | **不进档案**：没有清单就给不出选择器，也不许编枚举。待向 Higgsfield 索要 |
| `motions[].id` 的合法值 | 校验器只说 `id`/`strength` 必填，不给枚举 | 同上，DoP 的 `motions` 本次不进档案 |
| Marketing Studio Image / Soul ID 的参数表 | `input_schema` 为 `null`；官方文档页 404 | 不接（见报告） |

## 7. 余额观察（顺带，不是结论）

`POST /marketing-studio/image`（7.018 credits）在无额度的那把 key 上返回 `403 not_enough_credits`——
**403 是提交时才判的，`estimate` 不判余额**。所以 estimate 200 不代表这一单发得出去。
