# Agnes 全模型、Gemini 修复与 Antigravity CLI 接入设计提案

2026-08-26。初始基线 `a712da0244e82fe36f629e6952c89d14fc7266bd`；已同步更新后的 origin/main `5f09b95d`（#185），保留其默认参数分片与供应商单源改造。

**状态：初版样张曾获批准；用户随后明确纠正 Antigravity 不仅文字，要求全部能力。完整能力样张已修订，待确认。文字适配器仅是底层一个任务配置；多媒体接入与真实验证尚未完成。**

## 1. 用户需求与已澄清方向

- Agnes 按当前公开官方文档覆盖全部 10 款模型及模式，使用用户最后提供的凭证测试。不得把凭证写入代码、日志或报告。
- Gemini 已有预设，修复文字调用错误追加 `/v1` 的根因。
- 用户明确给出 Infinite-Canvas 和 Antigravity CLI 截图：要由本机 `agy` 使用它自己管理的 Google 登录状态，优先节省文字思考费用。不是托管 Agent API，也不是提取 OAuth token 做反向代理。
- 最新基线已 fetch 到独立 sibling worktree；共享树含冲突，禁止修改。仅经任务分支 + PR 交付，不自动合并。

## 2. 核心取舍

| 方案 | 用户得到什么 | 代价 | 决定 |
|---|---|---|---|
| 本机官方 agy 通道 | 已登录账号的实际可调用文字与媒体能力进入原有任务入口；无需额外填写 Key | 依赖本机安装、登录、配额与官方条款；媒体工具契约与 Nomi Agent 工具分别验证 | 按用户指定路线设计 |
| Gemini 官方 API | 可以复用 Nomi 的模型 API 与工具调用链 | 需要独立 Google API 凭证与相应费用 | 保留并修复现有入口，不取代 agy |
| 提取消费端 token / 内部接口代理 | 能模仿部分社区中转 | 凭证、许可及稳定性风险；不是用户截图里的实现 | 不做 |

**用户纠正后范围：** Antigravity 不得限定文字；需逐项核对文字/视觉输入/生图/改图，以及视频、音频等是否确实由官方 CLI 提供。所有已证实且可调用的能力都纳入接入与真实测试。现有文字适配器只是其中一个任务配置，不能以禁用全部工具替代图片能力设计。媒体工具需要明确的任务级权限、产物导入、取消与支出边界；尚无官方调用契约的能力不得伪造模型入口。完整 Nomi Agent 工具循环与 CLI 内置媒体工具是不同契约，分别验证。Agnes/Gemini 已有工作保留。

## 3. 界面提案与现有外壳（完整能力修订，待再次确认）

样张：`docs/design/mockups/2026-08-26-antigravity-cli.html`。当前机器记录为 **CLI 已安装、Google 尚未登录**。默认画面忠实反映这一前提；样张中已验证/受限状态全部注明“示例”，不会执行 CLI、发起模型请求或消耗额度。初版仅文字样张的批准不视为本次能力布局已获批准；生产卡片暂停，等待此修订确认。

画样张前已完整读取 `ModelSettingsHome.tsx`、`ModelSettingsPageSurface.tsx`、`ModelSettingsDetailDialog.tsx`、`FoldableModelCard.tsx`、`CodexLocalImageCard.tsx` 及 `ModelChipGroups.tsx`；本次再次核对真实首页/连接卡外壳与设计系统 §1.5。保留现有设置页宽度、页头、返回、滚动区与 token 明暗主题，不另建设置面。

### 3.1 为什么这样分组

文字能回复，不代表它能接收图片，更不代表图片工具已能安全生成和导入素材。用户要的是接入账户已有的全部可调用能力；不能用一次文字试跑把整张连接卡标成“全可用”。

| 方案 | 用户看到什么 | 代价 / 决定 |
|---|---|---|
| 同一连接内分组，每项独立验证 | 一次登录；文字、看图、生图、改图分别看到结果，选一项再试跑 | 保留一个入口和一个主动作；采用此方案 |
| 拆成文字、图像两家服务 | 两张卡分别接入 | 重复登录/网络/状态，容易误以为两个账号；不采用 |

### 3.2 布局与交互契约

