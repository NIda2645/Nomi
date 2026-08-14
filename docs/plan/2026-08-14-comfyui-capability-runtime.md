# ComfyUI 能力协商运行时：方案、对比与验收

> 分支：`codex/comfyui-runtime-20260814`
> 基线：`origin/main@e20724eb0c9d1836caf8248e6daffd9faf9ba0a6`
> 官方证据快照：ComfyUI `7fe8a6138504f90ff7be82f3babf416da32876b1`、ComfyUI Frontend `fb24726a9d358922d524349a36bcf6eb886407d3`（2026-08-14）

## 目标

把 Nomi 现有的“能提交本地 ComfyUI 工作流”升级成可长期兼容的实例级运行时：连接一次识别能力，任务从提交前就建立会话，实时事件有明确归属，最终结果以 history 为准，取消不会误伤同一 ComfyUI 上的其他任务。

用户侧目标不是增加一套新页面，而是让已有的“模型设置 → ComfyUI → 工作流设置”稳定工作：导入多条工作流不再重复下载大体积节点清单；开始生成后立即出现对应任务的排队、节点进度和预览；取消只取消自己点的任务；旧版 ComfyUI 仍可生成并得到明确的降级反馈。

## 已确认基线

- 最新主线构建通过，既有 ComfyUI 工作流 UI 旅程通过，10 张基线截图无 console/page error。
- 已有能力：多实例地址、`/system_stats` 探测、API workflow 导入、UI workflow 借官方前端转换、`/object_info` 缺件对账、`/prompt` 提交、`/history/{id}` 轮询、WS 进度/旧预览、取消入口。
- 不推翻 2026-08-12 已拍板的设置页布局。协议升级复用现有连接卡、工作流整页和生成遮罩。

## 对比结论

### ComfyUI 官方协议

官方文档与源码共同给出的稳定接入面：

| 能力 | 官方接口/消息 | 本轮设计 |
| --- | --- | --- |
| 实例探测 | `GET /system_stats` | 保留，作为“是否在线”的轻探测 |
| 节点和模型能力 | `GET /object_info` | 实例级缓存、并发合并、批量工作流一次对账 |
| 版本能力 | `GET /features`、WS 首消息 feature flags | 保存实例能力快照；不支持时回落旧协议 |
| 提交 | `POST /prompt` | 客户端预生成 UUID `prompt_id`，使用会话唯一 `client_id` |
| 实时状态 | `GET /ws?clientId=...` | 提交前建连；按 `prompt_id` 精确路由 |
| 预览 | WS 二进制 event 1/4 | event 4 读取 `prompt_id/node_id`；event 1 才回落当前任务猜测 |
| 最终结果 | `GET /history/{prompt_id}` | 继续作为最终事实来源，WS 只负责即时反馈 |
| 取消 | `/api/jobs/{id}/cancel`；旧服队列删除 | 先尝试原子定向接口；404/405 时只删排队项，绝不主动全局 interrupt |
| 可复现元数据 | `extra_data.extra_pnginfo.workflow` | 保留原始 UI workflow 时随任务提交 |
| 路由兼容 | 标准路由 + 新 `/api/jobs/*` | resolver 统一 base URL/子路径；只有 cancel 在 404/405 时做安全回退 |

官方资料：

- <https://docs.comfy.org/development/comfyui-server/comms_routes>
- <https://docs.comfy.org/development/comfyui-server/comms_messages>
- <https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/websockets_api_example.py>
- <https://github.com/Comfy-Org/ComfyUI_frontend>

### basketikun/infinite-canvas

已同步 `basketikun/infinite-canvas@b66936d` 并检查当前树、全部远端分支和 git 历史。当前实现没有 ComfyUI 专属设置或协议代码，也没有 `/prompt`、`/history`、`/object_info`、`/ws`。它的设置是浏览器本地保存的 OpenAI 兼容“渠道 → 模型 → 能力 → 可选自定义脚本”。

可借鉴：配置分层清楚；模型可声明 image/video/text/audio 能力；用户可在默认协议不匹配时写自定义脚本。

不可照搬：浏览器直接请求本地 `8188` 会遇到 CORS/CSP/HTTPS mixed-content；自定义脚本没有 ComfyUI 的队列、二进制预览、workflow 图、缺节点/模型对账和定向取消语义；也无法证明一个任务从提交到终态的协议一致性。

### 其他开源实现

- ComfyUI Frontend：最权威的 workflow → API prompt 转换和 WS 消息消费参考，Nomi 继续复用其 `graphToPrompt`，不自行重写图转换器。
- Krita AI Diffusion：成熟的本地 ComfyUI 客户端，值得借鉴连接生命周期、缺模型/节点诊断、任务队列和取消；它不是无限画布，交互不能直接复制。
- SwarmUI / Stability Matrix：适合参考 ComfyUI 实例管理、路由兼容和能力探测；它们也不是 Nomi 的节点画布运行时。
- InvokeAI Canvas 等开源画布使用自己的后端编排，并非“连接任意本地 ComfyUI workflow”，不能作为协议兼容实现的替代证据。

