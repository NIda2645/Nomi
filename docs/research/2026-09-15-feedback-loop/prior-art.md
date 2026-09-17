# 反馈回路 · 先查别人（R27 / R29 / R31）

日期：2026-09-15 · 检索人：实施 lane（feat/feedback-loop-20260915）
对应方案：[docs/plan/2026-09-15-feedback-loop.md](../../plan/2026-09-15-feedback-loop.md)
对应旧拍板：[2026-09-06 opt-in 频率遥测](../../plan/2026-09-06-opt-in-frequency-telemetry.md)（Aptabase）· [2026-09-01 反馈与分享中心](../../plan/2026-09-01-feedback-share-center.md)（Tally / GitHub）

> **这份报告的结论先写在最前面**：这件事**在本仓已经有三分之二**。
> 管道（同意合同 / 白名单事件 / 落盘 outbox / 离线重试 / 关掉即删）2026-09-06 就建好了，
> 只是端点指向 Aptabase；脱敏（密钥 / 路径 / 内容三类）有四份成熟实现；
> 诊断包的 manifest（每项写 what / excluded why）现成；反馈中心的事件通道、
> 供应商身份脱敏、localStorage 发件箱也现成。
> **真正缺的只有四件**：① 自建接收端；② 首次询问卡；③ 轨迹的字段白名单投影；④ 一键、零输入的反馈面。
> 本 lane 的主要工作量因此是**接线与替换**，不是新建管道。

---

## 一、四列表 · 我们已经引入的三个「框架」

### 1.1 Aptabase（现役，本 lane 要删）