- **入口不变**：Antigravity 留在现有“本地与会员”；首页副标题改为“本机 Google 登录 · 文字与图像能力”。不增加画布常驻按钮。
- **连接级状态**只表达安装、登录与汇总情况；“部分通过”不替代能力状态。
- **文字模型组**：保留“自动选择”文字任务行（CLI 默认选择，不冒充具体模型名），增加“看图理解”验证行。看图是输入能力，不伪造第二个模型。
- **图像能力组**：“生成图片”“编辑图片”两行。官方 models 页面与 CLI changelog 已提供 Nano Banana 2 / `generate_image` 的存在依据；具体图片输入、工具权限、调用合同、产物导入和取消仍由官方合同及真实 CLI 测试核验。行可以在样张中选择，但**不代表生产能力已实现**。
- **一个主动作**：选中能力后试跑对应任务；未安装时查看官方安装方法，待登录时复制裸 `agy` 命令，运行中改为取消。不启动登录终端、不自动安装、不填 Key、不读取 token。复制仅复制命令；登录由用户本人完成。
- **每项独立状态**：未验证 / 已验证 / 受限。实际实现中，只在该能力完整成功且产物验证通过后标为已验证；取消、异常退出、权限拒绝、缺少产物不能成功。文字通过不自动验证视觉输入或图像工具；生图通过不替代改图验证。只有已验证项才可进入原有启用机制。
- **次级入口**：重新检测与官方安装/登录说明。检测不生成内容，也不把未验证项改为已验证。网络、CLI 加载全局配置、额度和权限说明收进“连接详情”；不增加网络开关。
- **不伪造模型清单**：当前仅确认自动模式，不能继续沿用旧提案“由 `agy models` 获取完整清单”的未核实假设。待可解析的官方模型清单合同确认后再展示实际账户可用模型；不把 Nano Banana 工具直接当成可传入 `--model` 的 ID。
- **视频/音频**：只在详情写“待核对官方 CLI 能力，未提供模型入口”，不显示可选模型或成功态。
- **能力不混淆**：CLI 媒体工具不等于 Nomi 助手的画布/素材/时间轴工具执行。后者需要独立合同与验证，不能从媒体能力推断。
- **费用与网络**：用量以账号实际额度为准，不承诺免费或无限；失败不静默切付费 API。使用现有 Nomi 全局网络设置，CLI 兼容性仍需实证；不改用户 Google 全局配置。
- Agnes 页和其模型分组保留原样，公开目录与当前 Key 权限仍分开显示。

### 3.3 样张场景与验收

| 场景（除当前待登录记录外均为模拟） | 文字生成 | 看图理解 | 生图 | 改图 |
|---|---|---|---|---|
| 当前：已安装、待登录 | 未验证 | 未验证 | 未验证 | 未验证 |
| 待验证 | 未验证 | 未验证 | 未验证 | 未验证 |
| 仅文字通过 | 已验证 · 示例 | 未验证 | 未验证 | 未验证 |
| 文字与生图通过 | 已验证 · 示例 | 未验证 | 已验证 · 示例 | 未验证 |
| 图像受限 | 已验证 · 示例 | 未验证 | 受限 · 示例 | 受限 · 示例 |

样张按钮只模拟等待/取消，不凭定时器自动写入成功。明暗、窄视口、首页返回与独立状态需要 Playwright 检查；截图必须亲眼查看。该检查仅验证设计样张，不计为 Electron/真实 CLI 验收。

**本次设计验证记录**：`outputs/antigravity-full-capability-mockup-20260826/verify.mjs` 已运行，25 项检查通过、0 page error；桌面 1120px 与窄屏 390px 无横向溢出。已亲眼检查最终桌面待登录光色、窄屏待登录暗色截图；已查看独立生图通过示例、限额暗色和展开详情样张。默认桌面“连接详情”入口完整可见。证据为同目录 `verification.json` 及 `01`–`06` PNG；成功/受限均为模拟，没有真实调用或额度支出。


## 4. 实现边界与拆分

### A. Agnes catalog / mapping / archetype

