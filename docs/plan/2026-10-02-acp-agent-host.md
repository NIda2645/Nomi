# 右侧 Agent 面板做开放宿主：用 ACP 接外部 Agent

> 状态：⏳
> 调研：[`docs/research/2026-10-02-acp-agent-host/report.md`](../research/2026-10-02-acp-agent-host/report.md)（规范要点、各 Agent 接法、现有宿主、对照 infinite-canvas、读码、未核实清单）。
> 本文只定方案与切片，不含代码。每片开工前按 P2 / R21 先跑门表，再写各自的 PR 正文。

## 一句话

右侧面板从「只能跑内置 pi」变成「可以接不同 Agent 的宿主」：内置 pi 照旧，用户自己的 Codex（之后 Gemini、Claude Agent）经开放标准 ACP（Agent Client Protocol）接进来。外部 Agent 通过 Nomi 自己交给它的 MCP 操作画布，**每一步都落成画布节点 + 连线，花钱一律走 Nomi 的付费卡**。

---

## 1. 拍板记录（2026-10-02 用户拍板）

| # | 拍板 | 落在本方案哪里 |
|---|---|---|
| 1 | 走方案 B：内置 pi 不动，外部 Agent 走 ACP 入口 | §2 架构 |
| 2 | Claude 只支持填 API key，排在 Codex、Gemini 之后，名字叫「Claude Agent」 | §5 切片 S6 |
| 3 | 第一步：面板能选 Codex；同时外部 Agent 的生成改成先建节点和连线、出付费卡就返回，顺带修 60 秒超时 | §5 切片 S1、S2 |
| 4 | （原有要求）接 Codex 不用开终端 | §2.1 鉴权 |
| 5 | （原有要求）外部 Agent 的每个动作都落画布节点 + 连线，花钱走付费卡 | §2.4、§2.5 |

为什么不选 A（pi 也走 ACP）与 C（仿 infinite-canvas 本机服务跑 Codex）：见调研 §8 对比表。一句话：A 要把 pi 包成 ACP agent、再把付费卡 / 回执 / 撤销塞进私有扩展，内置 Agent 换来的开放性为零；C 只适合碰不到子进程的网页应用，且只能接 Codex。

## 2. 架构

```
┌─────────── Nomi 主进程 ───────────┐
│                                   │   stdio (ACP, JSON-RPC)   ┌──────────────┐
│  ACP 宿主 (新)  ──────────────────┼──────────────────────────▶│ codex-acp 等 │
│   · 进程生死 / 重连 / 鉴权        │◀──── session/update ──────│  外部 Agent  │
│   · session/new 交出 nomi MCP ────┼──┐                        └──────┬───────┘
│                                   │  │   mcpServers[stdio]           │ 调 MCP 工具
│  Nomi MCP 服务器 (现有, 改工具) ◀──┼──┴───────────────────────────────┘
│   · 生成：建节点+连线 → 出付费卡 → 立即返回                          │
│  ProductionRun / pendingSpend (现有 owner, 不动)                      │
│  pi lane (现有, 不动)                                                 │
└───────────────┬───────────────────┘
                │ IPC：面板行（ACP ToolCall 形状）+ 付费卡事件
        ┌───────▼────────┐
        │ 右侧面板 (v4)  │  Agent 选择器：Nomi（内置）/ Codex / Gemini / Claude Agent
        └────────────────┘
```

### 2.1 主进程里的 ACP 宿主

- **协议层用官方库** `@agentclientprotocol/sdk`（v1 稳定入口；不碰 `experimental/v2`）。我们不写 JSON-RPC、不写消息分帧。
- **进程生死**
  - 一个外部 Agent 会话 = 一个适配器子进程。起进程时 `windowsHide`，stdout 只走 ACP。
  - 退出时：Windows 用 `taskkill /PID <pid> /T /F` 收整棵进程树（适配器会再起 Codex App Server 子进程），其他平台发信号给进程组。
  - Nomi 退出 / 切项目 / 用户换 Agent 时，先 `session/cancel` 再收进程，不留孤儿。
