# ComfyUI 视频分类与长枚举修复验收

> 历史阶段记录：以下是视频分类/枚举阶段的证据。最新构建、三图闭环、Mac 手势及交付状态见 [PR 验收汇总](2026-08-26-comfyui-pr-verification.md)；旧「等待确认」约束已被后续自行提交 PR 的授权取代。

日期：2026-08-26。应用基线：0.20.1 / `84abca8d`。
工作树：`/Users/aoqimin/Desktop/Nomi-comfyui-workflow-matrix`。
分支：`codex/comfyui-workflow-matrix-20260825`。
状态：已实现并完成本轮范围内验收；未 commit、未 push、未创建 PR，等待用户确认。真实 H3 GPU 推理不在已验证结论内。

## 本轮修复

| 用户遇到的问题 | 根因与通用修复 | 保留的边界 |
|---|---|---|
| 视频工作流在设置中显示为图片 | 成品类型曾信任过期 binding，缺省为 image；现在从选中的成品节点统一派生模型类型、任务种类和结果字段 | 不靠标题或 H3 专名判断；显式选中的图片预览仍是图片 |
| CreateVideo 被当成最终输出 | CreateVideo 只构造内存 VIDEO；唯一明确的下游保存节点才是执行目标 | 无保存节点或多个候选时明确报错，不随意选一条 |
| UNet 模型文件名挤在参数面板里 | 所有枚举都用了分段网格；长标签或大列表改用现有 NomiSelect 的搜索列表 | 短比例、精度等保留分段选择；参数值不截断、不改写 |
| 已保存的错误分类不随代码自动恢复 | catalog v9→v10 一次迁移，模型、绑定、运行映射整体修复 | 无法证明安全的自定义合同整体保留，不只改图标、不覆盖用户设置 |
| 嵌套下拉的键盘/焦点失效 | 搜索输入在可见挂载时聚焦；关闭后只恢复丢失的焦点 | 点击其他输入框不被异步焦点恢复抢走；Escape 先关列表，再关参数面板 |

迁移额外校验：同实例/同模型、同模板图、默认媒体响应字段、输入模式一致、无任务桶冲突，最终用实际 `selectTaskMapping` 验证目标映射可用。自定义媒体路径、另一张图、禁用的目标映射或损坏草稿不会被强行迁移。保留 enabled、参数默认值、枚举、模型身份及自定义请求设置。

## 多维验证

| 层次 | 覆盖 | 结果 |
|---|---|---|
| 输出合同 | SaveVideo、SaveWEBM、VHS、动画 WebP、图片预览、3D；缺失/过期类型；未知/不支持输出；多成品；数字/空格 ID | 20 项通过 |
| 存量数据 | 临时目录落盘、重复读取、幂等、跨实例、disabled、参数/枚举保留、CreateVideo 升级、自定义合同与禁用映射保护 | 12 项通过 |
| 枚举呈现 | 短比例/分辨率、长中文、文件路径、多选项、显示文字与内部值分离 | 9 项通过 |
| 原有多媒体矩阵 | 多图/视频绑定、逐个上传、节点值注入、未绑定作者值保留、缺素材提交前拦截 | 纳入全仓回归；不是社区工作流 GPU 推理证明 |
| 真实 Electron UI | 设置页粘贴 JSON→分析→导入→显示视频；旧条目也显示视频；183 个文件名的搜索、点击、键盘、空结果、焦点、短枚举、冷启动保存、光/暗模式 | 最终生产构建复跑通过，截图已亲眼检查 |
| 真实 UI→HTTP→视频 | 画布点击生成；捕获 `/prompt` 校验完整 UNet 名、精度、文件前缀及输出目标；`/history`→`/view`→本地视频解码 | 最终复跑通过；确认 nomi-local 源、64px 解码及播放时间推进；服务为模拟 HTTP，不是 GPU 推理 |
| 全仓质量门 | 文件大小、token、i18n、安全、架构门岗、lint、应用/测试类型、Vitest、生产构建 | `pnpm run gates` exit 0；752 测试文件 / 6606 测试通过，1 文件 / 1 测试跳过 |

测试先证明失败再修复：最初输出/控件测试 22 项失败；旧数据读取 2 项失败；独立审查补出的规范化、覆盖自定义设置和迁移原子性反例均先失败再通过。旧参数网格在真实桌面截图中复现了文字重叠。

独立审查已关闭已确认的问题：自定义映射被覆盖、输出解析绕过规范化、只改模型未改映射的半迁移、禁用映射被误认为可用。最后一次针对性复核 41 项通过。

最终 lint：0 error、97 warning，未超过 98 的棘轮；测试类型门岗：src 0 错，electron/evals 存量 111 个在基线内。另对 15 个未跟踪文件执行指定文件安全扫描，通过；`git diff --check` 通过。所有新增源码低于 800 行。

## 证据与复跑

复现旧重叠的截图：

`/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-fG7VR3/shots/01-parameters-dark.png`

首次完整扩展走查证据（已亲眼检查设置页、长文件列表光/暗截图及视频回显）：

`/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-3zo672/shots/`

最终日志：`/tmp/nomi-comfy-feedback-gates-final.log`、`/tmp/nomi-comfy-feedback-walk-final.log`。

最终构建截图（已逐张查看）：

- [新导入与旧工作流都显示视频](/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-k0W9Lz/shots/00-video-settings.png)
- [深色长文件名搜索](/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-k0W9Lz/shots/02-search-long-file-dark.png)
- [浅色长文件名搜索](/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-k0W9Lz/shots/04-search-long-file-light.png)
- [模拟返回的视频本地播放](/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-comfy-feedback-k0W9Lz/shots/05-generated-video.png)

```bash
pnpm exec vitest run electron/catalog/comfyuiWorkflowOutput.test.ts electron/catalog/comfyuiWorkflowOutputMigration.test.ts src/workbench/generationCanvas/nodes/parameterOptionPresentation.test.ts
pnpm run gates
node tests/ux/comfy-workflow-feedback.walk.mjs
```

走查使用正式构建入口和已有隔离启动器，所有设置、项目、缓存、HTTP 服务和测试视频均在临时目录。无用户私有 JSON、无真实用户数据写入、无远端额度消耗。

## 尚不能宣称的部分

- 没有用户的实际 H3 JSON、节点环境和 GPU 服务，因此未验证那条私有工作流能真正完成模型推理。
- 本轮修的是上述两个反馈的共性入口，不是“所有第三方工作流永远兼容”的保证。
- 原先的多媒体绑定矩阵有合同/HTTP 回归证据，但不能从本轮单视频画布走查推导出“三张参考图在画布全部连线成功”。
- 未把分支改动安装或发布给群用户；这是一份待用户验收的实现。

## 官方依据

- [ComfyUI 视频节点实现](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_video.py)：核对 CreateVideo 与保存节点的职责。
- [官方 H3 Reference to Video 模板](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_r2v.json)：核对 CreateVideo→SaveVideo 输出链。
- [Mantine Combobox](https://mantine.dev/core/combobox/)：通过官方文档与本地安装源码核对搜索、portal、键盘和挂载行为。

实现计划：`docs/plan/2026-08-26-comfyui-output-and-parameter-controls.md`。
