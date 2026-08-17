# MCP 体验大修：一次真实拍片任务暴露的六类根因与修法

日期：2026-08-18 ｜ 触发：用户经 MCP 驱动 Nomi 拍《影子罢工了》60s 短片，全程 ~35 分钟、0 条视频产出、聊天里 0 张可见图、多次在桌面 App 来回点确认。
关联既有文档：`docs/research/2026-08-11-mcp-experience-research.md`（六缺口研究，本方案是它的落地版）、`docs/plan/2026-08-09-production-mcp-finalization.md`、`docs/audit/2026-08-09-production-mcp-adversarial-review.md`。

## 一、真实轨迹复盘（2026-08-17 晚，基线指标）

| 环节 | 调用数 | 结果 | 重试 | 耗时感受 |
|---|---|---|---|---|
| 建项目 | 1 | ✅ | 0 | 秒级 |
| 加 14 节点（一批） | 1 | ❌ `{ids:[],cancelled:true}`——App 内弹窗 65s 无人点自动取消 | 拆 1+4+4+5 四批重发，用户在 App 里点了 3 次允许 | ~3 分钟 |
| 连 23 条参考边 | 1 | ✅ | 0 | 秒级 |
| 生图（参考锚 ×2，各 2 抽） | 6 | 4 成 2 败（volcengine "API key missing"、kie 无 key） | 换渠道 ×2 | 每张 ~40s（模型侧，合理） |
| 生视频 | 2 | 0 成（apimart 双参考被 L3 闸拒发；kie 无 key） | — | 0 扣费（闸是对的） |
| 加首帧节点 | 1 | ❌ 60s 盲等后 "did not become ready"；此后 list_projects 连到 fixture 库 | 2 次重试无效 | 3+ 分钟 |
| 用户在聊天里可见的产物 | — | **0 张图、0 条进度** | — | 全程黑箱 |

用户四条原话对应：①来回去 App 点确认；②聊天里看不到生成的图；③MCP 建的节点只有提示词、选不了模型；④节点一竖排难看 + 目录/参数与真实能力对不上。

## 二、问题 → 根因 → 修法（全部 file:line 定位）

### P0-A 确认往返（用户痛点 ①）
- **根因**：`electron/capabilityCore/core.ts:203` 批量 ≥2 节点触发 `confirmPlan` → `gateway.ts:132-140` **只走 App 内渲染进程弹窗**（65s 超时即取消）。而 elicitation（MCP 规范里"服务端把确认问题递给聊天客户端、让用户在对话里直接点"的机制）**早已实现**：`mcpProtocol.ts:335`（initialize 时捕获 `clientSupportsElicitation`）、`:410-434`（`elicitBooleanConfirm`，300s 超时）、`:436/:444`（spend/creative-gate 助手），且已在「App 关着时的花钱确认」与 `nomi_decide_gate` 用上。08-11 研究已把 "elicitation 为第一路径" 定为方向，只是没接完。
- **修法**：`confirmPlan` 与花钱确认改 **elicitation-first**——客户端声明支持就把确认递到聊天里，App 弹窗降级为 fallback（客户端不支持/超时）。加节点这类**免费可逆**操作在 headless 模式本就自动放行（`gateway.ts:84-86`），App 开着时也不应更严：批量加节点降为「通知不拦截」或一次会话级信任。
- **结构保证**：harness 断言「一次 12 节点批量 add → 恰好 0 次 App 弹窗、≤1 次聊天内确认」。

### P0-B 聊天里什么都看不见（用户痛点 ②）
- **根因**（三层叠加）：
  1. 活面板 `ui://nomi/live-draft.html`（`mcpAppWidget.ts:218-509`，08-02 landed，commit b03e1f39）是 MCP Apps 资源，**Claude Code 这类宿主不渲染**（08-11 研究 §1 宿主矩阵已确认）——用户记忆"我做过"属实，做了但宿主不支持。
  2. 结果里缩略图是 `nomi-local://` 协议（`electron/protocol/localProtocol.ts:129` 只在 Electron 内注册），外部客户端解析不了。
  3. 工具结果**不带 MCP 原生图片 content block**，进度上 **zero progress notifications**（研究点名的第一缺口：`mcpProgress.ts` 基建在、没人调）。
