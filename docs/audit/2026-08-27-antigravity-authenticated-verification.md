# Antigravity 认证后验证（进行中）

基线：任务分支 `codex/agnes-gemini-integration-20260826`，草稿 PR #188；本记录不代表完整接入已完成。只调用官方 CLI 1.1.21，不读取或复制登录 token，不修改 Google 全局配置，不跳过权限。

## 登录与网络

- 原生登录在向 `oauth2.googleapis.com/token` 建立 TCP 连接时超时。只做无凭证连通性对照：直连 5 秒超时；显式使用本机现有系统代理 `http://127.0.0.1:7897` 后 0.87 秒收到 HTTP 404，TLS 校验成功。404 只证明该 GET 请求到达服务器，不是 OAuth 成功。
- 在此前专用终端窗口停止失败的 CLI，改为独立空目录，仅给新的进程设置 HTTP(S)_PROXY/NO_PROXY；未修改系统代理或 shell profile。
- 用户完成官方 Google 登录，CLI 进入正常输入界面；随后原生文字请求返回 SUCCESS。账号标识、登录链接与凭证不写入本报告。

## 已取得的真实证据

| 场景 | 结果 | 边界 |
|---|---|---|
| 原生简单文字 | SUCCESS，精确返回测试标记；零工具调用 | 14686 tokens；不是 Nomi 流式适配器通过 |
| 自定义 agent 加载标记 | SUCCESS，返回仅存在于自定义系统正文的标记；零工具调用 | 3988 tokens；嵌套 agent.md、H1 正文、显式 add-dir、inheritCustomizations:false 的组合已验证 |
| 空 tools 白名单读取负向探针 | 返回 TOOL_UNAVAILABLE，零工具调用，没有读出临时夹具中的标记 | 4062 tokens；只证明该配置下这一负向场景，不代替全部权限测试 |
| 本地图片理解 | 仅调用 view_file，准确识别红色折纸鹤；SUCCESS | 10827 tokens；输入是本任务已有测试图复制到本次独立目录 |
| 原生图片生成 | SUCCESS；只调用一次 generate_image；1024×1024 JPEG 全量解码通过 | 10931 tokens；先前一次头像 URL 请求 EOF、模型 usage 为 0，修复连通性后仅重试一次 |
| 原生参考图编辑 | SUCCESS；保留纸鹤/桌面，背景改为蓝天；1024×1024 JPEG 全量解码通过 | 11219 tokens；仅本任务会话原始工具记录确认 ImagePaths 恰为本次 staged 文件 |
| Nomi 文字进程适配器 | SUCCESS，精确返回标记，流式拼接等于 final response | 3938 tokens；真实 binary + 新 profile/log 闸门，不是 fixture |
| Nomi 流式取消 | 首个 delta 后主动取消，返回 AbortError | 无最终 usage；不据此推算免费；本轮取消资源清理单测同步覆盖 |
| hook 写入拦截候选 | 未通过加载验证 | 没有 hook marker；工具因非合法 artifact 路径被拒，不能归因于 hook；该诊断请求 30106 tokens |

所有会话均独立，不续接用户既有会话。实际 usage 由 CLI 返回；不推算金额或承诺订阅无限额度。最终素材导入与 Nomi 内闭环仍未通过；不能把原生能力通过等同应用完整接入。

## 已纠正的假设

- `init.tools` 返回 57 项，包括所选 agent 白名单之外的工具。不能据此认定该 agent 已获全部权限，也不能再把列表必须为空作为纯文字运行的前提。
- 独立静态检查官方二进制的 `printmode.advertisedTools` 与实际事件互相印证：该字段是全局公布的工具清单，不是所选 agent 的有效白名单。官方 headless 文档仅称其为 available tools。
- `init.agent` 会回显选择参数，单独不能证明系统正文已加载。实际 marker 请求已证明上述自定义 agent 配置组合可加载；此前无 H1/继承配置的方案不能直接当作等价配置。
- `agy agents` 在本机返回 exit 0、空 stdout/stderr，不能把它当作发现成功证据。`agy models` 则返回可解析的制表符分隔模型 ID/显示名。

## 模型发现与逐项文字试跑

当前 CLI 返回 14 项：Gemini 3.7/3.6/3.5 Flash 各 high、medium、low；Gemini 3.1 Pro high、low；Claude Sonnet 4.6、Claude Opus 4.6 Thinking；GPT-OSS 120B Medium。实际 ID 来自 CLI，不从产品页猜测；其中推理档位不应冒充不同媒体能力。

14 项逐项真实请求，均使用空工具 profile、独立会话、无重试：

| 模型/档位 | 结果 |
|---|---|
| Gemini 3.7/3.6/3.5 Flash 各 high、medium、low（9 项） | SUCCESS、init.model 精确匹配、标记精确匹配、零工具调用 |
| Claude Sonnet 4.6 / Opus 4.6 Thinking（2 项） | 同上 |
| GPT-OSS 120B Medium | SUCCESS，但返回 `NOMI_MODEL`，缺少要求的 `_OK`；不能算精确指令测试通过 |
| Gemini 3.1 Pro high / low | 本轮 40 秒 CLI 超时，外部 45 秒截止；未自动重试，不推断永久无权使用 |

