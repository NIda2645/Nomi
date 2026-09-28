# MCP 被动请求不冷启 · 先查别人调研（prior-art，2026-09-28）

> 对应方案：[docs/plan/2026-09-28-mcp-background-launch.md](../../plan/2026-09-28-mcp-background-launch.md)。
> 问题：AI 工具（Codex / Claude / Cursor）连着 Nomi 的 MCP 时，客户端重连、刷新列表发来的被动发现请求会冷启完整 GUI，用户关了窗口它又弹出来。
> 本报告回答四问：依赖里已有？仓库里已有？生态里已有？自媒体怎么说？最后给结论。

## 1. 依赖里已有？（Electron 43.4.1，`node_modules/electron/electron.d.ts`）

- **隐藏启动**：`BrowserWindow` 的 `show: false` 与 `ready-to-show`，官方文档「Showing the window gracefully」一节（https://www.electronjs.org/docs/latest/api/browser-window ）。直接用，不自写「先建窗口再挪到屏幕外」一类的土办法。
- **「窗口被显示」这一刻**：`BrowserWindow` 的 `show` 事件（`node_modules/electron/electron.d.ts:4953`）。我们把它当作「窗口显示过」的唯一 owner：任何入口把窗口亮出来都会经过它，不用在每个入口各记一份。
- **后台节流**：`webPreferences.backgroundThrottling`（`node_modules/electron/electron.d.ts:19232`）。隐藏窗口里的计时器默认会被节流，后台干活时需要关掉；只对后台启动关，正常启动保持默认。
- **单实例 + 第二次启动**：`app.requestSingleInstanceLock()` 与 `second-instance` 事件（`node_modules/electron/electron.d.ts:737`、`:1373`）。用户手动再开一次 Nomi 时，由已在跑的实例把窗口显示出来。
- **macOS 隐藏 Dock 图标**：`app.dock.hide()`（`node_modules/electron/electron.d.ts:8088`）。

## 2. 仓库里已有？（以 origin/main 为准）

- 冷启路径本来就只有一条：`electron/capabilityCore/mcpNodeLauncher.ts:203` 的 `ensureLiveInstance` → `:151` 的 `startNomi`。问题不在「有两条路」，而在所有请求（包括被动发现）都走了这一条。
- 零窗口自愈已经有唯一入口：`electron/mainWindowPresence.ts:10` 的 `createMainWindowGuard`（activate / second-instance / 窗口重建都走它），后台启动复用它，不另写一份。
- 单实例锁已在 `electron/main.ts:109` 取得；第二次启动的显示逻辑沿用现有 second-instance 处理。
- 技能列表（`resources/list` / `prompts/list` 的内容）由 App 经 RPC `skills.list` 提供（`electron/capabilityCore/nomiMcpSkills.test.ts:24` 的假 transport 记录了这一契约）——所以 App 没开时，桥手里本来就没有这份数据，只能回空，而不是替 App 另读一份。

## 3. 生态里已有？

- **MCP 规范（2025-06-18）生命周期**（https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle ）：`initialize` 必须是第一次交互，之后才是列表与调用；stdio 传输下由客户端把服务端作为子进程拉起、由客户端关闭。规范只管「协议服务端」这个进程，**完全不涉及它背后的 GUI 宿主要不要启动**——这是我们自己的决定，规范没有给出也不禁止。客户端在连上后、重连后都会发列表请求，所以列表请求必须是便宜、无副作用的。
- **Blender MCP**（https://github.com/ahujasid/blender-mcp ）：MCP 服务端**从不**替用户启动 Blender；要求用户先打开 Blender、在插件面板里点「Start MCP Server」，没开时工具调用直接失败。这是同类「GUI 宿主 + MCP 桥」最常见的做法：被动请求、主动调用都不拉起宿主。
- **Electron 官方文档**（同 §1 链接）：`ready-to-show` 与 `show: false` 的组合、`backgroundThrottling` 对隐藏页面的影响，是后台启动的标准做法。

## 4. 自媒体来源

本次没用 TikHub，因为这是 Nomi 自己 MCP 桥的进程生命周期问题（被动发现请求触发冷启），面向创作者的中文自媒体里没有这一层的讨论信号；用户侧的真实症状已经来自应用内反馈（「关了、结束进程，过一会窗口又自己弹出来」）。

## 5. 结论：依赖已有的全部直接用，只自研两小块

- **直接用**：Electron 的 `show: false` / `show` 事件 / `backgroundThrottling` / 单实例锁 / `app.dock.hide()`；仓库现有的 `ensureLiveInstance` 冷启路径与 `createMainWindowGuard` 零窗口自愈。
- **自研（没有现成的）**：
  1. 被动发现请求「只探测、不冷启」的分流（`invokeIfOpen`）：MCP 规范不管宿主进程，现成 SDK 也没有这层。
  2. 后台启动的闲置退出（最后一次 RPC 后 10 分钟、无在途生成与制作 Run 才退）：Electron 不提供，逻辑依赖我们自己的在途任务账本。
- **和 Blender MCP 的有意不同**：主动工具调用仍允许拉起 Nomi（后台、不开窗）。理由是领域约束：用户在 AI 工具里让 Nomi 生成素材，本来就预期 Nomi 没开时也能干活（用户 2026-09-28 拍板第 1 条）；只有被动发现请求不再拉起。