- **修法**（可见性栈，按宿主能力降级）：
  1. 每个产图/产视频的工具结果附 `{type:"image"}` 缩略 block（自研 JSON-RPC 服务端 `mcpProtocol.ts` 手加即可，无 SDK 依赖）；
  2. 长调用全程发 `notifications/progress` 带阶段文案（「镜头 3/12 · 供应商已受理 · 已用 01:42」）——Claude Code 今天就能显示；
  3. `nextActions:["open_in_nomi"]` 改为同时给出结构化深链 URL（格式已存在：`nomi://project/{id}/run/{id}`，`mcpAppWidget.ts:154-156`），文本里也贴可点链接；
  4. 外部宿主的图片预览走已有的签名临时 HTTP（`artifactPreviewHttpServer`，`localProtocol.ts:6` 已用于 production preview 鉴权），不暴露绝对路径；
  5. MCP Apps 活面板保留，支持的宿主继续吃。
- **结构保证**：harness 断言「每个产物结果必含 imageBlock+deepLink；≥10s 的调用必有 ≥1 条 progress」。

### P1-C MCP 建的节点是残废（用户痛点 ③，P1 平行版之罪）
- **根因**：`electron/capabilityCore/canvasGraph.ts:141-168` 是一套**平行简化工厂**——只写 id/kind/title/position/size/prompt，**缺 `meta`（模型绑定容器）、`categoryId`、`renderKind`**。UI 路径（`src/workbench/generationCanvas/store/canvasNodeActions.ts:39-86`）经 `createGenerationNode()` + `getDefaultCategoryForNodeKind()` 全量初始化。且 kind `shot` 在 `nodes/registry.ts:176-186` 映射为纯文本描述节点（无 `executionKind`）→ `isGenerationNode=false` → `NodeParameterControls` 的模型选择器**整个不渲染**、`useNodeModelAutoSelect` 也不跑——所以用户看到"只有提示词，什么都选不了"。
- **修法**：删平行版（P1）：节点构造收敛到**共享领域工厂**（放 `src/domain` 层，渲染进程 store 与 capabilityCore 同吃），MCP 建的节点与 UI 建的完全同构（meta/categoryId/renderKind/自动选模全走同一条路）；`nomi_add_nodes` schema 增加可选 `vendor`/`modelKey`；MCP kind 语义表写进工具描述（`shot`=分镜描述节点、要可生成的视频节点用 `video`），避免调用方误建。
- **结构保证**：单测断言「MCP 工厂产出 ≡ UI 工厂产出（同 kind 同输入逐字段相等）」——平行版从结构上不可能再分叉。

### P1-D 一竖排布局（用户痛点 ④ 前半）
- **根因**：`canvasGraph.ts:148-159` 硬编码 x=0、y=index×320 纵向堆叠。UI 有 `resolveInsertionPosition()`（AABB 螺旋避让，`canvasNodeActions.ts:52-55`）和批量布局器 `generationCanvas/agent/trajectoryLayout.ts`，MCP 都没用。
- **修法**：随共享工厂一起把布局工具抽到共享层；批量 add 走 trajectoryLayout（锚一列、镜头按序成行），单个 add 走 resolveInsertionPosition。
- **结构保证**：布局快照测试（12 shot + 2 anchor 的批量 add 不重叠、按行分组）。

### P2-E 模型目录说谎 + 参数够不着（用户痛点 ④ 后半，"参数和真实对不上"）
- **根因**（三处失真）：
  1. `nomi_list_models`（`core.ts:180-192`）只过滤 `enabled`，**不验 key 也不验通道**——kie 无 key 也列为"可用"；
  2. volcengine key 在 `model-catalog.json` 里**存在但解不开**：`secrets.ts:123-137` safeStorage 解密绑 Electron 应用身份，capability 宿主身份不匹配时静默返回空串（`host.ts:23-32` 注释已点名此坑）→ `executableModel.ts:36` 报 "API key missing"，与文件里明明有 key 相矛盾；
  3. 画幅被 `archetypeWireDefaults.generated.ts:87` 钉死 `size:"1:1"`，MCP `nomi_generate` schema（`mcpProtocol.ts:273-290`）没有 aspect/size 字段，写进 prompt 也无效。另：apimart seedance-2.5 的 i2v body（`apimartVideos.ts:68`）其实有 `image_urls` **数组**槽（可多参考），但 kind 自动选择让双参考走了单槽模式被 L3 闸拒——闸对，选路错。
  - 补一条研究已点名的：工具结果文案硬编码中文（违 R15）。
