# ComfyUI 成品分类与长枚举修复

状态：本轮范围已实现并验证；2026-08-26 后续用户授权在 Mac 手势补齐、全量验证后统一提交 PR，不合并。真实 H3 GPU 推理未验证。最新交付计划见 `2026-08-26-comfyui-mac-gestures.md`。
基线：2026-08-26 刷新 origin/main 至 `84abca8d`；工作树 `Nomi-comfyui-workflow-matrix`。
此前多图工作保留，基线刷新前备份 stash `42a49e4a7ebd73100377434e9d8a4b20979b4821`，已恢复。

## 根因与范围

1. 成品类型目前信任 binding.outputKind，缺省直接 image；它可能与选中的 SaveVideo 不一致。
   统一从选中的成品节点派生 kind，导入、保存、模型条目、taskKind、响应字段同步；不能只换图标。
2. 所有枚举都被塞进 NomiSegmented 的窄网格，模型文件名越过按钮边界。
   保留已拍板的底栏与参数面板位置，少量短选项继续分段，长标签/大列表使用现有 NomiSelect。
   增加 opt-in 搜索，标签完整可查，选择值原样回写；嵌套弹层不误触外部关闭。
3. 存量 ComfyUI 条目做一次可幂等迁移，只纠正可确认的成品类型及对应任务/响应合同。
   保留模型 identity、enabled、原始 JSON、参数默认值、枚举和自定义请求设置。

## 不动什么

- 不改 H3 推理参数、模型权重或远端付费 API；不购买/上传用户素材。
- 不按工作流标题包含 H3/Video 猜类型，不增加供应商特例。
- 不承诺未拿到的用户 JSON 或未连接 GPU 服务已真实生成成功。
- 不改既有短比例选择器和参数面板总体布局，不增加常驻入口。

## 依据与实现约束

- ComfyUI 官方 `comfy_extras/nodes_video.py`：CreateVideo 只是 VIDEO 值，SaveVideo/SaveWEBM 才输出文件。
  https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_video.py （2026-08-26 核对）
- 官方 H3 r2v 模板以 CreateVideo → SaveVideo 保存：
  https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_r2v.json
- Mantine Combobox.Search 官方用法（Context7 2026-08-26）：open 聚焦搜索，close 重置搜索/选中；过滤后更新选中索引。
  https://mantine.dev/core/combobox/
- 已通读设计系统与真实 InlineParameterBar/NomiSelect 外壳；复用既有组件与 token。
- UI 沿已确认的窄修复方向：原参数面板内改长枚举控件，不重设计外壳；走查截图与现有布局逐项对照。

## 实施顺序（TDD）

- [x] 输出合同 RED：缺失/过期类型、显式预览、多成品、未知/缺失成品、CreateVideo 中间节点。
- [x] 单一输出判定模块；导入/保存使用规范化结果，数字/空格 ID 不绕过规范化。
- [x] 存量迁移 RED → GREEN：落盘、幂等、跨实例隔离、参数/枚举/disabled 保留、坏草稿跳过；不能安全修复的合同整体保留。
- [x] 控件分流 RED → GREEN：短枚举/长中文/文件路径/多选项；复用 NomiSelect 搜索与嵌套 portal。
- [x] 真实 Electron 用户任务：导入视频 → 设置显示视频 → 画布选长模型名 → 重开保留 → 请求值正确 → 模拟返回视频本地播放。
- [x] 光/暗截图亲眼验收，检查点击、键盘、长列表最后一项、点外关闭和短枚举不回归。
- [x] scoped 单测 + HTTP fake + 全量质量门；6606 测试通过 / 1 跳过，独立审查阻断已关闭，见 `docs/research/2026-08-26-comfyui-feedback-fix-report.md`。

## 验收与回滚

验收分开列：纯合同、真实磁盘迁移、无 GPU HTTP 集成、真实 Electron UI、GPU 推理（未接服务不算通过）。
运行 `pnpm run gates`、`git diff --check`；如门岗失败，区分本次回归与更新后的基线问题。
实现保留在本分支未提交状态；无需用户 JSON 才开始。回滚只撤本次已知文件差异，不触碰主工作树。
迁移前后使用临时目录测试；不打开或改写用户真实 catalog。验收后才另行讨论提交与 PR。
