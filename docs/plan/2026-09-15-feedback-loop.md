# 反馈回路：用量 · 轨迹 · 一键反馈

日期：2026-09-15 · 分支 `feat/feedback-loop-20260915` · 状态：🚧 实施中
样张（用户 09-15 已拍板）：`scratchpad/feedback-loop/feedback-loop-proposal-v2.svg`（v1 同目录，仅作参考）
调研：[docs/research/2026-09-15-feedback-loop/prior-art.md](../research/2026-09-15-feedback-loop/prior-art.md)
清单条目：`docs/roadmap/TODO.md` 的 T-AG-11（轨迹 + 隐私边界）· T-AG-12（就近的快速反馈）· T-EC-05（轨迹导出没有产品入口）

---

## 0. 一句话与底层逻辑（D6）

**用户那一刻卡在哪**：他生成失败了。他想让我们知道，但「让我们知道」今天的代价是——自己判断是哪个环节坏的、自己写一句话描述、自己选发到哪、再自己去浏览器里提交一遍。于是 99% 的失败信息就停在他屏幕上，我们永远不知道。

**这么做是为了**：把「告诉我们」的成本从「填一张表」压到「点一下」。失败的时候，机器已经知道的东西（错误码、时间、版本、模型、这一回合用了哪些工具、耗时多少）机器自己填；用户只做一个决定——发不发。

**他要权衡的那个核心东西**：**「我让你们看多少」**。所以整件事只有一个真正的取舍点，界面上也只让他决定这一个：默认发出去的是**结构**（哪个工具、失败没失败、多久、多少 token），**内容**（提示词、文稿、素材）默认一个字不带，要带得他自己勾。开关和勾选框加起来就是这一个决定的两个粒度。

**会发生什么**：他点「反馈」→ 看到一行自动写好的摘要 → 点「发送」→ 收到一个能引用的编号。数据落到我们自己的接收端，不经过任何第三方。

---

## 1. 用户拍板的六个默认（不可偏离）

| # | 决定 | 落在哪 |
|---|---|---|
| ① | 数据去向 = **自建接收端**（Cloudflare Worker + R2/KV，用户账号） | `infra/feedback-worker/`；客户端端点由 `NOMI_INTAKE_*` 配置 |
| ② | 首次询问在**第一次打开 Agent 面板**时，只问一次 | `src/workbench/ai/v4/AgentPanelV4Empty.tsx` + `onboardingState.ts` 的一次性标记 |
| ③ | **默认不收**，点「愿意」才收 | `DEFAULT_TELEMETRY_SETTINGS.enabled === false`（已有，不动） |
| ④ | 一键反馈**不受开关管**（用户主动点的） | 反馈走独立队列，不过 `enabled` 闸；见 §3.2 |
| ⑤ | 创作内容**默认不带**、勾选才带 | 勾选框默认 false；未勾时投影里连字段都不存在 |
| ⑥ | **只给编号**，不做回复闭环 | 不收邮箱、不收用户名；Worker 返回 `NF-MMDD-NNNN` |

---

## 先查别人（第 2 节）

完整四列表与逐条出处在 [prior-art.md](../research/2026-09-15-feedback-loop/prior-art.md)。结论摘要：