结论：没有发现一个可直接移植到 Nomi 的、已经完整接好本地 ComfyUI workflow 的通用无限画布。可靠方案应以 ComfyUI 官方协议为主、成熟客户端的生命周期设计为辅。

## 当前问题与根因

| 问题 | 根因 | 影响 |
| --- | --- | --- |
| 20 条 workflow 可请求 20 次全量 `/object_info` | UI 逐条 IPC；每条 IPC 都先 bust 缓存；没有 in-flight 合并 | 设置页慢、局域网和 ComfyUI 主线程压力大 |
| 多个 Nomi 窗口/会话都叫 `nomi` | mapping 和 WS 写死 `client_id` | 事件可能串任务，无法可靠定向 |
| WS 在 `/prompt` 返回后才登记 | 提交属于通用 HTTP transform，实时层在 renderer 后补 | 快任务会丢 execution_start/首帧/甚至终态 |
| 旧预览靠“当前 prompt”猜 | 只解析 event 1，不理解 event 4 metadata | 同实例并发时预览可能归错节点 |
| 没有 feature negotiation | 未调 `/features`，WS 也未声明 feature flags | 新协议用不上，旧协议降级靠猜 |
| 取消双发 `/interrupt` + `/queue delete` | 没有能力快照和任务状态区分 | 老服务器 `/interrupt` 可能打断别人的当前任务 |
| 导入 UI workflow 后丢原图 | 转换后只保存 API prompt 文本 | 无法提交 `extra_pnginfo.workflow`，可复现性下降 |
| ComfyUI 请求路径分散 | 通用 mapping 直接拼旧路由 | `/api` 新路由、fallback 和错误语义无法统一 |

## 架构

```text
Renderer settings                       Renderer canvas
  batch reconcile IPC                     catalogTaskActions
          |                                watch -> run -> history
          v                                      |
objectInfo + capabilityStore                    v
          |                         preload IPC -> progressSocket
          +--> endpointResolver                 |       |
          |                                     WS      cancel
          +--> /features, /object_info           |
                                                +--> clientSession
Generic catalog mapping -> request transform -> /prompt + /history
```

职责：

- `endpointResolver.ts`：规范化 base URL/反代子路径，集中 features、object info、history、WS 和 jobs cancel URL。
- `capabilityStore.ts`：每个 ComfyUI origin 一个带 TTL 的 capability snapshot，合并并发请求。
- `clientSession.ts`：主进程会话唯一 `clientId`、任务 UUID 校验、WS feature flags。
- `comfyuiProgressSocket.ts`：每实例单连接、提交前 ready、event 1/4 预览解析、按 prompt 精确路由、断线重连与安全取消。
- `catalogTaskActions.ts`：Renderer 预生成 `promptId`，先等 watcher 登记，再走既有通用 catalog 提交/轮询。
- `comfyui-prompt` request transform：在 HTTP 发出前收口真实 `client_id/prompt_id`，并保留 partial targets 和 workflow 元数据。

接线边界：保留现有 Catalog `HttpOperation` 作为提交/history 主链，只在 ComfyUI mapping 上声明 request/response transform；实时与取消由已有 preload IPC 桥接。其他 Provider 的请求构造和 Catalog 数据结构不变。

## 关键取舍

| 决策 | 选择 | 原因 |
| --- | --- | --- |
| WS 与 history | WS 即时、history 最终 | WS 可断线/丢早期消息；history 可恢复 |
| client/prompt ID | 主进程 session UUID + 每任务 UUID | 并发归属明确，支持提交前 watch 和定向取消 |
| 能力发现 | `/features` + 保守探测 + 兼容回退 | 不用版本字符串猜行为 |
| 旧服取消 | 排队任务可 queue delete；运行任务无定向能力则提示不支持 | 不以“取消我的任务”为名全局打断别人的任务 |
| UI workflow | API prompt 负责执行，原 UI workflow 负责元数据 | 执行稳定且可在 ComfyUI 中复现/继续编辑 |
| TLS | 遵循系统校验 | 不添加默认跳过证书校验的安全后门 |
| UI | 复用现有页面，只补状态和人话 | 当前布局已走查，问题核心在协议可靠性 |

## 分阶段实施

### A. 对账性能和能力快照

1. `/object_info` 缓存增加 in-flight Promise 合并。
2. 新增批量 reconcile IPC：一次解析所有 workflow、一次取能力索引、逐条返回结果。
3. 设置页按 vendor 一次批量调用；导入面板的“用户主动重检”仍可强制刷新。
4. 引入 `/features` capability snapshot 与 endpoint resolver。

验收：20 条 workflow 只命中一次 `/object_info`；两次并发能力请求共用一次 fetch；离线与坏 workflow 按条返回，不拖垮整批。

### B. 会话、提交和实时协议

