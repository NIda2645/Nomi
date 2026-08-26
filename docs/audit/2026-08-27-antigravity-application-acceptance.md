# Antigravity 正式应用验收

任务分支：`codex/agnes-gemini-integration-20260826`。本报告续接认证前置报告，区分已实现、真实通过和外部阻塞，不把样张或 fixture 当成完整调用通过。PR #188 未合并。

## 用户批准的替换

- 连接页复用现有 `FoldableModelCard` / `ModelChipGroups`；模型详情复用通用设置页，不保留旧四格能力面板。
- 7 个模型家族保留 14 个上游原始 ID。多档模型在详情和画布现有参数栏选择思考档位，单档显示固定值；未知 ID 独立，不猜名称。测试和启用记录始终绑定原始 ID。
- `auto` 是自动路由；`generate_image` 是图像工具，两者与模型列表分区。CLI 接入画布文字、看图、生图、改图，不冒充能操作 Nomi 项目的工具助手。

| 模型 | 保留的档位 |
|---|---|
| Gemini 3.7 Flash | Low / Medium / High |
| Gemini 3.6 Flash | Low / Medium / High |
| Gemini 3.5 Flash | Low / Medium / High |
| Gemini 3.1 Pro | Low / High |
| Claude Sonnet 4.6 | Thinking（固定） |
| Claude Opus 4.6 | Thinking（固定） |
| GPT-OSS 120B | Medium（固定） |

官方发现仍返回完整 ID；上述表仅为显示分组，不是另一套调用身份。

## 实机与测试隔离

使用 `tests/ux/antigravity-cli.live.walk.mjs` 和现有 Electron 启动器。测试设置/项目/缓存仅在 `/tmp/nomi-antigravity-application-20260827`。使用用户已登录的官方 CLI 1.1.21；不读取或复制登录凭证，不修改 Google 全局配置，不转接 API Key。

`NOMI_LIVE_ANTIGRAVITY=1` 明确启用会消耗额度的测试。可选 `NOMI_LIVE_AGY_DIAGNOSTICS=1` 只观察本实例新启动的 headless 子进程 stdout，限制 4 MiB，原始日志以 0600 留在本地 outputs，不提交；不改变 binary、argv、环境、输入或生产结果。

## 已观察的正式应用行为

- 7 个模型名称 + 1 个工具 + 1 个自动路由全部可见；详情使用原有类型、启用开关、输入方式和请求摘要布局。
- Gemini 3.7 Flash Medium → High 时详情 ID 精确切换；返回后保留 High，关闭正在试跑的详情立即取消，无迟到成功记录。High 真实文字验证通过。
- `auto` 真实文字、看图验证通过；生图设置页真实验证通过后仍需手动启用。
- 改图此前分别出现未成功结果及工具错误；在同一正式应用桥接链、增加仅观察的诊断后通过，生成图像经生产权限账本、会话路径和完整解码检查。不能由此次成功断言前次失败原因已修复。
- 画布创建项目、图片节点、输入纸鹤提示词、确认单次额度后实际发出请求；本次上游图像额度耗尽，未入库任何图片。**画布生图 → 改图 → 入库 → 重开完整成功闭环仍受额度阻塞，不能标为通过。**

### 已定位的图像失败

正式画布重试的本任务会话 `64987bb6-333d-4433-b303-b9ac158d4e5c`：工具 `generate_image` 返回 HTTP 429、`RESOURCE_EXHAUSTED`，上游明确标记 `gemini-3.1-flash-image` 容量用尽，重置时间为 `2026-09-02T16:07:23Z`。后续终态却写 generic `timeout waiting for response`。因此修正协议在工具错误处分类为 `ANTIGRAVITY_QUOTA`，不再丢失准确原因。新增真实错误形状回归先红后绿；停止继续图像重试。

两次有完整诊断的请求分别返回累计 usage 17,391（改图成功）及 10,242（图像额度失败），合计 27,633 tokens；每个会话仅取最终累计值，不叠加初始化回合。其余 GUI 请求未保留完整 usage，不能据此声称本轮总额。CLI 未返回费用金额。

## 走查发现并修正

- 未选中模型时空状态解引用导致首页崩溃：SSR 回归先红后绿。
- 关闭模型详情仍留在连接页时测试没有取消：按模型作用域清理；取消和持久化竞态返回真实终态，不虚报“未记录成功”。
- 官方 CLI 冷启动超过 10 秒：init 截止改为独立的 30 秒，文字/媒体总截止保持有界。
- 未知原始 ID 恰与已知家族名称相同时被合并：显示分组区分 family/model 命名空间，正反顺序测试先红后绿。
- 通用取消按钮仍带 ComfyUI 专属无障碍文案：替换为供应商无关的“取消这次生成”，移除旧键。
- 图像额度错误被笼统归为工具失败：按上节修正，未放宽工具或文件权限。
- 文字生成的额度确认被归入图片，显示“张画面”和固定耗时：通用执行类型保留 text，单次、重生成、变体与批量共用文本口径；中英文回归先红后绿，文本不再显示虚构耗时。

## 实际创作与重开