首轮是 **11 项严格通过，另 1 项成功响应但格式不符，2 项超时**。矩阵合计 CLI 已返回 usage 为 53395 tokens。为区分短等待窗口与无法响应，Pro 两档各补一次 120 秒等待、125 秒外部截止，并对 GPT-OSS 使用独立算术题 `17 + 25`：Pro High 与 GPT-OSS 精确回答 `42`（4307 / 3612 tokens），Pro Low 仍超时，停止继续重试。

汇总为 **13/14 项至少一次真实文字断言通过，Pro Low 仍未通过**；首次超时与 GPT-OSS 字面标记不完整的记录保留。没有测试或承诺每个文字模型都具备媒体工具。

## 协议与边界修正

- 生产文字 profile 改为本机已验证的嵌套 `agent.md`、H1 正文、`inheritCustomizations:false`、显式 `--add-dir`。依然禁止文字 profile 的任何工具事件，不自动切换通道。
- 模型发现改为严格解析官方 TSV，保留真实 ID/显示名，不推断能力与账户额度。状态探测或试跑前探测失败时清除旧清单；发现成功不解锁 ready。真实 Node 调用暴露 stdin 未关闭导致 models 超时，显式关闭无用输入后 Nomi 探测成功返回 1.1.21 和 14 项；新增等待 EOF 的子进程 fixture 回归。
- 零 prompt 负向探针证实未知 agent 只在本任务 `--log-file` 写 `Agent "…" not found, falling back to default`，stderr 为空；在 init 到达时诊断已经写入。因此发送用户内容前要求本任务有界常规日志，拒绝该回退诊断。此检查不是 OS 沙箱，也不承诺任意用户启动钩子完全隔离。
- 新增日志 FIFO/符号链接/缺失/超限测试。审查真实复现 FIFO 的 open 阻塞；修为 `O_NOFOLLOW | O_NONBLOCK` 后再 fstat，避免超时清理永久等待 readiness。
- macOS 清理进程组时曾两次出现暂态 EPERM；只在原有 1 秒期限内重查，仍只认 ESRCH 为消失，持续 EPERM 仍失败。确定性负向测试覆盖两种状态；未把 EPERM 吞成成功。
- 官方 CLI 的 `generate_image` stream 参数投影会过滤 ImagePaths，且本次不提供 output 字段。用**同一任务 conversation ID** 下的 `transcript_full.jsonl` 和对应 tool step `output.txt` 补证，绝不扫描全局 newest 文件。当前证据仍是执行后检查，不能冒充执行前文件许可闸门。

## 任务内钩子实测

共用 hooks 文档的 workspace 文件在此前探针中未触发；已确认的 CLI 路径是 agent frontmatter 的 `plugins: [绝对私有目录]`，目录内含 `plugin.json` 和 `hooks.json`，无需全局安装或修改全局 settings。官方二进制的解析/加载链与实际 marker 互证。

- 正常 deny：PreInvocation 和 PreToolUse marker 均触发；view_file 以 ERROR 结束，明确是 hook 拒绝，返回 DENIED，未读出 canary（9474 tokens）。
- hook 进程 exit 1：view_file ERROR，原因明确为 hook command failed；未读出 canary（9794 tokens）。
- hook 超时：view_file ERROR，原因明确为 hook command signal killed；未读出 canary（9500 tokens）。
- 非法 JSON：补测确认 view_file ERROR、明确报 hook JSON 解析失败，未读出 canary（9515 tokens）；首次上游资格 GET EOF、usage 为 0，不算钩子结果。

这组结果仅证明本机 1.1.21 的指定调用，不等于所有版本保证；媒体正向 allow 与精确素材范围的生产接线仍需验证。工具失败实际会出现 `step.state=ERROR`，媒体协议不能仅按文档 ACTIVE/DONE 表判断。

## 本地验收产物

`outputs/antigravity-authenticated-20260827/` 包含两张真实 JPG、解码/尺寸/SHA256 清单、去敏模型矩阵与参考路径匹配证明。两张图均已亲眼查看；原始会话日志不提交。

已记录成功/失败请求的累计 usage 为 **189354 tokens**，另有取消任务未返回最终 usage；金额未返回。当前聚焦回归 **3 文件 / 76 测试通过**。最终完整 `pnpm run gates` exit 0：760 个测试文件 / 6896 项测试通过，另 1 文件/测试跳过；typecheck、全部静态门岗与 build 通过，lint 0 错误/96 个既有警告。基线再次 fetch 确認无落后，草稿 PR 未合并或部署。

## 官方依据

- [安装与认证](https://antigravity.google/docs/cli/install/)：账号登录与 Gemini API key 是不同认证通道。
- [Headless](https://antigravity.google/docs/cli/headless/)：事件、结果、默认权限与退出行为。
- [Custom agents](https://antigravity.google/blog/introducing-custom-agents)：主 agent 采用声明的执行参数与工具子集。
- [Hooks](https://antigravity.google/docs/hooks/)：候选本地钩子契约；未验证加载前不可作为安全边界。

原始事件只存本机独立临时目录，不随源代码发布。本轮仅修正文字进程契约；媒体执行前文件范围限制、素材导入/重开与完整 UI 仍未交付，完整 UI 样张仍待确认。