- **重连**
  - 子进程意外退出 → 面板显示「已断开」并自动重起一次。重起后对声明了 `sessionCapabilities.resume` 的 Agent 走 `session/resume`，否则 `session/load`。
  - **两条路都重新传 `mcpServers`**：codex-acp 在 load / resume 没收到 mcpServers 时会跳过恢复（调研 §6）。
  - 连续失败按固定上限停下，给用户一个「重新连接」按钮（参照 AionUi 的手动重启按钮），不做无限重试。
- **按需下载或复用**
  - 适配器与 Agent 二进制不进安装包：Codex 的 Windows 平台包解压约 448 MB（调研 §2），超出 `delivery.package-contents` 的包体预算。
  - 优先复用用户已装的 Codex（检测到就设 `CODEX_PATH`），否则用户第一次选 Codex 时下载到用户数据目录。
  - 下载按 ACP 注册表钉住版本，并校验 npm 发布的完整性哈希。
  - 适配器用 Electron 自带 Node 跑（`ELECTRON_RUN_AS_NODE=1`，与现有 MCP 启动器同法，`electron/capabilityCore/mcpConfig.ts:191-212`），用户不用装 Node。
- **鉴权**
  - 初始化时读 Agent 的 `authMethods`。
  - **Codex 用 `chat-gpt`（agent 型）**：适配器自己开浏览器，不开终端（`codex-acp/src/CodexAcpClient.ts:217-222`）；已经登录过的直接复用（`:352-362`）。
  - API key 方式作为第二入口：key 进 Nomi 现有的凭据存储，不进日志、不进投影。
  - Nomi **不声明** `auth.terminal`，所以不会出现任何需要终端的登录方式。
- **cwd 与权限**
  - cwd 给每个项目一个专用目录，不是用户的家目录。
  - 默认只读 / 沙箱（codex-acp `INITIAL_AGENT_MODE=read-only`）。
  - Nomi 不声明 `fs` / `terminal` 客户端能力：外部 Agent 改画布只能走 Nomi 的 MCP。

### 2.2 session/new 交出 Nomi 的 MCP（独立 client 身份）

- 直接复用 `mcpServerEntry()`（`electron/capabilityCore/mcpConfig.ts:221-245`），转成 ACP 的 `{ name: "nomi", command, args, env: [{name, value}] }`。
- **新增一个独立 client 键 `nomi-acp`**，在 `electron/shared/mcpClientRegistry.ts` 登记，带自己的签名证明。好处：
  - 主进程能分清「这次调用来自 Nomi 自己起的 ACP 会话」与「用户自己在 Codex 里配的 nomi」，付费卡可以直接推到面板；
  - 两条路分开计数、分开排错。
- 不改用户的 `~/.codex/config.toml`：现有「一键接入」照旧可用，两条路并存但**不是同一概念的两份实现**——一个是用户自己的 Codex 进程，一个是 Nomi 起的。
- **Agent 层默认放行 Nomi 的工具**，避免「Agent 问一次 + Nomi 付费卡再问一次」：Codex 侧怎么设见 §8 待核实第 1 条。读类工具静默，写和花钱由 Nomi 自己的闸管。

### 2.3 面板行用 ACP ToolCall 形状作为中立契约

- 面板里「一次工具调用」的中立契约直接采用 ACP 的 `ToolCall` / `ToolCallUpdate`：
  - 以 `toolCallId` 为键，一次调用一行；
  - `status` 四态：pending / in_progress / completed / failed；
  - 另有 `kind`、`title`、`content`、`rawInput/rawOutput`。
  - 类型从 `@agentclientprotocol/sdk` 引入，不自己抄一份。
- **外部 Agent**：`session/update` 原样落进来，宿主只补 Nomi 自己的领域字段（例如这一行对应的付费卡、画布回执），放在 `_meta` 下的 Nomi 命名空间。
- **pi**：`laneProjection.ts` 把 pi 的 tool-call / tool-result 映射到同一形状（即 0.24 的 C1）。映射完成后删掉旧的 tool-call / tool-result 成对表示（P1）。
- 消息块、思考块同理对齐 `agent_message_chunk` / `agent_thought_chunk`；pi 专有的东西（队列、重试、沙箱状态）留在 `LaneProjection` 的会话级字段，不进行模型。

