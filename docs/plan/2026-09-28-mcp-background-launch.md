# MCP 后台启动与被动发现修复计划

> 状态：🚧 进行中（2026-09-28，PR #916）

## 范围
- 让 `initialize`、`tools/list`、`resources/list`、`resources/templates/list`、`ping` 在没有活动 Nomi 实例时只读返回，不冷启动 GUI。
- 让真实工具调用冷启动 Nomi 时使用后台模式；后台窗口不抢焦点，渲染正常运行。
- 用户手动再次启动 Nomi 时显示并聚焦已有后台窗口。
- 后台实例在从未显示窗口、最后一次 MCP RPC 后闲置 10 分钟且无在途 ProductionRun 任务时退出。
- 增加 launcher/protocol/main/lifecycle 回归测试。

## 不动项
- 不改画布、目录、供应商、Agent 面板。
- 不改变已显示过窗口的普通实例退出行为。
- 不新增第二份 ProductionRun 在途判据；闲置模块只消费现有 owner 的只读状态。

## 回滚
删除后台环境标志、被动探测接口、后台窗口选项和闲置模块接线，恢复 `resources/list` 直接 invoke 的旧路径；测试与文档随同回滚。

## 验收门
- 被动发现无活动实例不 spawn；活动实例可探测并返回技能资源。
- 工具冷启动 spawn 环境带 `NOMI_LAUNCH_BACKGROUND=1`。
- 后台建窗 `show:false`、不抢焦点、`backgroundThrottling:false`；second-instance 显示并聚焦。
- 未显示后台实例：有在途任务不退；无在途任务闲置 10 分钟退出；窗口显示过后不触发该退出。
- Windows 真机走查：连接 MCP → 列资源不弹窗 → 调工具后台完成不弹窗 → 手动双击显示并看到结果 → 闲置 10 分钟退出。

## 先查别人

完整报告：[docs/research/2026-09-28-mcp-background-launch/prior-art.md](../research/2026-09-28-mcp-background-launch/prior-art.md)。

- 依赖里已有：隐藏启动用 Electron 的 `show: false` + `ready-to-show`（https://www.electronjs.org/docs/latest/api/browser-window ），「窗口显示过」的唯一 owner 用 `BrowserWindow` 的 `show` 事件（`node_modules/electron/electron.d.ts:4953`），后台节流用 `backgroundThrottling`（`node_modules/electron/electron.d.ts:19232`），macOS 用 `app.dock.hide()`（`node_modules/electron/electron.d.ts:8088`）。全部直接用，不自写窗口管理。
- 仓库里已有：冷启路径只有一条 `electron/capabilityCore/mcpNodeLauncher.ts:203`（`ensureLiveInstance` → `startNomi`），零窗口自愈的唯一入口 `electron/mainWindowPresence.ts:10`；本方案只在这条路径前面加「被动请求不冷启」的分流，复用这两处，不另起一份。
- 生态里已有：MCP 规范只规定 `initialize` 先行、stdio 由客户端拉起协议服务端，不涉及 GUI 宿主要不要启动（https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle ）；同类 Blender MCP 从不替用户启动 Blender（https://github.com/ahujasid/blender-mcp ）。
- 结论：依赖已有的直接用；自研只有两小块——被动请求的「只探测、不冷启」分流、后台启动的闲置退出。主动工具调用仍可后台拉起 Nomi，这一点和 Blender MCP 有意不同，理由是领域约束：用户在 AI 工具里让 Nomi 干活，预期它没开也能跑（用户拍板第 1 条）。

### 自媒体来源

本次没用 TikHub，因为这是 Nomi 自己 MCP 桥的进程生命周期问题，中文创作者自媒体里没有这一层的讨论信号；用户侧症状来自应用内反馈。详见报告 §4。