- **修法**：
  1. list_models 逐 vendor 做 key 解密探测 + 通道可达性（复用 L3 的 derive 逻辑提前到列表时），返回 `keyStatus: ok/missing/locked`，说不出"可用"的不标可用；
  2. safeStorage 身份不匹配时**如实报**「key 在但当前宿主身份解不开（去 App 里重存或统一身份）」，不再笼统 "missing"；
  3. `nomi_generate` schema 暴露 `aspect_ratio`/`resolution`/`duration`（经 `taskParams.ts:54-64` 的 caller-wins 合并注入）；
  4. L3 拒发错误附**可走的路**（"该模型 i2v 支持 image_urls 多图，改用 X 模式" / "先合成首帧再 i2v"）；
  5. 结果文案走 i18n（R15）。
- **结构保证**：单测「list_models 列出的每一条，构造最小请求必过 L3 可达性检查」；契约测试锁 error 文案含建议路径。

### P3-F 串库 + 60s 盲等（本次最重故障）
- **根因**：`mcpNodeLauncher.ts:96-108` 靠 `~/.nomi/capability-core/instance.json` 发现实例，**advert 不含"哪个库"也无归属校验**，谁后写谁赢；并发会话用 `NOMI_PROJECTS_DIR` 起的走查宿主抢注 advert → 我的调用连进 fixture 库（`creation-flow-fixes` 等 id 在主代码库搜不到，证实是外部注入）。advert 失效后每次调用**盲等满 60s**（`BOOT_TIMEOUT_MS`，`mcpNodeLauncher.ts:24`）才报错；`code=0` 是输掉 Nomi 单实例竞争的兄弟进程正常退出（`:87-91` 注释自认）。库指针不持久化，重启 App 即恢复真实库。
- **修法**：instance.json 增加 `projectsRoot` 指纹 + 心跳时间戳；launcher 握手校验：库不匹配即报「连到的是走查库 X，你的项目在库 Y——重启 Nomi 或关闭占用会话」而不是默默用错库；pid 活着但 advert 陈旧时**快速失败**（~10s）并给出同样人话；走查/测试宿主一律带隔离命名空间，不许抢生产 advert。
- **结构保证**：并发 e2e——两个 launcher 一真一 fixture 同时跑，断言真库调用**要么成功要么秒级人话报错**，永不静默串库。

## 三、测试系统（R16：真实任务 + 指标记录，交付的一部分）

新增 `tests/e2e/mcp-journey.spec.ts`（或 scripts/mcp-e2e）：**驱动真实 mcpNodeLauncher 进程**（隔离 `NOMI_PROJECTS_DIR` + mock vendor，零额度，CI-ready；另留 `--real` 开关跑真额度 smoke，额度默认授权）。

真实用户任务脚本 J-MCP1（就是这次拍片的最小复刻）：
建项目 → 批量加 2 锚 + 12 镜 → 连边 → 生 2 张图 → 生 1 条视频 → 读产物 → 读画布。

每步记 JSONL 指标（用户点名的三类全覆盖）：
```json
{"step":"add_nodes_batch","tool":"nomi_add_nodes","ok":true,"errorCode":null,
 "retries":0,"durationMs":1840,
 "visible":{"progressNotifs":2,"imageBlocks":0,"deepLink":true,"elicitationUsed":true,"appDialogShown":false}}
```
验收断言：全程 0 次 App 弹窗（elicitation 接管）；每个产物结果必含 imageBlock+deepLink；≥10s 调用必有 progress；非模型耗时的单步开销 <2s；库指纹校验失败时报错含两库名称；运行报告汇总成表与本方案「一、基线」对照。

## 四、范围 / 不动项 / 回滚 / 验收门