### 2.4 付费卡链路不变

- owner 不动：
  - 出价身份 = `electron/shared/contracts/pendingSpendConfirm.ts#PendingSpendConfirm`；
  - 编排与收据链 = `electron/capabilityCore/appIntegrationSpendConfirm.ts`；
  - 要不要弹 = `spendConfirmationRequirement`。
- **外部 Agent 不经 ACP 的 `request_permission` 表达花钱**：它只有平铺单选，表达不了逐镜勾选（调研 §7）；而 Nomi 自己就是 MCP 服务器，主进程已经知道这一笔。
- 卡照旧按镜头逐张决定：点了的生成，去掉的不生成。
- ACP 的 `request_permission` 只用于外部 Agent **自己的**权限请求（例如它想跑一条命令），渲染成面板现有的通用确认卡，按 ACP 的四种选项给按钮。

### 2.5 MCP 生成工具：不阻塞、落节点 + 连线

- **现状**：`nomi_operation_gate phase=request` 在工具调用里等用户确认（`electron/capabilityCore/mcpProtocol.ts:574-585` → `mcpSemanticGenerationFlow.ts:12-25`）。用户 60 秒内没点，Codex 默认的工具超时就把这次调用断掉——这是「容易断线」的一个直接原因。今天只能靠往用户 config.toml 写 600 秒兜着（`mcpConfig.ts:370-386`），而 ACP 会话里传进去的 server 没有地方写超时。
- **改成**：
  1. 先按生成计划在画布上建草稿节点；
  2. 再从来源（参考图、上游节点）**连线**到这些节点，落点用 `canvas.insertion-point` 的现有 owner；
  3. 然后出付费卡；
  4. **立即返回**「已在画布放好 N 个节点，等用户在卡上确认」，并带上 `operationId`。
- 用户确认后生成照常跑、结果落进那些节点；拒绝则节点留在草稿态，什么都不花。Agent 之后可以用现有的查任务工具看结果。
- 这一刀对**所有 MCP 客户端**生效：用户手配的 Codex / Claude Code / Cursor，以及 Nomi 自己起的 ACP 会话。
- pi lane 的等待在 `before_tool` 里、本来就不计工具超时（`electron/agentLane/laneExtendedDesktopPorts.ts:173-245`），**这一刀不动它**。两条入口共享同一个出价 owner 与同一个落节点函数——这一点由对等棘轮钉住（§3）。

## 3. 概念占用表

| 概念 | 唯一 owner（文件 · 符号） | 允许谁消费 | 本方案动它吗 |
|---|---|---|---|
| 出价 / 待决身份 `spend.pending-identity` | `electron/shared/contracts/pendingSpendConfirm.ts` · `PendingSpendConfirm` | 主进程 ProductionRun 投影、面板付费卡、MCP 生成流程 | 不动 owner；S3 把「读」从轮询改成订阅事件 |
| 付费生成要不要弹确认 `spend.confirmation-requirement` | `src/workbench/generationCanvas/spend/spendConfirm.ts` · `spendConfirmationRequirement` | 原样 | 不动 |
| pi lane 等用户 `agent-lane.awaiting-user` | `electron/agentLane/laneApprovalGate.ts` · `createLaneApprovalGate` | 原样（仅 pi lane） | 不动 |
| **外部 Agent 会话**（进程、连接、鉴权状态、重连）`agent-host.external-session`（新） | 拟 `electron/agentHost/acpHost.ts` · `createAcpAgentHost` | 主进程 IPC、面板选择器（只读） | S2 新建并当场登记 |
| **外部 Agent 的授权请求**（ACP `request_permission` 的转交）`agent-host.permission-relay`（新） | 同上 · 宿主内的 permission 处理器 | 面板通用确认卡（只读 + 回答） | S2 新建并当场登记 |
| **面板工具行中立契约** `agent-panel.tool-row`（新） | `electron/shared/agentLane/laneContracts.ts`，类型源自 `@agentclientprotocol/sdk` 的 `ToolCall` | pi 投影（`laneProjection.ts`）、ACP 宿主投影、`src/workbench/ai/v4/` | S2 引入、S4 让 pi 迁上来并删旧表示 |
| 外部 Agent 适配器安装位置与版本 `agent-host.adapter-install`（新） | 拟 `electron/agentHost/acpAdapterStore.ts` | ACP 宿主 | S2 新建并当场登记 |
| MCP 客户端身份 | `electron/shared/mcpClientRegistry.ts`（名单）+ `electron/capabilityCore/mcpConfig.ts` · `mcpServerEntry`（条目） | MCP 启动器、ACP 宿主 | S2 只**加一个键** `nomi-acp`，不另起一份名单 |
| 新东西落画布哪里 `canvas.insertion-point` | `src/workbench/generationCanvas/store/canvasVisibleArea.ts` · `visibleInsertionPoint` | MCP 落节点路径 | S1 消费，不另算位置 |
| 制作镜头的生成归属 `production.shot-generation-ownership` | `electron/shared/decideShotClaim.ts` · `decideShotClaim` | MCP 生成路径 | S1 消费，不绕过 |

