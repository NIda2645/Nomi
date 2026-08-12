# 供应商官方 API 文档地址簿

> **为什么有这份文件**：2026-08-12，Seedance 2.5 档案里 4 个契约数字（参考图/视频/音频上限、
> 比例默认值）全是我们自己填的，而文件头注释写着「契约逐项对账自 kie 官方文档」。
> 复核时才发现没人知道该去哪查——文档地址散落在各文件注释里，等于没有。
>
> **真相源是档案里的 `sources` 字段**（结构化、有门岗 `pnpm run check:archetype-sources`）。
> 这份 Markdown 是给人看的索引，别在这里单独维护契约细节——细节写在档案的 `covers` 里。

## 接一个新模型的完整清单（规则 G2：一次接完）

接入 = 把该模型在该供应商下的**全部**能力对完，不是「先接个能跑的」。逐项过：

| # | 必对项 | 常见坑 |
|---|---|---|
| 1 | 端点 + 方法 + 鉴权 | base 路径各家不同（kie `/api/v1/jobs/createTask` vs apimart `/v1/videos/generations`）|
| 2 | 每条参考通道的**字段名** | 同一模型不同家名字不同：kie `reference_image_urls` / apimart `image_urls` |
| 3 | 每条参考通道的**上限** | ← 就是这次栽的地方。别拍脑袋填 |
| 4 | 首尾帧怎么表达 | kie 用独立字段 `first_frame_url`；apimart 用 `image_with_roles[].role` |
| 5 | 标量参数的枚举 / 默认 / 范围 | 默认值尤其容易自己填（16:9 vs adaptive）|
| 6 | 模式互斥约束 | 如首尾帧与多模态参考不可混用 |
| 7 | 供应商级硬约束 | 如 apimart：首尾帧模式 `size` 必须 `adaptive` |
| 8 | 轮询端点 + 状态词表 | |
| 9 | 产物在响应里的确切路径 | apimart 是 `data.result.videos[0].url[0]`（数组套数组）|
| 10 | 计费口径 | 如 `duration: -1` 按 30s 预扣后退差价 |

**没查到的写「文档未写明」，不许填我们猜的。** 猜的数字比缺失更坏——缺失会被发现，猜的会被当成真的。

## 地址簿

### kie.ai
- 市场首页：https://docs.kie.ai/market
- Seedance 2.5：https://docs.kie.ai/market/bytedance/seedance-2-5
- 提交任务统一入口 `POST /api/v1/jobs/createTask`，`model` 字段选模型，参数放 `input`
- ⚠️ 网页版 kie.ai（非 docs 子域）对抓取返回 403，用 `docs.kie.ai`

### apimart
- 文档站：https://docs.apimart.ai/cn/api-reference
- Seedance 2.5：https://docs.apimart.ai/cn/api-reference/videos/doubao-seedance-2-5
- 视频统一入口 `POST /v1/videos/generations`，轮询 `GET /v1/tasks/{task_id}`
- 密钥：https://apimart.ai/keys

### 火山方舟（volcengine）
- 待补

### 其余供应商
档案的 `sources` 字段是真相源；这里只列反复要查的几家。补齐进度看
`scripts/archetype-sources-baseline.json`（棘轮，只减不增）。
