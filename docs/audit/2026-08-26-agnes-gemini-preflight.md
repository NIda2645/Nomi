# Agnes 全模型与 Gemini / Antigravity 接入前核验

日期：2026-08-26（Asia/Shanghai）。状态：**接入前的历史调研记录，不代表当前实现状态**。后续代码、真实生成与构建验收见 [Agnes 运行验证](2026-08-26-agnes-runtime-verification.md)；CLI 安装、认证与完整能力状态见 [Antigravity 核对](2026-08-26-antigravity-full-capability.md)。本页的未安装、未修改、未提交等描述均指当时检查时点。

> 最新凭证已由用户替换。第 2 节及“已付费后复核”属于旧凭证历史；当前凭证的结论以文末“替换凭证 / TokenPlan”一节为准，不得混用。

## 1. 工作树与同步

- 共享目录 `/Users/aoqimin/Desktop/Nomi` 位于 `task/replicate-model-contract-tests`，有未提交修改及未解决冲突。本任务没有改动、切换或清理这个目录。
- 已通过 GitHub API 核实远端 main 为 `a712da0244e82fe36f629e6952c89d14fc7266bd`，随后经本机系统代理成功执行 `git fetch origin --prune`。
- 独立工作树：`/Users/aoqimin/Desktop/Nomi-agnes-gemini-20260826`。
- 分支：`codex/agnes-gemini-integration-20260826`，基于上述 origin/main。
- 没有合入尚未合并的 pi 迁移 PR #181 或 E2 PR #179。此报告不代表此前迁移工作已完成。
- 没有新提交、push 或 PR；没有修改生产代码。

## 2. Agnes：模型清单不等于调用权限

用户提供的凭证仅发送至已核对的 Agnes 官方 API。未写进此报告、仓库代码或结果日志。

`GET https://apihub.agnes-ai.com/v1/models` 返回 HTTP 200、10 个模型。

| 模型 ID | 当前 Nomi 内置 | 本轮初测 |
|---|---|---|
| agnes-2.0-flash | 是 | 基础文本 HTTP 200，输出符合指令 |
| agnes-2.5-flash | 否 | 基础文本 HTTP 200，输出符合指令 |
| agnes-2.5-pro-alpha | 否 | 基础文本 HTTP 200，输出符合指令 |
| agnes-2.5-pro-beta | 否 | HTTP 403，team_model_access_denied；未重试 |
| agnes-2.5-pro | 否 | 基础文本 HTTP 200，输出符合指令 |
| agnes-image-2.0-flash | 是 | 官方 API HTTP 200；产物下载 1,303,048 bytes，PNG 已亲眼检查 |
| agnes-image-2.1-flash | 是 | Nomi 真实 runtime 文生图、改图已返回 succeeded |
| agnes-video-v2.0 | 是 | Nomi 真实 runtime 文生视频、图生视频均 succeeded |
| agnes-video-2.5 | 否 | 用户表示已付费后再测仍 HTTP 403 insufficient_user_quota；余额低于最低时长预扣，具体账户金额不公开 |
| agnes-video-2.5-flash | 否 | 限流窗口后提交 HTTP 200；轮询 completed，实际产物字段为顶层 url（与文档 metadata.url 不同） |

文本 smoke 为直接官方 API 请求，不是 Nomi Agent 工具闭环测试。四个成功请求共 1049 tokens（供应商 usage）；不把它们算作流式、视觉、工具调用或多轮能力的完成证明。

403 响应中的可访问列表包含七个模型，但这只作为账户权限线索，不代替各 API 的真实调用结果。不得把 `/models` 列表整体标成“已验证可用”，也不得遇到权限拒绝后轮换入口绕过。

### 2.1 已抓到的真实契约差异