**有没有多出第二个 owner**：
- 没有。新增的四个概念都是今天不存在的东西（外部 Agent 会话、它的授权转交、面板行契约、适配器安装）。
- 花钱、等用户（pi）、落点、镜头归属四个现有概念只被消费、不被复制。
- 需要特别说明的一条：外部 Agent 的授权请求**不是** `agent-lane.awaiting-user` 的第二份。后者是 pi 在 `before_tool` 里的等待，判据归 Nomi；前者是外部 Agent 自己的判据，Nomi 只转交和渲染、不替它决定。
- 对等棘轮：S1 加一条「同一份生成计划，经 MCP 与经 pi lane 两个入口 → 建出的节点 / 连线集合与出价报文逐字节相同」的 parity 测试。

## 4. 自己写了什么、为什么必须自己写

| 自己写的 | 为什么不用现成的 | 理由类型 |
|---|---|---|
| ACP 宿主的进程监管：起进程、退出监听、Windows 进程树回收、有上限的重起 | 官方 SDK 只给「一条流上的连接」；规范把「Agent 是客户端的子进程」的管理留给客户端。Zed、AionUi 各自写了自己的一层（调研 §3），没有可直接引用的 Electron 现成库。只写最薄一层，进 `docs/engineering/self-written.json` 登记 | **不是领域约束，是规范划给客户端的职责**；照实写，靠「只写最薄一层 + 登记」控制范围 |
| 适配器的按需下载、定位、校验 | 安装包放不下（包体预算是 `delivery.package-contents` 的领域约束）；用户机器上不能假定有 Node / npm。S2 开工前做 build-vs-buy：npm 官方的取包库 vs 直接按注册表下载 tarball + 校验完整性哈希 | 领域约束：包体预算 + 用户不装开发工具 |
| ACP 更新 → 面板行的投影与 Nomi 领域字段（付费卡、回执） | 面板长什么样、哪一行挂哪张付费卡是 Nomi 的产品 | 领域约束 |
| MCP 生成工具「建节点 + 连线 + 出卡即返回」 | 落画布与花钱规则是 Nomi 的核心领域 | 领域约束 |
| 付费卡与收据链 | 不变；钱要有可机验的真人手势收据 | 领域约束 |
| **不写的**：JSON-RPC / 消息分帧 / ACP 类型（官方 SDK）；各 Agent 的接法（官方与社区适配器）；Agent 的登录流程（适配器自带）；MCP-over-ACP（草案，不追） | — | — |

框架接入登记：S2 PR 同时提交 `@agentclientprotocol/sdk` 的四列表、参考实现逐层对照与 framework-surface 逐字段裁决（R5④，进 `docs/engineering/framework-boundaries.json`）。

## 5. 切片与 PR 顺序（一个概念一个 PR）