1. 文本扩至 5 款，声明上游已核实的视觉输入与工具能力；通过现有 seed reconcile 幂等迁移。
2. 图像两款按各自文档提供参数；2.1 补 ratio 和新版尺寸档位，editing 图片放 `extra_body.image`。
3. V2.0 增补官方 keyframes 参数契约；2.5 / 2.5 Flash 分别声明 text / keyframe / reference。Flash 仅 720P、最多 5 图、支持音频、不声明视频参考。
4. 2.5 轮询携带模型名；纳入实际顶层 `url` 与文档 `metadata.url` 的响应夹具。V2.0 不再声称 `remixed_from_video_id` 是实际产物字段。
5. 模型档案补官方 sources / checkedAt；修正“全部永久免费”文案。
6. 参数仍走通用生成面板；各模式非法字段和互斥在请求前拒绝，不静默丢参考输入。

### B. Gemini SDK base 修复

在 `buildLanguageModelForVendor` 的 SDK base 解析处区分裸 host 与已有 API 路径：裸 host 补默认版本，明确 API 路径保留。不能改通用 joinUrl 的所有端点含义，也不能只按 Google 域名打补丁。先测 bare host、尾斜杠、显式 v1/v3/v4、v1beta/openai、自定义路径、Anthropic 与 Responses 的回归行为，再改实现。

### C. Antigravity CLI 任务适配（文字底层已写，多媒体待验证）

- 独立 provider 身份 `antigravity-cli`，不沿用 `gemini-cli` 别名，不暗中 fallback 到旧 Gemini CLI。
- 主进程负责可执行文件探测、spawn、NDJSON 解析和退出清理；模型清单只展示经官方契约核实的内容；renderer 不获得 shell 或明文登录凭证。
- 文字复用现有任务契约和取消 signal；图片另需实际工具输出到素材导入契约，不另起一个 Nomi 业务 Agent loop。官方能力与测试边界见同日 full-capability 审计。
- 官方输出事件 `init → step_update → result`；只消费正文 text delta，终态 SUCCESS 才成功。断流、非零退出、结果缺失、权限错误、限额与 INTERRUPTED 各自分类。
- 每个任务用显式 session 身份，禁止全局 `--continue` 误接用户其他 CLI 对话。多轮累计 usage 要转成单轮增量，不能重复计费统计。
- **权限发布闸门**：在隔离工作目录验证官方权限策略能限制文件、命令、MCP 等工具，且不覆盖用户全局设置。仅“不传 dangerously-skip-permissions”不是安全隔离；提示词也不是权限控制。没有验证前不把 provider 标成可使用。
- CLI 的 `control_request/control_response` 未支持，不能声称可把其工具审批实时映射到 Nomi。Nomi 内要求原生工具执行的入口须按能力拒绝/禁用该文字通道，不能静默换模型。
- 取消绑定该次任务的进程（以及确认属于该任务的子进程），先中断，超时再强制结束；无成功落盘；关闭应用也清理。
- 登录状态未知时保持未知；不扫描 Keychain/本机 token 文件。安装与登录本身不算实测成功。

## 5. 源码与官方依据

Infinite-Canvas 固定 commit `1c141a5715c04bbf29b4c2cf76fb78739da8cfe8`：