在隔离项目 `project-1787767946888-iu240v` 新建文字节点，选择 Gemini 3.7 Flash / Medium，输入“ 一只红色纸鹤停在白色桌面上。”并确认生成。实际 CLI 会话 `1d621aea-6c20-40de-8e24-ba17f3e68e55` 成功返回中文文本，最终 usage 为 4,215 tokens。节点和结果均持久化原始 ID `gemini-3.7-flash-medium`；返回项目库再打开，生成文本仍在。截图 24（生成完成）和 25（重开）已亲眼检查。未选中文本时“改写”沿用既有追加行为，本次不改变该交互。

从本任务已验证的改图会话 `ec127252-9e26-4e13-a407-1b75a4fdd348` 复制唯一产物，使用真实素材库上传入口导入 1024×1024 JPEG。导入前后 SHA-256 相同，重开后图片可见。**这验证普通素材导入与持久化，不是图像生成任务自动入库的替代验收。** 项目只有这 1 张手动导入的图片；失败的画布请求未伪造生成资产。

## 证据与边界

本地截图目录：`outputs/antigravity-authenticated-20260827/application/`。已亲眼查看 08（模型列表）、09（通用详情）、11（关闭取消）、15（生图验证通过）、16（改图失败）、18（确认弹窗）、20（画布失败）、24（真实文字完成）、25（重开）、27/31/34/35（最终构建分组与通用模型详情）、33（最终构建项目重开）。13/14 文件名虽含 verified，但画面实际是失败，不能按文件名判断结果。诊断成功与失败记录均保留。

自动走查曾因隐藏 switch、弹窗缺少预期 role、过快 Escape 导航及错误的运行中 status 选择器失败；按脚本 exit 1 保留，不计为产品通过。单次确认最终通过原生桌面操作实际点击，不以注入成功状态替代。

此前原生模型矩阵 13/14 有严格文字断言通过，Pro Low 未通过。全模型正式应用矩阵及最终构建截图在后续段补记。独立 Gemini API 真实测试仍缺 Google API credential；不把 Agnes Key 发往 Google。音频/视频生成未确认官方 CLI 可调用契约，不宣传已接入。Windows CLI 后代清理未验证，保持禁用。

## 自动检查

最终同步至主线 `dd2475c9`（包含 #184 媒体扩展名按字节纠正）后执行完整 `pnpm run gates`：775 个测试文件通过、1 个跳过；7,137 项测试通过、1 项跳过；lint 0 错误/96 个存量警告；typecheck、测试类型、全部静态门岗和 Electron/Vite 构建通过。最终构建的无调用设置走查 exit 0，断言 7 个家族 + 图像工具 + auto 均可见，Gemini 3.7 Flash Low 详情显示原始 ID、已验证、启用和档位。另一次项目重开走查看到 3 个持久化节点（文字 success、素材 success、历史图像 error）；失败历史仍显示原状态，没有伪改成功。


## 正式应用模型矩阵（2026-08-27）

同一生产 Electron 桥接链逐一调用，14 个原始 ID × 文字/看图，共 28 项，24 通过、4 未通过。先测试后由走查驱动显式启用通过的条目；不是测试自动启用。

| 上游原始 ID | 文字 | 看图 |
|---|---|---|
| `gemini-3.7-flash-high` | 通过 | 通过 |
| `gemini-3.7-flash-medium` | 通过 | 通过 |
| `gemini-3.7-flash-low` | 通过 | 通过 |
| `gemini-3.6-flash-high` | 通过 | 通过 |
| `gemini-3.6-flash-medium` | 通过 | 通过 |
| `gemini-3.6-flash-low` | 通过 | 通过 |
| `gemini-3.5-flash-high` | 通过 | 通过 |
| `gemini-3.5-flash-medium` | 通过 | 通过 |
| `gemini-3.5-flash-low` | 通过 | 通过 |
| `gemini-3.1-pro-high` | 通过 | `ANTIGRAVITY_TIMEOUT` |
| `gemini-3.1-pro-low` | `ANTIGRAVITY_TEST_ASSERTION_FAILED` | 通过 |
| `claude-sonnet-4-6` | 通过 | 通过 |
| `claude-opus-4-6-thinking` | 通过 | 通过 |
| `gpt-oss-120b-medium` | `ANTIGRAVITY_INVALID_STEP` | `ANTIGRAVITY_HOOK_UNVERIFIED` |

失败定位：Pro High 看图未完成、总截止超时；Pro Low 实际成功返回 `OK.`，但未满足严格的 `OK` 断言（不等于模型无法调用）；GPT-OSS 文字返回上游服务器繁忙，其原生 `error_message` 步骤现已分类为运行失败而非格式错误；GPT-OSS 看图的初始化 nonce 回复不完整，按原有安全检查拒绝，未发送参考图任务。失败原始记录保留，不事后改写矩阵为通过。

28 个会话最终累计 usage 合计 **246,096 tokens**；按会话只取最后一次 result，包含媒体握手，不重复加总。Pro High 超时返回零 usage，不能保证上游没有额外消耗。另有正式画布文本 4,215 tokens 和上述两次图像诊断 27,633 tokens；其他历史调用没有完整金额记录，不能冒充本任务总费用。

原始矩阵、按会话 usage 和诊断均留在本地 outputs，不提交账号日志。