| 片 | 概念 | 范围 | 验收（缺一条不算完成） |
|---|---|---|---|
| **S1** | MCP 生成不阻塞 + 落节点连线 | MCP 生成工具改成「建节点 → 连线 → 出卡 → 立即返回」；删掉工具调用里阻塞等确认的那条路（P1，不留并行版）；根因合同（recurring：60 秒超时断线），门表进合同 | ① 真实 Codex（用户现有的手配路径）说「生成一张图」：画布出现节点 + 来源连线，付费卡出现，工具调用在几秒内返回；② 等 90 秒以上再点确认，生成照常完成、结果落进节点；③ 点 ×：节点留草稿、零花费；④ 逐镜去掉一镜：只生成剩下的；⑤ pi lane 同一请求行为不变；⑥ MCP / pi 两入口对等测试绿；⑦ zh/en 真截图 |
| **S2** | ACP 宿主 + Codex + 面板选择器 | 主进程 ACP 宿主（§2.1）、`nomi-acp` client 键、适配器按需下载 / 复用 `CODEX_PATH`、面板选择器、外部 Agent 的消息 / 工具行 / 授权卡渲染。界面改动先出样张、用户确认后写码（R8） | 在**没有 Node、没有装 Codex** 的 Windows 机器上：① 选 Codex → 看到下载进度 → 浏览器登录（全程不开终端）→ 发「在画布上生成…」→ 节点 + 连线 + 付费卡；② 已登录过 Codex 的机器不再弹登录；③ 关掉 Nomi 再打开，对话恢复、MCP 仍可用；④ 结束适配器进程 → 面板显示断开并自动重连；⑤ 按停止 → 本轮以取消结束、无孤儿进程（任务管理器核对）；⑥ zh/en 真截图；⑦ 工具写对率 + 回合成功率写进 PR（R13） |
| **S3** | 付费卡改推送（0.24 的 B） | 主进程在 pendingSpend 变化时推事件；`useAgentPanelSpendConfirm.ts` 删掉 1.5 秒轮询（`:52`、`:147-151`） | ① 代码里不再有这条 `setInterval`；② pi 与 Codex 两条路的卡都在主进程事件后立即出现；③ 项目切换时不闪上一个项目的卡；④ 读失败仍渲染「会说话的卡」，不变成空白 |
| **S4** | 面板工具行 = ACP ToolCall（0.24 的 C1） | pi 投影迁到 §2.3 的契约；删旧 tool-call / tool-result 成对表示 | ① 一次工具调用恰好一行（同一份 pi 转录，行数 = 调用数）；② 现有面板测试与长对话性能基线不退；③ 外部 Agent 与 pi 的工具行用同一个组件 |
| **S5** | Gemini | 选择器加 Gemini；登录走 Login with Google（浏览器） | 同 S2 ①–⑥ 走一遍 |
| **S6** | Claude Agent（只填 API key） | 以 `--hide-claude-auth` 起适配器；只露 API key 入口；对外名「Claude Agent」 | ① 界面上不出现任何订阅登录入口；② 填 key 后能完成一次「节点 + 连线 + 付费卡」；③ 名字核对（不出现「Claude Code」） |
| **S7** | MCP 换官方 SDK | `mcpProtocol.ts` 自写协议层换成官方 MCP TypeScript SDK；工具与领域逻辑不动 | ① S1–S6 的验收用例全部回归绿；② 外部手配路径（Codex / Claude Code / Cursor）各跑一次 |

**排序说明**：
- S1 先做：它让今天所有手配 MCP 的用户立刻受益，也是 S2 的前提（不阻塞的工具才能在 ACP 会话里稳定工作）。
- S7 放最后：ACP 会话正好当它的真实回归用例。
- **协调会话已裁（2026-10-02）**：S4 提到 S2 之前，实际顺序为 S1 → S4 → S2 → S3 → S5 → S6 → S7。理由：按原顺序，S2 到 S4 之间面板里会有两种工具行表示（pi 旧的、ACP 新的），是一段临时并行版（违反 P1）；S4 先做就没有这段。

## 6. 不动什么、风险、回滚

**不动**
- pi lane 运行时、`laneApprovalGate`、pi 在 `before_tool` 里的付费等待；
- ProductionRun、付费卡收据链、出价身份；
- 用户自己的 MCP 配置与「一键接入」；
- AI SDK 收敛那条线；
- MCP-over-ACP（草案，不追）。

