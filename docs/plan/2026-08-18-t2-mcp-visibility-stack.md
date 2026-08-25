# T2 · MCP 可见性栈（进度 / 图片块 / 深链 / 签名预览）P0-B

plan 追溯：`docs/plan/2026-08-11-mcp-conversation-native-p0.md`（本 T2 = 其 Phase A 之后的 P0-B）。

## 问题（用户看到的现象）

MCP 驱动创作时，聊天客户端（尤其 Claude Code——它不渲染 MCP Apps 活面板）里**什么都看不到**：
生成静默约 40s（零进度）、结果里的缩略图是 `nomi-local://`（只有 Nomi 自己的 Electron 进程能解析）、
「在 Nomi 打开」只回一个动作名不带链接。这些宿主需要**结果原生**的可见性。

## 现状盘点（读代码实测，不是脑补）

- **进度（交付①）已经接好**（commit 97c0aa1d）：`mcpProtocol.ts` tools/call 里按 `params._meta.progressToken`
  建 `createProgressReporter`，起始帧 = `buildProgressStartMessage`，心跳报真实已用时长，`finally` 里 `stop()`。
  R5 已核 MCP spec（2025-11-25 / 2026-07-28）：请求 opt-in 走 `_meta.progressToken`；通知
  `notifications/progress` 带 `{progressToken, progress(单调增), total?, message?}` —— 现有实现逐字对得上。
  **缺口**：没有「经 handleIncoming 端到端证明 nomi_generate 会发进度」的协议级测试；本 T2 补齐。
  attach 模式（App 开着）下 `invoke` 是一次阻塞 fetch，阶段信息跨不过边界 →（按 brief 授权）
  心跳 ticker 在 await 期间照常 fire = 诚实的已用时长，不编造阶段。
- **图片块（交付②）完全缺失**。
- **深链（交付③）**：`buildToolOutcome` 的 `nomi_generate` 分支 `nextActions:['open_in_nomi']` 但
  **不带 openInNomi、文本里也没有链接**。
- **签名预览（交付④）**：`nomiDraft` 缩略图直接用 `result.assets[0].url`（生成后 = `nomi-local://asset/...`），
  非 Electron 宿主加载不了。production 侧的 `nomiRun` 已有 `safePreviewUrl` 过滤 + HMAC 签名 HTTP 预览。

## 关键架构事实（决定设计）

1. **thumbnail 必须在 Electron 进程里生成**（用 nativeImage）。两条到达路：
   - App 开着 → `mcpStdioServer`/`mcpNodeLauncher` 把 tools/call 转发到 App 的 `rpcServer`（Electron，有 nativeImage）。
   - App 关着 + stdio server（打包二进制以 NOMI_MCP_STDIO 跑）→ 进程内 dispatch（同样在 Electron 进程）。
   - App 关着 + bare-node launcher → **它从不本地 dispatch，总是 boot 一个 App 再走 RPC** → 缩略图仍在 App 侧生成。
   ⇒ 结论：缩略图在 **RPC 结果边界的 Electron 侧**生成（rpcServer 的 dispatch 后 / stdioServer 的进程内 invoke 后），
   base64 搭 result JSON 过河；`mcpProtocol.ts`（纯逻辑，禁 import electron）**只读**这个预置字段拼成 content block。

2. **签名预览 token 方案与 production-run 身份强绑**（`artifactProjection.ts` 的 claims `{p,r,a,path}`，
   `resolveArtifactPreview` 要求 runId+artifactId 命中 `run.artifacts`）。**生成结果没有 run/artifact**，
   故**不能原样复用** production token。但「同一机制」= 同一个 HTTP server（`/production-preview` 路，
   已挂在 rpcServer 端口的 `handleArtifactPreviewHttpRequest`）+ 同一个 HMAC token 模块。
   ⇒ 扩展方式：在 `artifactProjection.ts` 里加一个 **canvas-asset 变体 token**（claims 用 `kind:'asset'` + `{p, path}`，
   无 r/a），复用同一 secret / 同一 base64url+HMAC-SHA256 签名 / 同一 `/production-preview` 端点
   （查询参数仍 `?preview=<token>`，handler 按 token 类型分发解析），**不新起第二个 server、不弱化 production 校验**。
   canvas-asset token 解析 → 用 `resolveProjectRelativePath(projectId, path)`（nomi-local 用的同一把）落到项目根内文件，
   严格拒绝越界/符号链接/供应商 URL（沿用 `normalizeRelativePath` + owned-file 校验）。

## 交付与落点

| # | 交付 | 新增/改的文件 | 要点 |
|---|---|---|---|
| ① | 进度端到端测试 | `mcpProtocol` 协议级测试（新） | 带 token→≥1 progress、增序、message 非空；无 token→0 条。实现已在，只补测。|
| ② | 图片内容块 | `mcpPreviewImage.ts`（新，Electron 侧 nativeImage 缩放）+ rpcServer/stdioServer 结果注入 + `mcpProtocol` 读预置 base64 拼块 | ≤512px 长边、JPEG q≈60、base64 硬顶 ~64KB、每结果一张（首/主资产）。缩略失败/视频无 poster→优雅省略。|
| ③ | 深链数据化 | `mcpToolResults.ts`（generate 分支）+ `mcpAppWidget.ts`（buildNomiDraftFromGenerate 加 deepLink） | `nomi://project/{projectId}`（无 runId）；结构化 openInNomi + 文本里带链接。|
| ④ | 签名 HTTP 预览 | `artifactProjection.ts`（canvas-asset token 变体 + resolve）+ `artifactPreviewHttpServer.ts`（token 分发）+ `mcpAppWidget.ts`（safePreviewUrl 放行新路+可 mint 时用之，否则回退 nomi-local://） | 短 TTL 签名 URL；widget 校验保持严格，只放行确证的新形状。|

## 不动项（P1：不建第二实现）

- 不新起第二个预览 server；不改 planConfirmed 逻辑；不碰 production token 的 run/artifact 校验（只加旁路变体）。
- 不做视频抽帧（本 T2 明确排除）；视频无现成 poster 图 → 省略图片块。
- 进度实现不重写（已对 spec），只补测 + 若需要接一条 elapsed 心跳的真实性验证。

## 回滚

单 commit，`git revert` 即可。新模块 `mcpPreviewImage.ts` 与 token 变体是纯增量，删除即回到现状。

## 验收门

`npx vitest run electron/capabilityCore/` 全绿 + 全量 `electron/` + typecheck + check:filesize + check:i18n + lint:ci 全绿。
每个交付都有单测；进度/图片块/深链/签名各覆盖成功路 + 优雅降级路。