| 范围 | 需要处理的缺口 | 代码锚点 |
|---|---|---|
| 文本 | 内置只有 2.0 Flash；需要覆盖另四个文本模型，分别核实费用和权限 | `electron/catalog/agnesTexts.ts:20`、`electron/catalog/seedBuiltins.ts:177` |
| 文本视觉输入 | Agnes seed 没有声明 supportsImageInput，名字也不匹配当前 vision 兜底规则；官方支持图片不等于 Nomi 会把附件送出。应在模型元数据声明能力并测实际附件请求 | `electron/ai/agentUserContent.ts:33`、`electron/catalog/seedBuiltins.ts:177` |
| 图像 | 官方 2.1 文档已有 1K–4K 档位与 ratio；现有档案只有像素尺寸选项，mapping 不传 ratio | `src/config/modelArchetypes/agnesImage.ts:11`、`electron/catalog/agnesImages.ts:27` |
| 视频 V2.0 | 当前只有文字与单图模式，缺官方 keyframes，以及部分高级参数；参考数量不可凭空填写 | `src/config/modelArchetypes/agnesVideo.ts:34`、`electron/catalog/agnesVideos.ts:44` |
| 视频 2.5 | 新增 text / keyframe / reference；seconds 是字符串；首尾帧字段和多模态参考字段与 V2.0 不同 | 尚无对应档案/mapping |
| 视频 2.5 Flash | 不能照搬完整 2.5：仅 720P，参考图最多 5 张，不支持有效 videos 输入，仍支持音频参考 | 尚无对应档案/mapping |
| 视频 2.5 轮询 | `/agnesapi` 必须带 video_id 和 model_name；文档产物路径为 metadata.url，但本轮 Flash 实际返回顶层 url，须保留实际响应夹具对账 | `electron/catalog/agnesVendor.ts:46`、`electron/catalog/seedBuiltins.ts:186` |
| 视频 V2.0 实际结果 | 本轮成功响应 remixed_from_video_id 为 null，产物在顶层 url；现有 runtime 通用提取路径仍取到了产物，旧显式 mapping / 注释须纠正 | `electron/catalog/agnesVendor.ts:55` |
| 费用提示 | Pro 系列和 Video 2.5 不能沿用“全模态永久免费”的统一宣传 | `src/config/knownVendors.ts:89`、`src/i18n/locales/onboardingProviders.ts` |
| 出处门岗 | Agnes 两个旧档案没有 sources；修契约时需补来源及 checkedAt、同步减白名单 | `src/config/modelArchetypes/agnesImage.ts`、`agnesVideo.ts` |

来源（本轮 2026-08-26 实际读取；以各模型文档及账户结果为准）：