**风险**

| 风险 | 后果 | 对策 |
|---|---|---|
| 适配器上游迭代很快（codex-acp 2.x 几乎每周发版） | 行为漂移 | 按注册表钉版本；升级走模型雷达同类的检查，不自动跟最新 |
| 下载体积大（约 448 MB），国内网络访问 npm 源可能慢或不通 | 第一次选 Codex 卡在下载 | 优先复用已装的 Codex；下载显示进度、可断点续；源地址可配置（镜像），失败给人话 |
| ChatGPT 登录的网络可达性与条款 | 部分用户登不上 | API key 入口并列；条款见 §8 第 4 条 |
| 外部 Agent 没有撤销、反问等 Nomi 专属卡 | 用户以为功能一样 | 选择器上如实标出差异（D4） |
| 双重确认（Agent 自己问 + Nomi 付费卡） | 用户点两次 | §2.2 默认放行；§8 第 1 条核实 |
| S2–S4 之间两种工具行表示 | 临时并行版 | 已裁：S4 先于 S2 做，这段不存在（§5） |
| 外部 Agent 能读写本机文件 | 越界操作 | 专用 cwd + 只读 / 沙箱 + 不声明 fs / terminal |

**回滚**
- 每片独立 revert。
- S1 回滚 = 恢复阻塞等确认（不保留开关、不留并行版）。
- S2 回滚 = 移除选择器入口与宿主目录，pi 路径完全不受影响。
- 下载到用户数据目录的适配器，在回滚版本里视为孤立文件，下次启动清理。

## 7. 六角色评审

- **CTO**：方向对——标准协议 + 别人维护的适配器，正是「广度交给生态」。最大的长期成本不在我们写的那层，而在上游适配器的发版节奏：必须钉版本、有升级检查，否则某天 codex-acp 一个小版本就能把面板弄坏，而我们没有任何信号。另外 S1 改的是花钱路径，合并前必须有真 App 验收收据。
- **设计**：选择器是常驻控件还是收进二级菜单，要先过 §1.5 控件层级。我倾向放在输入框旁、和模型选择同一组，因为它本质是「谁来回答」。外部 Agent 少了撤销 / 反问，要在选中时一句话标出，不要等用户找不到撤销才发现。付费卡和 Agent 自己的授权卡必须一眼分得清：一个花钱、一个只是动作，视觉权重不能一样。
- **PM**：谁会用？已有 ChatGPT 订阅、习惯 Codex 的创作者。价值是用自己的订阅做规划和改稿，而画布动作仍在 Nomi 的规则里。要盯的数字是「第一次选 Codex 到第一个节点出现」的成功率和耗时；下载 + 登录任何一步失败都会让这条路被放弃。S1 对所有 MCP 用户都有收益，优先级排第一是对的。
- **前端**：外部 Agent 的流式更新频率比 pi 高，要复用 `agent-panel.flow-render-identity` 的现有 owner（`useAgentPanelV4Data.ts` 的 `shareFlowItems`），一次更新只重画变了的行，不能另写一份 diff。`tool_call_update` 只带变化字段，合并逻辑放主进程投影里，渲染层拿完整行。长工具输出要折叠，沿用现有折叠规则。
- **后端 / 主进程**：
  - 三个坑要在 S2 第一天就写测试：Windows 进程树回收；适配器 stdout 被日志污染导致 ACP 分帧错乱；Nomi 崩溃后残留的 Codex App Server 进程。
  - `nomi-acp` 的签名证明要和现有 client 走同一套校验，不另开后门。
  - resume 时必须重传 mcpServers，这一条要有测试钉住，否则「重启后工具没了」会安静地发生。
- **真实用户**：我只想点一下 Codex 就能用。如果要等几百 MB 下载，请告诉我还要多久，别让我对着一个转圈。登录跳浏览器可以接受，跳终端我就放弃了。生成前给我看卡、让我勾哪几张，这点比 Codex 自己直接出图好——我在乎的是钱花在哪。

## 8. 待核实清单（每条怎么核）

