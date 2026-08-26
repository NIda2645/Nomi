# Antigravity 完整能力核对与真实接入边界

核对日期：2026-08-26。官方 CLI 1.1.21；Infinite-Canvas 固定提交 `1c141a5715c04bbf29b4c2cf76fb78739da8cfe8`。用户明确要求全部能力，早期仅文字方案不再是交付范围。

## 官方能力与当前实证

| 能力 | 官方依据 | 本次接入状态 |
|---|---|---|
| 文字生成 | [CLI headless](https://antigravity.google/docs/cli/headless/) 的 stream-json | 解析/进程基础测试通过；尚无登录后的真实模型成功 |
| 看图理解 | [CLI prompting](https://antigravity.google/docs/cli/prompting/) 交互附件；[SDK tools](https://antigravity.google/docs/sdk/tools) 多模态输入 | CLI 无头输入只接受文本块；文件路径到实际视觉工具链待认证实测，不能把 SDK 传参当 CLI 合同 |
| 生成图片 | [CLI changelog](https://antigravity.google/changelog) 的 generate_image；[Models](https://antigravity.google/docs/models/) 的 Nano Banana 2 | 官方能力存在；工具权限、实际输出与 Nomi 素材导入尚未验证 |
| 编辑图片 | 官方 [SDK proto](https://github.com/google/antigravity-sdk/blob/78a937b52da9ad4a6730f1cecf28db09eb510829/google/antigravity/proto/localharness.proto#L366) 的 image_paths | CLI 同名工具具体参数/产物合同仍需观察；不声称已经接通 |
| 视频输入 | CLI 交互附件支持视频；SDK 有 Video 输入 | headless CLI 可调用边界未验证，不等于可生视频 |
| 视频生成 | 当前已核对 CLI 文档没有找到原生视频生成调用合同 | 保持待核实，不伪造模型入口；不能从 MP4/WebM artifact 预览反推生成能力 |
| 语音/音频 | [CLI voice](https://antigravity.google/docs/cli/commands/voice/) 是交互听写，print 模式不可用；SDK 支持 Audio 输入 | 不等于 TTS/音乐生成；没有以 CLI 订阅调用这些生成能力的验证 |

Gemini API/托管 Antigravity Agent、Antigravity SDK、用户登录的本机 CLI 是不同认证与计费入口。未获验证前不静默替换通道，不承诺免费或无限额度。用户给的 Agnes Key 只用于 Agnes 官方 API。

## 真实预检

- 官方二进制校验并安装到 `/Users/aoqimin/.local/bin/agy`。没有改 shell profile、Google 全局设置、读取或复制 token。
- CLI 原生运行返回 exit 1、result ERROR、authentication failed or timed out。Nomi 底层适配器将其分类为 `ANTIGRAVITY_LOGIN_REQUIRED`。
- 未收到安全 init，所以未写入用户 prompt；无成功模型请求、无媒体生成。安装和版本探测不计作模型验证。
- 用户需亲自运行 `/Users/aoqimin/.local/bin/agy` 完成互动登录；不是不存在的 agy login 子命令。
- 预检原始证据位于 `/tmp/nomi-antigravity-preflight-20260826/`，不把凭证或原始账户信息提交进仓库。
- 模型发现存在文档/二进制差异：官方 changelog 1.1.12 宣布 models/agents 支持 JSON 格式，但本机已校验的 1.1.21 执行 `agy models --output-format json` 返回 exit 1、`flags provided but not defined: -output-format`。这不是账户模型清单；参数顺序等其他可能性尚未验证，不能声称机器可读发现已接通。

## 下一步真实媒体验证合同

1. 使用独立任务工作目录和唯一自定义 agent，不启用 dangerously-skip-permissions，不改用户全局权限。先检查实际 init 的工具集合；仅文字配置不能替代媒体配置。
2. 登录后观察 generate_image 的实际 tool_info、错误、输出和文件路径；官方只公开通用工具事件，没有完整 CLI 图像结果 schema。测试应失败关闭，不能靠提示词假装权限隔离。
3. 以本次会话明确输出的路径取文件。SDK 样例可能写到会话 brain 目录，不能预设一定在 cwd；绝不扫描全局目录捡“最新图片”。校验归属、路径、字节/MIME、解码与尺寸后导入项目素材。
4. 分别测试无参考生图、参考图编辑、本地图片理解；文字成功不验证图片，生图成功不验证编辑。失败/取消/没有产物不得显示成功。
5. 对工具/文件权限做负向探针；CLI control_request/control_response 尚未支持，不冒充 Nomi 原生工具审批闭环。验证不通过就不开放对应能力。
6. 取消清理任务拥有的完整进程树，避免子进程继续生成；产物只在验证成功后导入。Windows 的等价所有权机制需单独实现并验证。

## 交付状态

完整能力样张已更新、待用户确认；图中成功态明确为模拟。生产完整能力卡片、IPC/任务路由、图像导入与真实 CLI 测试尚未完成。本记录是未完成状态的证据，不是上线报告。