| 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| 桌面事件上报端点 `POST /api/v0/events`，`App-Key` 头，批量 ≤25，无设备 ID / 无 raw IP（[官网隐私说明](https://aptabase.com/)：「Sessions are completely anonymous and untraceable… no pseudonymisation, full anonymisation」） | 只用了它的**传输契约**：`electron/telemetry/aptabaseAdapter.ts:7` `sendAptabaseBatch()`；端点推导 `electron/telemetry/telemetrySettings.ts:41` `telemetryEndpoint()`（`A-EU-` / `A-US-` 前缀 → 区域） | 事件白名单与校验 `electron/telemetry/telemetryEvents.ts:66` `isTelemetryProps()`（精确键 + 枚举成员 + 只许原语）；落盘 outbox `electron/telemetry/telemetryOutbox.ts`（`MAX_PENDING=100` / 7 天过期 / 25 条一批 / 30s 重试）；同意合同 `telemetrySettings.ts:6`；查看+删除 UI `src/workbench/settings/TelemetrySection.tsx` | **没拆散**。没装它的 SDK（仓库 `package.json` 里没有任何 aptabase / posthog / sentry 依赖，实测 `node -e` 过滤依赖表为空），只照它的 HTTP 契约手写了 31 行 adapter |
| **裁决** | 传输那一格换成自建端点（用户 09-15 拍板「数据只去我们的端点」）。`aptabaseAdapter.ts` 本 lane 删除，`endpointMode: 'aptabase'` → `'nomi'`。**白名单 / outbox / 同意合同 / 设置 UI 一行不动地继续用**——它们本来就不是 Aptabase 的东西 | | | |

### 1.2 Electron `crashReporter`（我们没接，本 lane 也不接）

| 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| 进程崩溃的 minidump 采集 + `multipart/form-data` 上传到 `submitURL`；`extra` / `globalExtra` 键 ≤39 字节、值 ≤127 字节（`addExtraParameter` 放宽到 20320）；`uploadToServer:false` 时只落盘不上传；`rateLimit` 每小时 1 次（[官方文档](https://www.electronjs.org/docs/latest/api/crash-reporter)） | **一个都没用**（全仓 `grep -rn crashReporter electron src` 无命中） | 崩溃与进程死亡走我们自己的日志：`electron/logging/logFiles.ts:173` `listLogFilesForBundle()` 把 crash log 排在诊断包第一位 | — |
| **裁决** | **不接**。理由是领域约束不是偏好：minidump 是**原生内存快照**，它必然含用户的提示词与文稿字节，而我们对用户的承诺是「内容默认不出门」。官方文档里**没有一句**关于敏感数据的警告，等于把判断全留给接入方；我们接了就等于把一条无法字段级脱敏的通道打开。JS 层异常本来就已经进日志并被 `redactError()` 逐帧抹掉目录（`electron/logging/redact.ts:123`）。**本 lane 明确记一句「不用」，不留「以后再说」。** | | | |

### 1.3 OpenTelemetry GenAI 语义约定（已对齐，本 lane 继续对齐）

| 它提供 | 我们用了 | 我们另写了 | 我们拆散了 |
|---|---|---|---|
| `gen_ai.*` 属性注册表：`operation.name` / `provider.name` / `request.model` / `response.model` / `tool.name` / `tool.call.id` / `usage.input_tokens` / `usage.output_tokens` / `usage.cache_read.input_tokens` / `usage.cache_creation.input_tokens` / `conversation.id` / `response.finish_reasons`；span 名 `{operation.name} {request.model}`，工具是 `execute_tool`。**明确标了敏感的那几格**：`gen_ai.input.messages` / `output.messages` / `system_instructions` / `tool.call.arguments` / `tool.call.result` / `retrieval.query.text`（[属性注册表](https://raw.githubusercontent.com/open-telemetry/semantic-conventions/main/docs/registry/attributes/gen-ai.md)） | span 语义：`electron/agentLane/laneTrace.mts:62` `spanName: 'invoke_agent Nomi'`、`:75` `` `execute_tool ${part.name}` ``；token 四格 `tokens{input,cacheRead,cacheWrite,output}` | 本地可读的字段名（`durationMs` 而非 `duration`），理由与偏差已登记在 `docs/engineering/standard-formats.json` 的 `nomi-agent-trace-view` 条目 + `docs/plan/2026-09-10-trace-log.md:12` | 刻意**不**装 OTel SDK、不声称本地 JSONL 是 OTLP；pi 的 `cacheRead`/`cacheWrite` 保持分开，不把原生 input 冒充成 OTel 的「含缓存 input」 |
| **裁决** | 轨迹投影（本 lane 新增）**只准用上表左列里那些非敏感的名字**，敏感的六格一个都不出门。这不是新格式，是在 `nomi-agent-trace-view` 上再做一次**减法投影**（R31：自定义只能放在标准的扩展点，不另起平行文件） | | | |

---

## 二、别人的同意卡与反馈面怎么做的（抄哪几句）

| 来源 | 它的形状 | 我们抄什么 / 不抄什么 |
|---|---|---|
| **Sentry User Feedback**（[产品文档](https://docs.sentry.io/product/user-feedback/)） | 一个 widget 收五类：用户描述、用户截的图、邮箱、**前 60 秒 session replay**、页面 URL + tags。哪些字段必填**可配置** | **抄**：「自动附带上下文」这件事本身，以及「必填项可以配成零」。**不抄** replay（那是连续录屏，等于把创作内容整段带走）与邮箱（用户 09-15 定「只给编号，不做回复闭环」，收邮箱就是承诺回复）。**对照我们的差异**：我们连「用户描述」都设成可空——用户原话「一键反馈里的东西大部分不能让用户填」 |
| **PostHog**（[隐私控制](https://posthog.com/docs/privacy) · [控制采集](https://posthog.com/docs/privacy/data-collection)） | `opt_out_capturing_by_default: true` 可把默认改成不收；`posthog.opt_in_capturing()` 显式同意；`before_send` 钩子在**客户端**改写或整条丢弃事件；`has_opted_out_capturing()` 查状态 | **抄**：`before_send` 那条「脱敏发生在离开客户端之前」的位置判断——这正是用户 09-15 那条硬约束。我们的等价物是 `isTelemetryProps()`（`telemetryEvents.ts:66`）与本 lane 新增的轨迹投影，两者都跑在主进程、在 fetch 之前。**不抄**：不引它的 SDK（会顺带把自动采集、录屏、person profiles 的能力面带进来，而我们的承诺是「数据只去我们的端点」） |
| **Aptabase** | 见 §1.1。它的「Never Collected」清单写得最干脆：无设备 ID / 无广告 ID / 无指纹 / 无持久标识 / IP 只用于推国家且不落盘 / 无姓名邮箱 | **抄它的措辞结构**（「收什么 ✓ / 不收什么 ✗」两栏并排），样张 A 的卡面就是这个形状。**不抄**它的托管端点 |
| **Anthropic / Claude 桌面端**（[隐私中心：怎么改模型改进设置](https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings) · [消费者条款更新](https://www.anthropic.com/news/updates-to-our-consumer-terms)） | 新用户在注册流里选；**老用户见一次弹窗**；设置里 Privacy → 「Help improve our AI models」开关随时可改；同意与不同意对应不同保留期 | **抄三件**：① 只问一次；② 问的时候给的是二选一而不是「稍后再说」；③ 开关的家在 设置 → 隐私，文案叫「帮助改进 Nomi」（我们 `settings.general.telemetry.toggle` 现役文案已经是这句，不改）。**不抄**：不谈模型训练（我们不拿数据训模型），所以不需要保留期分档那套话 |
| **我们自己 2026-09-01 的反馈中心**（`docs/plan/2026-09-01-feedback-share-center.md`） | 设置 → 关于 → 反馈与分享；`home / feedback / share / success` 四页；用户**手选功能阶段 + 手写一句话**，再选「私密 Tally / 公开 GitHub」，最后**在浏览器里自己提交** | **抄**：事件通道 `nomi-open-feedback-share`（`src/ui/community/FeedbackShareHost.tsx:14`）、供应商身份脱敏 `sanitizeProviderIdentity`（`src/ui/community/feedbackDiagnostics.ts:41`，自定义中转的 key 会编码用户的 base-url，所以塌成字面量 `custom`）、`safeFeedbackValue`（`feedbackTypes.ts:27`）。**删**：手选阶段 + 手写摘要 + 目的地二选一 + Tally/GitHub 外跳 —— 与「用户零输入 + 数据只去我们的端点」直接冲突，留着就是 P1 的并行版 |

---

## 三、仓库里已有（这一列最长 —— 也是本 lane 最重要的发现）

| 我们需要的东西 | 已经在哪 | 本 lane 怎么办 |
|---|---|---|
| 同意合同（默认关 / 同意时间 / 匿名会话 id） | `electron/telemetry/telemetrySettings.ts:6-24`，`DEFAULT_TELEMETRY_SETTINGS.enabled === false` | **直接用**。首次询问卡只是它的第二个写入口 |
| 白名单事件 + 校验 | `electron/telemetry/telemetryEvents.ts:4`（5 个事件名）、`:66` `isTelemetryProps()` | **扩**两个事件（Agent 回合、模型种类），不另造词表 |
| 落盘发件箱 / 离线 / 静默重试 / 关掉即删 | `electron/telemetry/telemetryOutbox.ts:33,57,69` | **抽**出可复用的队列给反馈与轨迹共用；事件那一路语义不动 |
| 「每项写 what / excluded why」的 manifest | `electron/shared/contracts/diagnostics.ts:3` `DiagnosticsBundleEntry{path,bytes,what}`、`:12` `DiagnosticsBundleExclusion{what,why}`、`:14` manifest | **直接用**。反馈包的清单就是这两个类型 |
| 诊断包本体（日志 + 模型目录脱敏 + run 收据 + 大小上限） | `electron/diagnostics/diagnosticsBundle.ts:78` `buildDiagnosticsBundle()`（纯函数）、`:22` 25MB 上限、`electron/diagnostics/diagnosticsIpc.ts:49` | **直接用**。反馈包 = 它 + 这一回合轨迹 |
| 密钥脱敏（对象负载） | `electron/events/redact.ts:29` `redactDeep()` —— 已知密钥值精确匹配 + `api_key\|authorization\|token\|secret\|password\|x-api-key` 字段名 + `sk-`/`Bearer` 形态 + **query 鉴权参数**（含 %-编码） | **直接用** |
| 路径 + 内容脱敏（文本） | `electron/logging/redact.ts:42` `isDeniedFieldName()`（prompt/content/path/url/asset… 37 个名字 + 12 个词根）、`:52` `redactLogValue()`（`data:`/`blob:` → `<blob>`、http 只留 `scheme://host`、`file://`/盘符/裸绝对路径 → `<path>`、长 base64 → `<redacted>`、200 字上限） | **直接用**，当轨迹投影的第二道网 |
| 模型目录脱敏 | `electron/diagnostics/catalogRedaction.ts:86` `redactModelCatalog()` | **直接用** |
| Agent 逐回合轨迹（含 token / 工具 / 审批 / 状态） | `electron/agentLane/laneTrace.mts:46` `deriveLaneTrace()` → `LaneTraceTurn` | **在它之上做减法投影**，不碰它、不写第二个 pi JSONL 解析器（`check:framework-boundary` 把 `electron/agentLane/` 的 `session-persistence` 锁住了） |
| pi 转录的密钥抹除（按偏移区间） | `electron/agentLane/laneTraceRedaction.mts:61,111` | **直接用**（投影前先 apply） |
| 错误码 → 人话 · Agent 域 | `src/workbench/ai/lane/laneCommandFailure.ts:139` `laneFailureText()`；码表 `electron/shared/agentLane/laneErrorCodes.ts:39`；整键表 `:23` `LANE_ERROR_TEXT_KEY`；门岗 `scripts/check-error-surface.mjs` 规则① 硬零 | **只读不写**。反馈面**不带**自己的码表，由调用处把已派生的人话传进来 |
| 错误码 → 人话 · 生成域 | `src/workbench/observability/classifyError.ts:441` `classifyGenerationError()` → `{kind,reason,hint,providerMessage}` | 同上 |
| 反馈面的打开通道 | `src/ui/community/FeedbackShareHost.tsx:14` `window` 事件 `nomi-open-feedback-share`；现役唯一派发处 `src/workbench/generationCanvas/nodes/NodeErrorReport.tsx:187` | **直接用**，四个失败面都派发它 |
| 供应商身份脱敏 | `src/ui/community/feedbackDiagnostics.ts:41,60` | **直接用** |
| 设置页「隐私与诊断」一节 + 开关 + 查看/删除 | `src/workbench/settings/TelemetrySection.tsx`（`data-settings-section="telemetry"`）；i18n `src/i18n/locales/settings.ts:237`（zh）/`:529`（en）；设计实验室 `src/devlab/designLab/settings/states/01-privacy-diagnostics.tsx` | **不新建第二节**。任务书说「设置页加隐私一节一个开关」——它已经在了，本 lane 只改文案里的端点承诺 |

**两处顺手发现的陈旧物**（记录，不在本 lane 修，除非顺手零代价）：
- `src/workbench/ai/agentFailureDiagnostics.ts` 全仓零 importer（v3→v4 面板重写时消费者被删、分类器留下了）。
- `docs/fixes/2026-09-05-agent-failure-diagnostic-redaction.root-cause.json` 仍在守 `data-agent-error-code` / `data-agent-error-message-category` 两个已不存在的 DOM 属性。

---

## 四、依赖里已有？

`node -e` 过滤 `package.json` 的 dependencies + devDependencies，命中 `telemetr|analytic|sentry|posthog|aptabase|otel|opentelemetry|wrangler|cloudflare` 的条目数 = **0**。
`node_modules` 同样没有这些包。所以「依赖里已有」这一问的答案是**没有**——现役 Aptabase 通路是手写的 31 行 HTTP adapter，不是 SDK。

接收端侧 `wrangler` 本机也**没装**（`which wrangler` → not found）。本 lane 写 `infra/feedback-worker/` 的源码与部署说明，不把 wrangler 加进主仓依赖（它是接收端的工具链，不是 App 的）。

## 五、TikHub 自媒体里怎么说？

**今天没查成。** 本机 `~/.nomi-secrets.env` 里只有 `DEEPSEEK_API_KEY`，没有 TikHub key，调研 agent 拿不到出站凭据。
替代检索：中文技术社区关于「Cloudflare Workers 自建数据收集后端」的公开材料确实成规模（[Workers 开源项目盘点](https://github.com/zhuima/awesome-cloudflare)、[Workers 实战部署手册](https://www.heyuan110.com/posts/docker/2026-01-23-cloudflare-workers-guide/)），说明 Worker + 对象存储做自建接收端是一条被走熟的路，不是我们独创的冷门方案。
但**这不等于把 TikHub 那一问答了**——真实创作者对「桌面应用收我的数据」的情绪与措辞偏好，这次没有取到。用户点头后可以补一轮。

---

## 六、结论

| 判断 | 用已有 / 自研 | 理由 |
|---|---|---|
| 事件白名单 / 同意合同 / 发件箱 / 设置 UI | **用已有**（2026-09-06 已建） | 它们不是第三方的东西，换端点不动它们 |
| 传输端点 | **自研（换成自建 Worker）** | 用户 09-15 拍板「数据只去我们的端点」。第三方 SDK 的代价不是钱而是**信任承诺无法自证**：只要 SDK 在进程里，「不收别的」就只能靠对方的文档 |
| 崩溃采集 | **不做**（不接 `crashReporter`） | minidump 必然含内容字节，无法字段级脱敏 |
| 轨迹字段命名 | **用已有标准**（OTel GenAI 非敏感子集） | R31；`laneTrace.mts` 已对齐，投影只做减法 |
| 脱敏 | **用已有四份** | 它们各自守着不同的输入形状，合并只会让每一边都变钝（两份实现的头注释都写明了这条） |
| 一键反馈的表单 | **自研，并删掉旧的手填表单** | 「用户零输入」与「手选阶段 + 手写摘要 + 选目的地」是同一件事的两个实现，P1 不许并存 |