| # | 待核实 | 怎么核实 | 影响哪片 |
|---|---|---|---|
| 1 | codex-acp 的 `CODEX_CONFIG` 能否给 ACP 会话传进去的 MCP server 设 `tool_timeout_sec` 与 `default_tools_approval_mode` | ① 读 codex-acp 源码里 `CODEX_CONFIG` 的合并点，以及它把会话 mcpServers 交给 App Server 的那段（`src/CodexAcpServer.ts` 的 session 创建处）；② 本机实跑：用一个故意睡 90 秒的测试 MCP 工具，分别带 / 不带 `CODEX_CONFIG` 起 codex-acp，记录是否超时、是否弹授权 | S2（S1 做完后超时不再是硬依赖，但「默认放行」仍是） |
| 2 | 适配器会不会把 MCP 的 progress 通知转成 `tool_call_update` | 测试 MCP 工具在调用中发 `notifications/progress`；用 SDK 写一个最小客户端，把 codex-acp 与 claude-agent-acp 的 `session/update` 全量录下来，看有无对应更新 | S2、S6 |
| 3 | ACP 侧的 `toolCallId` 与 Nomi MCP 侧那次调用怎么对齐 | 同一份录制里，对照 ACP `tool_call` 的 `rawInput`（是否带 server / tool / arguments）与 Nomi MCP 收到的请求（JSON-RPC id、`_meta`）。对不上就以工具结果里的 `operationId` 关联，并写进 §2.3 | S2、S4 |
| 4 | OpenAI 对「第三方产品里用 ChatGPT 订阅登录 Codex」的明文说法 | 查 OpenAI 官方的 Codex 鉴权文档与使用条款、`openai/codex` 仓库的鉴权文档；找不到明文就如实报给协调会话，由用户定是否默认露出订阅登录（API key 入口始终保留） | S2 |
| 5 | Claude Agent 的 SDK 在原生 Windows 上是否需要 Git Bash | 在干净 Windows 上用 API key 起 `claude-agent-acp`，跑一次只读工具调用 | S6 |
| 6 | npm 源在国内网络下的可达性与速度 | 在国内网络环境实测下载 Codex Windows 平台包，记录耗时与失败率；对比镜像源 | S2 |

## 先查别人

- ACP 规范（会话、工具调用、授权、鉴权、扩展点）：https://agentclientprotocol.com/protocol/session-setup 、https://agentclientprotocol.com/protocol/tool-calls 、https://agentclientprotocol.com/protocol/v1/authentication.md 、https://agentclientprotocol.com/protocol/extensibility
- 官方 TS SDK（v1 稳定、v2 实验）：https://github.com/agentclientprotocol/typescript-sdk
- Zed 交出自己的 MCP、渲染授权卡、处理进程退出：`zed/crates/agent_servers/src/acp.rs:5504`、`acp.rs:5689`、`acp.rs:2101`（https://github.com/zed-industries/zed ）
- codex-acp 鉴权与 MCP 处理：`codex-acp/src/CodexAuthMethod.ts:69`、`codex-acp/src/CodexAcpClient.ts:217`、`codex-acp/src/CodexAcpServer.ts:2496`（https://github.com/agentclientprotocol/codex-acp ）
- claude-agent-acp 鉴权与订阅登录隐藏：`claude-agent-acp/src/acp-agent.ts:2495`、`claude-agent-acp/src/hide-claude-auth.ts:1`（https://github.com/agentclientprotocol/claude-agent-acp ）；Anthropic 对第三方订阅登录与命名的规定：https://code.claude.com/docs/en/agent-sdk/overview
- AionUi（Electron + TS 的 ACP 客户端）渲染层：https://github.com/iOfficeAI/AionUi （`packages/desktop/src/renderer/pages/conversation/Messages/acp/`）
- 反方 prior-art：infinite-canvas 本机服务 + Codex 私有协议的做法（AGPL-3.0，只学做法）：https://github.com/tigerowo/infinite-canvas （`canvas-agent/index.mjs:121`、`canvas-agent/codex.mjs:1`）
- Codex MCP 默认超时：https://developers.openai.com/codex/mcp