- [概述](https://agnes-ai.com/zh-Hans/docs/overview)
- [2.0 Flash](https://agnes-ai.com/zh-Hans/docs/agnes-20-flash)
- [2.5 Flash](https://agnes-ai.com/zh-Hans/docs/agnes-25-flash)
- [2.5 Pro Alpha](https://agnes-ai.com/zh-Hans/docs/agnes-25-pro-alpha)
- [2.5 Pro Beta](https://agnes-ai.com/zh-Hans/docs/agnes-25-pro-beta)
- [2.5 Pro](https://agnes-ai.com/zh-Hans/docs/agnes-25-pro)
- [Image 2.0](https://agnes-ai.com/zh-Hans/docs/agnes-image-20-flash)
- [Image 2.1](https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash)
- [Video V2.0](https://agnes-ai.com/zh-Hans/docs/agnes-video-v20)
- [Video 2.5](https://agnes-ai.com/zh-Hans/docs/agnes-video-25)
- [Video 2.5 Flash](https://agnes-ai.com/zh-Hans/docs/agnes-video-25-flash)

## 3. Gemini：已经有预设，但生产地址拼接错误

官方 [OpenAI 兼容文档](https://ai.google.dev/gemini-api/docs/openai) 经 Context7 与 web 核对：正确 base 为 `https://generativelanguage.googleapis.com/v1beta/openai/`，以 Gemini API key 做 Bearer 鉴权。

实查生产链：

1. `src/ui/onboarding/providerPresets.ts:40` 已有 Gemini，base 正确。
2. `electron/ai/onboarding/modelListProbe.ts:82` 直接追加 `/models`，可与官方契约一致。
3. Agent 和文本任务共同走 `electron/ai/vendorLanguageModel.ts:16`，调用 `endpoint(vendor, "/v1")`。
4. `electron/ai/requestPipeline.ts:185` 的 joinUrl 只处理少量版本后缀，实际返回 `https://generativelanguage.googleapis.com/v1beta/openai/v1`。
5. SDK 再追加 `/chat/completions`，与官方路径不符。

已用 `pnpm exec tsx` 调用生产 endpoint 函数复现，不是只读注释推测。因此可能出现“拉模型正常，真正文字生成失败”。同类风险还包括显式 `/api/v3`、`/api/paas/v4` 的 SDK base，修复应统一显式 API base 的处理，不能只对 Google 域名单独打补丁。

本轮没有 Google 凭证，未发送真实 Gemini 生成请求。不得把 URL 复现或 mock 测试报告成 Google 实测通过。

## 4. Antigravity：用户已指定 Infinite-Canvas 的本机 CLI 路线

用户随后提供 [Infinite-Canvas](https://github.com/hero8152/Infinite-Canvas) 与截图，已消除项目身份及接入层歧义。不能再要求用户确认是哪一个画布，也不能把它误写成反向代理。

固定源码 commit `1c141a5715c04bbf29b4c2cf76fb78739da8cfe8` 的实际行为：

- `main.py:5510–5543` 寻找本机 agy（仍有旧 gemini fallback）。
- `main.py:5603–5652` 直接调用 `agy --print-timeout Ns [--model X] -p PROMPT`，不提取 Google token、不调用逆向 HTTP。
- `main.py:12994–13033` 检测只跑 `--version`，logged_in 为未知；不等于账号可调用。
- 模型仅硬编码 auto；文字等待完整 stdout 后一次性发送 SSE delta，不是真正逐字流式。
- 该调用链只有超时 kill，未连接用户取消；聊天不传跳过权限开关不等于工具已禁用。
- 截图中的“启动 / 系统代理”控件在这一固定公开 main 未找到相同实现，不能混为已证实能力。
- 项目许可限制商业封装，不复制代码；按 Google 官方 CLI 协议独立实现。

官方 [headless 文档](https://www.antigravity.google/docs/cli/headless/)支持 stream-json、明确会话 ID、真实 usage / result 状态及程序调用；`control_request/control_response` 未支持，不能声称已接通 Nomi 原生工具审批。官方 [权限文档](https://antigravity.google/docs/cli/permissions)说明工作目录内读写默认可能允许，因此需要真实权限隔离验证，不能只用提示词禁止写文件。

CLI 与独立 Gemini API 不是同一条鉴权/计费通道。Google [条款](https://antigravity.google/terms)对第三方访问有约束；“CLI 支持程序调用”不等于消费订阅复用许可已得到确认。不得承诺无限免费、自动绕过额度或复制登录 token。

本机只读检查未发现 agy（PATH 与常见安装位均无），已有 gemini 不等于 agy。未安装、未登录、未调用 Google 生成。接入方案与现有 Nomi 外壳样张见 `docs/plan/2026-08-26-agnes-gemini-antigravity-design.md`。

## 5. 后续实现范围与验收门（提案，未批准、未执行）

1. 在现有 catalog/archetype/参数面板内补齐 Agnes 的模型与模式；不做第二套供应商界面或新的 Agent loop。
2. Gemini 修到通用 SDK base 处理层；对 bare host、显式 v1/v3/v4、Gemini v1beta/openai、自定义路径和尾斜杠增加回归验证。
3. 保留用户模型启停、名称、凭证、优先级；通过现有 seed reconcile 做幂等升级，不重建用户目录。
4. 先给现有界面中的参数/模式变化出可体验样张并确认，再实现可见变化；费用文案分别说明免费与付费模型。
5. 合同测试覆盖变体 × 模式 × 参考通道、字段类型、互斥、轮询与产物路径；真实测试严格按供应商视频限流串行排队。
6. 真实任务覆盖“文字规划与工具闭环”“生成图片后修改”“首尾帧/多模态出片后落入项目”；HTTP 成功或 taskId 不算闭环。
7. 对 403 明示账户权限阻塞；对 429 记录退避/实际重试，不把它算接入失败或通过。
8. 完成项目质量门禁、视觉走查和持久化验证后才提交分支、开 PR；未经用户要求不合并。

### 尚需确认 / 资源

- 已确认 Infinite-Canvas 的 agy 路线；待确认 Nomi 接入样张与第一阶段文字任务边界，之后真测需要安装官方 CLI 并由用户完成 Google 登录。
- Gemini 官方测试凭证，或用户指定且授权使用的 Gemini 中转地址及凭证；不会把 Agnes key 发往 Google 或第三方。
- 当前替换 Key 只列六款；其余四款的套餐/渠道权限需供应商开通才能全量真测。旧 Key 余额问题不再代表当前 Key 状态。未自动充值或修改账户套餐。

## 6. 本轮验证回填

- `pnpm exec vitest run electron/catalog/agnes.test.ts electron/vendorEndpoint.test.ts electron/ai/requestPipeline.test.ts electron/ai/modelProfiles.test.ts`：4 文件、68 测试通过（现有基线测试，不代表新增能力被覆盖）。
- `pnpm run build`：通过；存在既有 chunk size / 动静态混合导入警告。
- 生产 endpoint 复现：Gemini base 被错误追加 `/v1`，尚未修复。
- `tests/ux/agnes.e2e.mjs` 使用本轮新构建与隔离 profile：4/4 通过（t2i、edit、t2v、i2v）；密钥在测试进程环境注入，错误输出经过脱敏。
- Image 2.0 官方 API 另测生成与下载通过，已查看实际 PNG，内容为白桌上的红色纸鹤，符合测试提示。
- V2.0 两个视频进一步下载并通过 ffprobe：均为 H.264 + AAC、832×448、3.041667 秒。供应商标准化了请求尺寸，不能把界面请求的“480p”当成实际输出尺寸。
- 旧凭证下 Video 2.5 Flash 下载及 ffprobe 通过：H.264 + AAC、1280×704、4.458333 秒。产物字段是顶层 url，且输出时长与请求 4 秒有差异，回放/时间轴应使用实测媒体时长。
- 这些测试证明已有传输链部分可用，不证明新模型已经接入、完整参数覆盖、Agent 工具闭环或用户项目持久化完成。
- 尚未执行完整质量门禁；不得把基线测试及构建通过报告成整个任务完成。

### 用户表示“已经付费”后的复核

- 同一凭证再次请求 Pro Beta：仍为 HTTP 403 `team_model_access_denied`；没有重试或更换接口绕过权限。
- 同一凭证再次请求 Video 2.5，官方文档允许的最低 4 秒 / 720P：仍为 HTTP 403 `insufficient_user_quota`，余额低于预扣需求；具体账户金额不公开。
- 未取得账户账单，因此不将期间余额变化归因于某一请求，不按官网“现价 $0”承诺实际免费。
- 暂停进一步付费生成。需要用户核对已付款账户与此 Key 的对应关系、余额是否到账、Pro Beta 单独权限；不能替用户自动充值。
- 至此 10 个返回模型都至少发起一次合法基础调用：8 个获得基本成功结果，2 个仍为外部账户阻塞。不是全部模式/参数完成测试，更不是 Nomi 已完成新增 6 个模型的接入。

### 替换凭证 / TokenPlan（当前凭证）

用户随后提供了替换凭证并明确要求使用。旧凭证停止使用；这里不存储新旧密钥或其片段。

- 新凭证 `/v1/models` 成功，模型清单只有六款：`agnes-2.0-flash`、`agnes-2.5-flash`、`agnes-image-2.0-flash`、`agnes-image-2.1-flash`、`agnes-video-v2.0`、`agnes-video-2.5-flash`。
- 新凭证 Pro Beta 与普通 Video 2.5 的基础请求均返回 HTTP 503 `model_not_found`，具体原因为 `No available channel ... under group TokenPlan (distributor)`。不是暂时网络 503，不盲目重试。
- Pro / Pro Alpha 未出现在新清单中，没有用新凭证调用，不借用旧凭证成功记录推断新凭证可用。
- 新凭证两个文本 Flash 均完成直接 API 的流式 tool-call 检验：SSE 正常结束，工具名 `plan_shots`，参数 `{"count":2}` 正确；共 1208 tokens。未把此测试当成 Nomi 内多轮 Agent 执行完成。
- 新凭证 Image 2.0 直接官方生成请求 HTTP 200，返回图像 URL。
- 新凭证已重跑 `tests/ux/agnes.e2e.mjs`：4/4 通过，覆盖 Image 2.1 文生图/改图、Video V2.0 文生视频/图生视频。
- 新凭证 2.5 Flash 视觉测试 HTTP 200，正确识别 Image 2.0 产物为红色折纸鹤；usage 1447 tokens（其中 image_tokens 1024）。它验证上游视觉能力，不代表 Nomi 的附件能力声明缺口已修复。
- 新凭证当前已知文本测试 usage 合计 2655 tokens；未获取供应商账单，费用不作猜测。
- 产品范围仍是核对所有公开模型。不能因为此 Key 只列六款就把另外四款从公开模型范围删掉；也不能把十款全部展示成此套餐可调用。

### 最新补测：当前 Key 的 Video 2.5 Flash

- 只提交过一次生成任务；中途遇到查询 TLS 中断及 HTTP 429，未重新提交生成；间隔后恢复查询同一 task。
- 查询最终 HTTP 200，status=completed、progress=100，产物在顶层 url。
- 已下载 538686 bytes MP4，并通过 ffprobe：H.264 视频、AAC 音频，1280×704、4.458333 秒。
- 这是直接上游 2.5 Flash 冒烟测试，尚不是 Nomi 新模型接入后的真实用户任务验证。