- **依赖里已有？** 没有。`node -e` 过滤 `package.json` 的 dependencies + devDependencies，命中 `telemetr|analytic|sentry|posthog|aptabase|otel|opentelemetry|cloudflare` 的条目数 = 0；现役 Aptabase 通路是手写的 31 行 HTTP adapter（`electron/telemetry/aptabaseAdapter.ts:7`），不是 SDK。
- **仓库里已有？** **三分之二都有**。同意合同 `electron/telemetry/telemetrySettings.ts:6`（默认关）· 白名单校验 `electron/telemetry/telemetryEvents.ts:66` · 落盘发件箱 + 离线 + 静默重试 + 关掉即删 `electron/telemetry/telemetryOutbox.ts:33,57,69` · 「每项写 what / excluded why」的 manifest `electron/shared/contracts/diagnostics.ts:3,12` · 诊断包 `electron/diagnostics/diagnosticsBundle.ts:78` · 三类脱敏 `electron/events/redact.ts:29` + `electron/logging/redact.ts:42,52` + `electron/diagnostics/catalogRedaction.ts:86` · 逐回合轨迹 `electron/agentLane/laneTrace.mts:46` · pi 转录密钥抹除 `electron/agentLane/laneTraceRedaction.mts:61` · 反馈面事件通道 `src/ui/community/FeedbackShareHost.tsx:14` · 供应商身份脱敏 `src/ui/community/feedbackDiagnostics.ts:41` · 设置里的「隐私与诊断」块 `src/workbench/settings/TelemetrySection.tsx` · **失败面 B 的「反馈问题」钮已经在了** `src/workbench/generationCanvas/nodes/NodeErrorReport.tsx:313`。
- **生态里已有？** Sentry User Feedback 的字段集与「必填可配成零」（[文档](https://docs.sentry.io/product/user-feedback/)）；PostHog 的 `before_send` 客户端改写钩子与 `opt_out_capturing_by_default`（[控制采集](https://posthog.com/docs/privacy/data-collection)）；Aptabase 的「Never Collected」措辞结构（[官网](https://aptabase.com/)）；Electron `crashReporter` 的 minidump + `submitURL` 契约（[文档](https://www.electronjs.org/docs/latest/api/crash-reporter)）；Anthropic 桌面端的「只问一次 + 设置 → Privacy 常驻开关」（[隐私中心](https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings)）；OTel GenAI 属性注册表及其**敏感字段标注**（[registry](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/main/docs/registry/attributes/gen-ai.md)）。
- **TikHub 自媒体里怎么说？** **今天没查成** —— 本机 `~/.nomi-secrets.env` 只有 `DEEPSEEK_API_KEY`，没有 TikHub 出站凭据。替代检索见 prior-art §5，但那不等于把这一问答了。
- **结论**：传输那一格自研（用户拍板「数据只去我们的端点」），其余全部用已有；`crashReporter` 明确不接（minidump 必然含内容字节，无法字段级脱敏）；轨迹字段名沿用 OTel GenAI 的非敏感子集，只做减法不另造格式。

### 为什么不用第三方 SDK（09-06 旧拍板的修订）

2026-09-06 的 [opt-in 频率遥测方案](2026-09-06-opt-in-frequency-telemetry.md) 结论是「买标准传输/看板，自己掌握同意与白名单」，选了 Aptabase。**现在改成自建接收端**，理由不是 Aptabase 不好（它的隐私姿态恰恰是同类里最干脆的），而是**这一版要开始收轨迹了**：

> 用量事件是 5 个名字 + 枚举 props，「不收别的」是**肉眼可验**的；
> 轨迹是一棵带工具名、参数结构、token 数的树，「不收别的」变成一句**只能靠承诺的话**。
> 一句只能靠承诺的话，不能让第三方进程替我们说。

所以：数据只去 `infra/feedback-worker/`，端点写在我们自己的账号下，进程里没有任何第三方分析 SDK。这句承诺可以由用户自己验证（抓包只有一个域名）。

---

## 3. 架构：三个口，一条管道

```
                      ┌─ 首次询问卡（Agent 面板空态，只问一次）──┐
                      │                                          ├─→ telemetrySettings.enabled
                      └─ 设置 → 通用 → 隐私与诊断（常驻开关）───┘        （默认 false）
                                                                        │
  ① 用量  白名单事件 ──────────────────────────── 受 enabled 闸 ────────┤
  ② 轨迹  LaneTraceTurn ──→ 字段白名单投影 ─────  受 enabled 闸 ────────┤──→ intakeQueue ──→ intakeClient ──→ Worker
  ③ 反馈  诊断包 + 这一回合轨迹 ───────────────── 不受闸（用户点的）───┘         （离线缓存·静默重试）    /v1/{events,trajectories,feedback}
```

### 3.1 端点与传输（**P1：删 aptabaseAdapter**）

| 动作 | 文件 |
|---|---|
| 删 | `electron/telemetry/aptabaseAdapter.ts` + `aptabaseAdapter.test.ts` |
| 加 | `electron/telemetry/intakeClient.ts` —— 唯一出站口：`postIntake(route, payload)`，bearer 令牌，8s 超时，`credentials:'omit'` |
| 改 | `electron/telemetry/telemetrySettings.ts`：`endpointMode: 'aptabase'` → `'nomi'`；`NOMI_APTABASE_APP_KEY`/`NOMI_APTABASE_ENDPOINT` → `NOMI_INTAKE_TOKEN`/`NOMI_INTAKE_ENDPOINT`。读旧文件时 `endpointMode` 一律归一成 `'nomi'`（老 profile 不炸） |
| 改 | `electron/telemetry/telemetryOutbox.ts`：`sendAptabaseBatch` → `postIntake('/v1/events', { events })`。**批量 25、7 天过期、100 条上限、30s 重试、关掉即删这些语义一行不动** |
| 改 | `tests/ux/telemetry-consent.walk.mjs`：env 名跟着改 |

**令牌的诚实说明**：它随 App 发出去，任何人解包都能拿到。它挡的是随手扫到 URL 的机器人，不是定向滥用；因此接收端只能写不能读/列/删，令牌随时可轮换。这句话同时写进 `infra/feedback-worker/README.md`，不许在别处说成「已鉴权」。

### 3.2 三种货物、一个队列实现

反馈与用量的**同意语义不同**（④：反馈不受闸）、**投递语义也不同**（用量攒批，反馈要立刻拿到编号）。所以不把反馈塞进 `telemetryOutbox`——那会让 `enabled` 闸长出一个例外分支，而闸子一有例外就迟早漏。

**最后落成两个队列模块，一个传输**（这不是 P1 的并行版，两者的契约真的不同，各自头注释里写明）：

- `electron/telemetry/telemetryOutbox.ts`（既有，不重写）——契约是「攒一批匿名计数，并把待发/已发条数给设置页看」。它的日期截断、25 条一批、pending/sent 摘要都是这个契约的一部分。本 lane 只把它的出站口从 `sendAptabaseBatch` 换成 `postIntake('/v1/events')`。
- `electron/telemetry/intakeQueue.ts`（新）——契约是「一份用户主动交出去的东西，必须最终送达」。被**反馈与轨迹两个调用方**共用。
- `electron/telemetry/intakeClient.ts`（新，替掉 `aptabaseAdapter.ts`）——**唯一**出站口，三条路由都从这里走。单一 owner 落在**传输**这一层，不在队列那一层。

三种货物的差异：

| 货物 | 路由 | 闸 | 投递 | 关开关时 |
|---|---|---|---|---|
| 用量事件 | `/v1/events` | `enabled` | 攒 25 条一批（现有语义） | **清空** |
| 轨迹 | `/v1/trajectories` | `enabled` | 一回合一条 | **清空** |
| 一键反馈 | `/v1/feedback` | **无闸** | 立刻发，失败入队静默重试 | **保留** —— 用户已经为这一条单独点过「发送」，关掉「帮 Nomi 变好」不该撤销他做过的决定。这条差异写进 manifest 的 `what`，不藏 |

队列的四条硬性：批量 · 离线缓存 · 失败静默重试 · **永不阻塞 UI**（IPC 立即返回排队结果，界面不等网络）。

### 3.3 轨迹 = 在 `laneTrace` 上做减法（**不另造格式**）

`electron/agentLane/laneTrace.mts:46` `deriveLaneTrace()` 已经把 pi 转录整成 `LaneTraceTurn`，且 span 语义已对齐 OTel GenAI（`invoke_agent Nomi` / `execute_tool <name>`，登记在 `docs/engineering/standard-formats.json` 的 `nomi-agent-trace-view`）。新增 `electron/telemetry/trajectoryProjection.mts`，在它之上**只做减法**：

| 出门 | OTel 对应 | 从哪来 |
|---|---|---|
| `gen_ai.operation.name` | ✅ 非敏感 | `spanName` 的动词部分 |
| `gen_ai.provider.name` / `gen_ai.request.model` | ✅ | `models[]` |
| `gen_ai.usage.input_tokens` / `output_tokens` / `cache_read.input_tokens` / `cache_creation.input_tokens` | ✅ | `tokens{input,output,cacheRead,cacheWrite}` |
| `gen_ai.tool.name` / `gen_ai.tool.call.id` | ✅ | `tools[]` |
| `gen_ai.response.finish_reasons` | ✅ | `status` |
| `gen_ai.conversation.id` | ✅ | `sessionId` 的**哈希**（会话 id 是本机路径的一部分，原样出门等于路径） |
| `nomi.tool.argument_keys` | 扩展 | `arguments` 的**键名数组**，值一律丢弃 |
| `nomi.tool.failed` / `nomi.tool.duration_ms` / `nomi.turn.duration_ms` / `nomi.approval.decision` | 扩展 | 同名字段 |

**一个都不出门**（OTel 自己标了敏感的那几格，正好是我们的「内容」类）：`gen_ai.input.messages`（= `prompt`）· `gen_ai.output.messages`（= `response`）· `gen_ai.system_instructions` · `gen_ai.tool.call.arguments`（只留键名）· `gen_ai.tool.call.result`（= `resultSummary`）· `errors[]` 的原文（只留码/分类）。

⑤ 勾了「也附带提示词和文稿」时，多带 `prompt` / `response` 两格，**且 manifest 里那两行的 `what` 明说是用户勾选带上的**。

**两道网，顺序有意义**：① 白名单投影（结构性——没被列出的字段根本不存在，不是被抹成空）；② 剩下的字符串（工具名、模型 id、状态码）再过一遍 `redactLogValue`（`electron/logging/redact.ts:52`）兜住「工具名里恰好拼进了一个路径」这种事。只做 ② 不做 ① 是错的——正则识别不出「这是不是一段提示词」，那份文件的头注释自己写了这条。

**金测试**（新）：喂一份含真实提示词、绝对路径、`sk-` 形状 key 的 pi 转录进投影，断言产物 JSON 里这三样**一个字都不出现**。夹具进 `tests/fixtures/`，登记进 `docs/engineering/standard-formats.json`。

### 3.4 反馈包 = 诊断包 + 这一回合轨迹

复用 `electron/diagnostics/diagnosticsBundle.ts:78` 的 manifest 机制（`DiagnosticsBundleEntry{path,bytes,what}` / `DiagnosticsBundleExclusion{what,why}`）。反馈包多两项：`trajectory/turn.json`（§3.3 的投影）与 `context.json`（自动摘要的结构化原料）。用户点「查看」看到的就是这份 manifest —— 每项一行 what，排除项一行 why。

### 3.5 错误码 → 人话：**一行新映射都不写**

仓库里这件事有**五个 owner，按域分**（调研 §三 有表）：Agent lane（`laneFailureText()`，门岗 `check:error-surface` 硬零）· 生成域（`classifyGenerationError()`）· missing-card 族 · 模型连接 · 适配器验证。

**反馈面不做第六个。** 它的入参就是**已经派生好的那句人话**：

```
FeedbackOpenRequest += { summary?: string }   // 调用处用它所在域的 owner 算出来后传进来
```

反馈面只拥有**摘要行的格式**（`<人话> · <时间> · <版本> · <模型>`）——那是排版，不是分类。样张 B 上那句 `generation_surface_unavailable` 是示意：**全仓没有这个码**（实测 src/electron/tests 零命中），走查里用真实存在的码。

---

## 4. 三个口的界面

### 4.1 首次询问卡（样张 A）

- 位置：`src/workbench/ai/v4/AgentPanelV4Empty.tsx` 的空态里，chip 行下方。
- 只问一次：一次性标记走既有约定 `src/workbench/onboarding/onboardingState.ts`（localStorage、try/catch 包住、`nomi:<name>:v1` 命名），加 `hasSeenAgentConsent()` / `markAgentConsentSeen()`。**不新造一套一次性机制**。
- 卡面：标题「帮 Nomi 变好」+ 两行话（收什么 ✓ / 不收什么 ✗）+「愿意 / 不用了」**同等大小** + 右下小字「设置里可关」。
- 两个钮都**写标记**（不用了也算问过了），「愿意」再调 `settings.telemetry.set({enabled:true})`。
- 砍掉（删除清单）：「稍后再说」（等于没问，还会再弹）· 隐私政策长文链接（放设置页）· 安装第一屏问（那一刻他还不知道 Nomi 是什么，同意无意义）。

### 4.2 一键反馈（样张 B）· 四处共用一个组件

新增 `src/ui/community/FeedbackReportCard.tsx`（发送面）+ `FeedbackButton.tsx`（那颗钮），都住在**已有的** `src/ui/community/`，沿用**已有的** `nomi-open-feedback-share` 事件通道与 `FeedbackShareHost`。

| 失败面 | 插入点 | 改动幅度 |
|---|---|---|
| A · Agent 报错卡 | `src/workbench/ai/v4/AgentPanelV4Receipt.tsx:238` 的动作行；`V4FlowHandlers` 加 `onFeedback`；`ProjectAgentResidentShell.tsx:505` 接线 | **刻意最小**：不重构 `{kind:'error'}` 的 `action?: string`，只在 `V4ErrorBar` 加一个可选 `onFeedback`。#789 与 tool-face-v2 都碰这几行 |
| B · 生成失败节点 | **已存在**（`NodeErrorReport.tsx:313`）——只把它的 detail 补上 `summary`，钮不动 | 一行 |
| C · 导入被拒 | `src/workbench/assets/AssetLibraryPanel.tsx:587` 那条常驻内联反馈行（`data-asset-library-feedback`）；`report(msg,'error')` 时记下失败种类 | 小；**不动** `notify` 的 level 语义。注意 `origin/feat/import-progress-reveal-20260914` 也在改导入面 |
| D · 模型验证失败 | `src/ui/onboarding/AdapterVerificationScreen.tsx:233-257` 的动作行 | 一行 |

卡面（用户零输入）：一行自动摘要 · 一行「附带 日志 · 模型目录 · 工具轨迹」带「查看」· 一个勾「也附带提示词和文稿」（默认不勾）· 一行可空留言 · 「发送」。发完收成一行「已发送 NF-MMDD-NNNN」。

**P1 删旧**：`src/ui/community/FeedbackShareContent.tsx` 的 `page === 'feedback'` 那张**手填表**（手选功能阶段 + 手写摘要/详情 + 「私密 Tally / 公开 GitHub」二选一 + 外跳浏览器自己提交）整块删掉，换成同一张 `FeedbackReportCard`。连带删：`communityLinks.ts` 的 `PRIVATE_FEEDBACK_URL` / `buildPrivateFeedbackUrl` / `buildGitHubIssueUrl`，以及 localStorage 发件箱 `src/ui/community/feedbackOutbox.ts`（被主进程队列取代）。

> **这是本方案里唯一一处「用户没直说、但我替他决定了」的地方，单独标出来**：旧那条路和新这条路是同一件事（「把问题告诉 Nomi」）的两个实现，P1 不许并存；而「用户零输入」与「手选阶段 + 手写摘要 + 选目的地」直接冲突。`share` 页（官网 / GitHub 两个链接）**保留**——那是分享，不是反馈。

### 4.3 用量与轨迹的开关

**不新建设置区块。** `src/workbench/settings/SettingsDialog.tsx:402-406` 的注释已经写明「「隐私与诊断」是一格两半…不另起 tab」，`TelemetrySection`（开关 + 查看摘要 + 删除全部）就是它。本 lane 在这里只做两件：① 文案里把端点承诺改成「只发到 Nomi 自己的接收端」；② 状态行区分「用量」与「轨迹」两类待发数。

**不复活 #781 删掉的任何东西**（`SystemPromptSection`、`settings.ai.policy.*`、`settings.automation.mode/risk.*`、161 项勾选白名单、`SettingsInitialSection = 'production-policy'`）。`AboutSection.tsx` 在 `settingsDialogStructure.test.ts:56-69` 的 SHA-256 钉子里，本 lane 不碰它。

### 4.4 卡点表（§1.5.5 第四件）

| 问 | 首次询问卡 | 一键反馈 |
|---|---|---|
| ① 他怎么知道有这个功能？ | 第一次打开 Agent 面板就在眼前（不用找）；之后常驻在 设置 → 通用 → 隐私与诊断 | 每个失败面上都有一颗，**就在他正看着的那张卡上** |
| ② 动手前知不知道要付出什么？ | 卡面就是「收什么 ✓ / 不收什么 ✗」两栏；不花钱、不等待、可撤（开关随时关 + 删除全部） | 「附带」那一行列清了要发什么，旁边「查看」能看原文；内容默认不带 |
| ③ 空了/错了他看到什么？ | 端点没配 → 状态行说「已开启；未配置端点，只在本机记录」（现役文案，不改） | 发送失败 → 「已排队，联网后自动重发」，**不弹错误**（四条硬性之一：永不阻塞） |
| ④ 凭什么信结果是对的、错了怎么回头？ | 「查看待发 / 已发摘要」能逐条看到发了什么；「删除全部」能清 | 拿到 `NF-MMDD-NNNN` 编号；manifest 逐项写了 what / why |
| **几步、能不能砍掉一步** | 2 步（看见 → 点愿意）。砍不动 | 2 步（点反馈 → 点发送）。**不能砍成 1 步**——那就等于没问过他，而「我让你们看多少」正是他唯一要决定的事 |

---

## 5. 接收端

`infra/feedback-worker/`：`src/worker.mjs`（三条 POST 路由 + 存活探针）· `wrangler.jsonc`（R2 + KV 绑定）· `README.md`（三步部署）· `test/worker.node-test.mjs`。

- 落 R2：`<prefix>/<yyyy-mm-dd>/<uuid>.json`，**uuid 做主键**——永不冲突、永不覆盖。
- 编号 `NF-MMDD-NNNN` 的序号来自 KV 的一次 read-modify-write，**不是原子的**：撞号的后果只是两份报告共用一个好记的名字，没有数据丢失（主键是 uuid）。用 Durable Object 换掉这点瑕疵要多一个概念 + 一条 migration，对「三步部署」不值得。这条权衡写在代码注释和 README 里。
- 服务端**刻意什么都不抹**：脱敏在客户端做完了。服务端再抹一遍会制造「反正服务端会兜」的错觉，而那正是客户端脱敏松掉的起点。
- 不存 IP / User-Agent / CF geo。
- 本机**没装 wrangler**（`which wrangler` → not found），所以 `wrangler dev` 这次**没跑**；走查用一个本机 mock 端点（Node `http` 起的 8 行服务器）验完整往返，并在 PR 正文里明说哪一段验了、哪一段没验。

---

## 6. 验收门

| 门 | 判据 |
|---|---|
| 脱敏金测试 | 真实 pi 转录（含提示词 + 绝对路径 + `sk-` key）过投影，产物里三者零命中 |
| R13 走查① | 隔离 profile 真实 App：第一次打开 Agent 面板出卡 → 点「愿意」→ 关面板重开**不再出**；截图入 `docs/evidence/` |
| R13 走查② | 假 key 触发「模型验证失败」→ 点「反馈」→ 看到自动摘要 → 发送到本机 mock 端点 → 拿到 `NF-MMDD-NNNN` |
| 设计实验室 | 两张卡各录状态（首次询问卡 2 态、反馈面 3 态：待发/已发/离线排队） |
| 五门 | 本地跑**完整** `pnpm run gates`（不手挑清单） |
| i18n | zh-CN / en 双语词条齐（`check:i18n` 的 parity + 死键 + en 里不许有汉字） |

## 7. 不做的事

- 不接 Electron `crashReporter`（minidump 必然含内容字节，无法字段级脱敏）。
- 不引任何第三方分析 SDK（承诺无法自证）。
- 不收邮箱 / 用户名 / IP / 设备指纹；不做回复闭环（⑥）。
- 不做 session replay / 自动截屏。
- 不在服务端做脱敏。
- 不新建设置区块、不新建反馈 dialog host、不写第二个 pi JSONL 解析器、不写第六张错误码→人话表。
