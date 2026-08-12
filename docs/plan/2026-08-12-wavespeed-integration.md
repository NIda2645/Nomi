# WaveSpeed AI 接入（契约已实测，待落地）

> 2026-08-12。用户提供 key，已跑通真实生成。本文记录**实测得到的契约**与一个改变设计的发现，
> 供下一轮直接执行——不必重做调研。

## 一、为什么选它

在未接入的媒体聚合站里，它与 Nomi 现有形状最贴：Bearer 鉴权 + 提交/轮询 + JSON。
端点探测（`curl` 打空 key）结果：

| 供应商 | 探测 | 结论 |
|---|---|---|
| WaveSpeed | `401` + `"Send it as: Authorization: Bearer <key>"` | 端点在、路径对，报错自带鉴权说明 |
| PiAPI | `401 Invalid API key` | 端点在，走 `x-api-key` |
| fal.ai | `401 Cannot access application "fal-ai/veo3.1"` | 端点在，模型 id 也解析对了 |
| Runware | `401 missingApiKey` | 端点在，数组体被接受 |
| CometAPI | **`404 Invalid URL`** | 路径不存在 |

**CometAPI 的 404 再次印证 G1**：那条路径来自 `cometapi.com/how-to-use-…` 教程页而非 API reference。
两周内第二次被转述坑到（第一次是 Runware 转述漏掉 apimart「首尾帧必须 adaptive」）。

## 二、实测契约（真实调用得来，非文档转述）

```
提交  POST https://api.wavespeed.ai/api/v3/bytedance/seedance-2.5/text-to-video
      Authorization: Bearer <key>
      { prompt, resolution, duration, aspect_ratio, generate_audio }

响应  { code:200, data: { id, model, input, outputs: [], status: "created",
                          urls: { get: "https://api.wavespeed.ai/api/v3/predictions/{id}/result" } } }

轮询  GET  https://api.wavespeed.ai/api/v3/predictions/{id}/result
      状态词：created → processing → completed（失败态未实测，推测 failed）
      产物：data.outputs[0]  —— 字符串数组，直接就是 URL
```

**实测发现（文档没写）**：提交响应里 `data.urls.get` 直接给出轮询地址，不必自己拼。
建议仍按 `providerMeta.task_id` 拼固定路径（与其它供应商同构），但知道有这条更稳的路。

真实生成验证：480p / 4s / 16:9 → 176 秒完成，产物为 CloudFront mp4 URL。花费约 $0.6（试用额度内）。

## 三、改变设计的发现：**同一个模型，WaveSpeed 的口径比 kie/apimart 窄**

抓 `wavespeed.ai/models/bytedance/seedance-2.5/image-to-video` 官方页：

| 项 | kie / apimart | **WaveSpeed** |
|---|---|---|
| 参考图 | 30 张数组 | **只有单张 `image`** |
| 尾帧 | `image_with_roles` / `last_frame_url` | **`last_image`（单张）** |
| 参考视频 / 音频 | 10 / 10 | **没有** |
| 清晰度 | 480p / 720p | **480p / 720p / 1080p / 4k** |

**所以不能复用现有 `seedance-2.5` 档案。** 那份声明了 30 图 + 10 视频 + 10 音频 + `image_with_roles`，
套上去用户会看到一堆 WaveSpeed 根本不收的槽位——填了也白填，正是「档案声明的能力通道不支持」那类坑。
按既有判据（vendorParams=B 只差参数值；能力结构差异用独立档案=A），这里是 **A：独立档案**。

⚠️ 调研阶段的二手资料说 WaveSpeed 支持 30/10/10 —— 那是抄的**模型**宣传页，不是 WaveSpeed 的
**端点**文档。接别家时同样要分清「模型能做什么」和「这个通道开放了什么」。

## 四、待落地清单（G2：一次接完）

- [ ] `electron/catalog/wavespeedVendor.ts`：create op（`/api/v3/{model_path}`）+ query op
      （`/api/v3/predictions/{{providerMeta.task_id}}/result`，`response_mapping` 取 `data.status` /
      `data.outputs.0`），状态词表 created|processing→running、completed→succeeded、failed→failed
- [ ] `electron/catalog/wavespeedVideos.ts`：模型 + mapping。**每个能力是独立端点路径**
      （t2v / i2v / video-edit / video-extend / i2v-turbo / i2v-spicy），与别家「一个端点 + model 字段」
      不同 —— mapping 的 path 要随模式变，用 mode 的 transportTaskKind 分流
- [ ] `src/config/modelArchetypes/seedance25Wavespeed.ts`：单图首帧 + 可选尾帧，无多模态参考；
      resolution 四档；**必填 `sources`**（G1 门岗会拦）
- [ ] 注册进 `seedBuiltins.ts` + `MODEL_ARCHETYPES` + 跑 `gen:archetype-defaults`
- [ ] 其余模型（Kling 3.0 / Veo 3.1 / Nano Banana Pro / Flux 3 / Seedream 5.0）逐个对账端点与字段，
      **别假设与 Seedance 同形状**——本次已证明同一家内不同模型的端点路径与字段都不一样
- [ ] 真实生成 E2E（t2v 已验；i2v 需再跑一条）+ 真机走查

## 五、注意

- key 是用户给的试用额度，只走环境变量、不落盘（本文件不含 key）。
- 定价按秒计，480p 4 秒约 $0.6；跑验证挑最短最低清晰度。