- [main.py:5510](https://github.com/hero8152/Infinite-Canvas/blob/1c141a5715c04bbf29b4c2cf76fb78739da8cfe8/main.py#L5510)：路径发现，有旧 Gemini fallback。
- [main.py:5603](https://github.com/hero8152/Infinite-Canvas/blob/1c141a5715c04bbf29b4c2cf76fb78739da8cfe8/main.py#L5603)：直接 spawn agy。
- [main.py:17627](https://github.com/hero8152/Infinite-Canvas/blob/1c141a5715c04bbf29b4c2cf76fb78739da8cfe8/main.py#L17627)：全文完成后一次 delta，不是实际流式。
- [LICENSE](https://github.com/hero8152/Infinite-Canvas/blob/1c141a5715c04bbf29b4c2cf76fb78739da8cfe8/LICENSE)：禁止未经许可商业封装。仅对照行为，按官方协议独立实现，不复制其代码。
- 用户截图含“启动 / 系统代理”；固定公开 main 未找到相同控件，不把截图差异归给该 commit。

官方文档：

- [CLI 安装与登录](https://www.antigravity.google/docs/cli/install/)
- [CLI headless / 流式协议](https://www.antigravity.google/docs/cli/headless/)
- [权限](https://antigravity.google/docs/cli/permissions)
- [Google 条款](https://antigravity.google/terms)：第三方访问限制需要单独确认；CLI 可以脚本化不等于第三方复用消费订阅已获明确许可。不能承诺无限免费或授权已经确认。
- [Gemini OpenAI 兼容](https://ai.google.dev/gemini-api/docs/openai)
- Agnes 各模型官方文档见同日 preflight 审计矩阵。

## 6. 六个角色的设计自审（不是已完成的独立代码审查）

| 视角 | 检查结论 / 闸门 |
|---|---|
| CTO | 本机 CLI 是不同 transport，不是另一个 Nomi loop；禁止未验证工具能力混入完整 Agent 模型池 |
| 设计 | 复用真实设置页/详情卡；主动作随状态变化；不往画布加新按钮；样张待用户确认 |
| PM | 目标是让现有账号承担其实际支持的文字与媒体任务；不把“全模型接入”和“当前账户全部有权限”混为一谈 |
| 前端 | CLI 状态通过主进程结果更新；所有文案走 i18n，取消/错误不能残留绿色成功状态 |
| 后端 | 凭证不出官方 CLI；spawn 不经 shell 拼接；流终态、权限隔离、代理和进程清理必须有测试 |
| 真实用户 | 一次登录，各能力分别试跑；原入口完成对应文字/媒体任务；不能在点了执行后才偷偷换付费模型 |

## 7. 验收、费用与回滚

- 合同测试：全部 10 模型 × 支持模式、参考通道、字段类型、互斥、轮询/产物解析、seed 幂等与用户配置保留。
- 文本任务：Agnes 流式、图片附件与工具闭环；Gemini 地址回归与有凭证后的真调用；agy 真实短任务、长任务取消、登录过期/限额分类、未授权文件读写探针。
- 用户任务：文字规划 → 图片生成/修改 → 视频生成 → 成片下载与项目持久化 → 重开仍可用。不能用直接 API 200 代替 Nomi 全链验收。
- 现有 UX harness 扩展，运行新构建且隔离 profile。模型测试预算按用户默认授权，限流/鉴权错误分类后再决定是否重试；不重复提交尚未结束的视频任务。
- 完整门禁按项目顺序：filesize → tokens → i18n → lint:ci → typecheck → test → build；视觉与真实任务另外验证。
- 官方 CLI 1.1.21 已校验并安装到 `/Users/aoqimin/.local/bin/agy`；真实预检返回 authentication failed or timed out，尚未进入模型请求。需要用户本人运行裸 agy 完成 Google 登录。当前没有 Google API Key，Gemini API 真测不能冒用 Agnes Key。
- 已知当前 Agnes 文本测试 usage 2655 tokens；无供应商账单，不猜金额。视频 Flash 实际输出 4.458333 秒，时间轴使用媒体实测时长。
- 回滚：撤销本分支 scoped commit；不动用户 Key/启停/名称，不删除用户产物，不修改 Google 全局配置；CLI 不可用时明确错误，不 fallback 到收费 API。
- 交付报告包含 branch / commit / PR、各项验证与明确外部阻塞；未经用户要求不合并 PR。

## 8. 样张检查记录

- Playwright 检查状态切换、首页到 Agnes/Antigravity 详情、明暗切换与 390px 窄视口：无 page error、无水平溢出。
- 已亲眼检查桌面试跑示例与暗色窄视口限额示例截图，均为模拟界面，不是 CLI 真测。
- 已亲眼检查当前 Key 的 Flash 视频采样帧：红色纸鹤位于桌面；媒体解码与 ffprobe 通过。
- Agnes/Gemini 和 CLI 基础代码已有修改；最终同步主线 7dab8ee8 后完整 `pnpm run gates` exit 0，760 文件通过、6876 测试通过（1 文件/1 测试跳过），构建通过。额外测试类型检查暴露的 Model 夹具字段已修正，存量基线从 111 降至 110。Agnes 目录、Image 2.1 两模式/参数及 3 图 3 视频重开已做真实界面复验，构建与证据边界见实际运行报告。完整能力卡片、IPC/任务路由、媒体契约与真实 CLI 验收尚未完成；任务分支检查点保持草稿，不作为完整交付。