- **范围**：`electron/capabilityCore/*`（协议、gateway、canvasGraph、core、mcpNodeLauncher）、共享节点工厂与布局工具抽层（`src/domain` + 两处调用点替换）、`electron/catalog`（list_models 真话、错误建议）、新 e2e harness。
- **不动项**：花钱/导出/发布的**最终决定权仍在真人**（elicitation 只是把确认搬到聊天里，不是跳过）；L3 诚实护栏语义不变（只加建议文案）；生产 Run 状态机不动；App 内既有 UI 不动。
- **回滚**：elicitation-first 挂 `NOMI_MCP_ELICIT_FIRST` 环境开关首发（默认开，出问题一键回 App 弹窗）；共享工厂替换分两 commit（先抽层后切换），单独可 revert。
- **验收门**：五门全绿 + J-MCP1 harness 全过 + 指标对照表进 `docs/audit`；实现顺序 P0-A/B → P1-C/D → P2-E → P3-F，每档独立 PR。
- **关键事实（dispatch 收口，防未来审计误判）**：能力核有**三个** dispatch 调用点——`rpcServer.ts`（GUI 进程 RPC 传输）、`mcpStdioServer.ts`（stdio 传输的 in-process 分支），二者都必须过结果富化（T2 的缩略图/签名链/locale 收口），故 T4 把 `enrichResultForMethod` 折进 `dispatchAndEnrich(...)` 包装器、两处传输一律走它，任何传输调用点想「忘记富化」在结构上就不可能。第三个调用点 `electron/capabilityCore/host.ts`（headless `electron host.js --cmd` 一次性 worker）是**有意保留的死代码**：当前没有任何 spawner 会拉起它（stdio 模式已取代旧 CLI 路径，见 `mcpStdioServer.ts` 头注），故**刻意不给它接富化包装器**——它不参与真实 MCP 结果通道，接了反而制造「像在用其实没人调」的假象。未来若复活 host.ts 当真实传输，需同步改走 `dispatchAndEnrich`。
- **关键事实（文案 locale 按传输诚实分账，2026-08-18 补）**：MCP 协议层文案 locale 来自 `transport.getLocale()`。承载真实客户端的**两条传输**现在都跟 OS 语言走：① `mcpStdioServer.ts`（in-Electron 入口）用 `app.getLocale()`（`:139`）；② **生产入口** `mcpNodeLauncher.ts`（bare-Node，`ELECTRON_RUN_AS_NODE=1`，无 `app.getLocale()`）用 `Intl.DateTimeFormat().resolvedOptions().locale`——即 `app.getLocale()` 底下同一个系统区域信号，经 `normalizeDesktopLocale` 归成 en/zh-CN、取不到缺省 zh-CN（`resolveLauncherLocale`，provider 可注入以便单测）。此前 T4 只接了 stdio 一侧，真实客户端多数经 launcher 进来 → 永远收到 zh-CN，本轮补齐。两条传输一律不再硬编码中文。

## 五、执行拆解（2026-08-18 定稿，subagent-driven，实现交 opus）

| # | 任务 | 主要文件 | 边界 |
|---|---|---|---|
| T1 | P0-A elicitation-first 画布确认 + 会话级信任 | gateway.ts / core.ts / mcpProtocol.ts | **花钱/导出路径不动**（最终确认权留在 App，与 08-18 已拍板样张一致） |
| T2 | P0-B 可见性栈：progress + 结果图片块 + 深链 + 签名预览 | mcpProtocol.ts / mcpToolResults.ts / core.ts / localProtocol | 面板保留；新增内容走既有 outcome 文案机制 |
| T3 | P1-C/D 共享节点工厂替换平行版 + 批量布局 | canvasGraph.ts ⇄ canvasNodeActions.ts → 共享层 | 删旧平行实现（P1），两侧产出逐字段同构 |
| T4 | P2-E 目录真话 keyStatus + generate 画幅/时长参数 + 拒发建议 + 文案 locale | core.ts / secrets.ts / executableModel.ts / taskParams.ts / mcpProtocol.ts | 只 derive 不 hardcode |
| T5 | R16 harness：J-MCP1 真进程走查 + JSONL 指标 + 断言 | tests/ + 既有 journey 测试扩展 | **一律隔离 NOMI_CAPABILITY_DIR / NOMI_PROJECTS_DIR，禁碰真实库与 advert** |
| T6 | P3-F advert 库指纹 + 心跳 + 快速失败 + 并发用例 | mcpNodeLauncher.ts / host 侧 advert 写点 | 走查/测试宿主结构上不可能再抢生产 advert |
| T7 | 终审：整体 code review → 五门 → 合 origin/main → push + PR | — | 单分支分层 commit，一个 PR 交付 |

每任务三段式：实现（含测试、commit）→ 规格合规审 → 代码质量审，全过才进下一任务；实现类子代理一律 opus。

## 五·旧、本次已当场处理

- 用户看图：两张过审参考图已直接用 Preview 打开；全部产物路径见项目 `assets/generated/2026-08-17/`。
- 串库机制已写入记忆（`nomi-mcp-multi-instance-library-swap.md`），当前解法：重启 Nomi（或关另一个走查会话）即回真实库。