1. 建立 session 唯一 `clientId`，每个任务预生成 UUID `promptId`。
2. WS 先 ready 后提交；首消息发送支持的 feature flags。
3. `/prompt` 发送 client/prompt ID、partial targets（能力支持时）和 UI workflow 元数据。
4. preview event 4 精确路由，event 1 仅作为串行旧服回退。
5. 终态仍轮询 history，重连后不重复提交。

验收：同步完成的快任务也能看到正确终态；同一实例两任务交错时进度/预览不串；WS 断开仍靠 history 成功收口。

### C. 安全取消和体验接线

1. 先请求 jobs cancel；只有 404/405 才回退 queue delete，不请求旧全局 interrupt。
2. 取消返回 `targeted/queue-only/failed` 明确结果。
3. UI 立即停止本地等待；服务端不支持安全取消时给非阻断说明，不显示假成功。
4. 连接卡展示协议模式和降级状态，但不新增第二套设置入口。

验收：排队任务只被删除；运行任务只定向取消；未知旧服不发送全局 interrupt；另一个并发任务不中断。

## 完整测试设计

### 1. 纯函数/单元测试

- URL 规范化、反代子路径、jobs cancel 的 404/405 回退，401/500 不错误回退。
- feature payload 消毒、TTL、in-flight 合并、离线 snapshot。
- event 1/4 二进制 frame 边界、大小限制、metadata prompt/node 提取。
- prompt body：client ID、客户端 prompt ID、partial targets、`extra_pnginfo.workflow`。
- cancel 决策矩阵，不允许未知能力走全局 interrupt。

### 2. 协议契约测试（本地 mock server）

覆盖新服、旧服、混合路由三组 fixture：

- `/features` 存在/404/500/异形；`/prompt` 回显客户端 UUID。
- WS 极快事件（在 HTTP response 前发）、交错双任务、断线重连、event 4 精确预览。
- history queued/running/success/error/interrupted；输出 image/video/3d。
- cancel queued/running/old-server；断言实际收到的 HTTP 请求集合。
- 20 workflow 批量对账请求计数必须等于 1。

### 3. Electron E2E

- 设置页连接本地 mock ComfyUI，导入 API/UI 两种 workflow，保存、重开、重检。
- 从真实画布节点发起两次并发生成，检查排队、进度、预览、完成资产、取消和重试。
- 关闭/重开设置页和项目，不遗留 WS listener、registry 或重复请求。
- 捕获 console error、page error、主进程错误和未处理 Promise。

### 4. 真实 ComfyUI 验证

用官方最新稳定版和一个可运行的最小 workflow：

1. `/features` 与能力快照实录。
2. API workflow 生成成功，history 输出落到 Nomi 资产。
3. UI workflow 导入后，生成记录可在 ComfyUI 继续打开。
4. 两任务并发，预览归属和取消隔离正确。
5. 重启 ComfyUI 后 Nomi 自动恢复连接，未完成任务只查询、不重提。

真实服务器未提供模型时，至少用 `EmptyImage -> SaveImage` CPU workflow 验证全协议；模型生成质量不属于本轮协议验收。

### 5. 视觉和主线门禁

- 桌面 1440x900、移动窄宽设置页截图；生成中、离线、降级、不支持安全取消四状态。
- 画布像素检查：遮罩、预览和取消控件不改变节点尺寸、不重叠、不闪动。
- `check:filesize`、`check:tokens`、`check:i18n`、`lint:ci`、`typecheck`、`test`、`build` 全过。

## 六角色预审

- 产品：范围聚焦“真实可接入和可靠使用”，不新增模板市场或远程托管。
- 交互：沿用已有设置入口；技术降级翻译成“已连接/兼容模式/安全取消不可用”，不暴露协议名词堆。
- 前端：批量 reconcile 需要 seq/abort 防切实例串台；状态更新一次提交，避免 20 次 React render。
- 后端：ComfyUI 专属 job manager 位于通用 HTTP 前，必须保持其他 vendor 零行为变化；history 是最终真相。
- 测试：必须验证请求次数与“没有发出危险请求”，不能只断言返回值；极快任务与并发交错是必测竞态。
- 安全：只允许 catalog 中已确认的 ComfyUI origin；不关闭 TLS 校验；旧服不做可能全局中断的 `/interrupt`。

## 回滚

- A 可独立回滚为单条 reconcile；保留 in-flight 合并不会改变结果语义。
- B/C 由 ComfyUI vendor 分支隔离；异常时可切回旧 mapping 提交 + history 轮询，其他 Provider 不受影响。
- capability snapshot 只存内存，不迁移用户数据；新增 draft 字段向后兼容，旧 workflow 继续用 API prompt。

## 完成定义

- 自动测试、Electron E2E、真实 ComfyUI 协议验证和视觉走查均有可复跑命令与结果。
- 功能分支仅包含本方案相关文件，每个切片有独立 commit。
- 推送 `codex/comfyui-runtime-20260814` 并创建 PR；不直接推或合并 `main`，最终由用户验收。
