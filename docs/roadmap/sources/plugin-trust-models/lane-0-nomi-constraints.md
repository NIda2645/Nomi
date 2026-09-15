# Nomi 侧现状（只读核对，2026-09-14）

基线 worktree：`/Users/aoqimin/Desktop/Nomi/.claude/worktrees/pr-776-777-review-20bd6c`，分支 `fix/agent-panel-stop-copy-retry-20260914`。

| 事实 | 证据（file:line） |
|---|---|
| Agent lane 宿主跑在 **Electron 主进程**，无 utilityProcess/fork/worker 隔离 | `electron/agentLane/laneHost.mts:7-20`（"主进程宿主（**薄**）"）；全 `electron/` 下 `grep utilityProcess` 零命中 |
| 模型调用在主进程装配，`apiKey` 是 provider config 的一个字段 | `electron/agentLane/laneModelProvider.mts:22-29`（`modelConfigSchema` 含 `authType`/`apiKey`） |
| 花钱闸 = **主进程独占铸造**的 spend grant，渲染层只拿不透明 `grantId` | `electron/spendGrant.ts:6-18`（"令牌只在主进程铸造与持有"；"校验+消费在同一同步 tick 原子完成"；"闸放在缓存命中之后、真实 vendor 调用之前"） |
| 工具级拦截已存在：Nomi 的闸挂在 pi 的 `before_tool` / `after_tool` | `electron/agentLane/laneHost.mts:11-12`；2026-09-07 探针实测「原封不动拦住了第三方扩展注册的工具」（`docs/research/2026-09-07-pi-extension-load-probe.md` §0.2） |
| 但扩展 **factory 阶段**（加载那一刻）不过任何闸，实测能读 env / 发网络 / 写文件 | 同上 §0.3 |
| OS 级围栏已在仓库里：`@anthropic-ai/sandbox-runtime`（macOS `sandbox-exec` / Linux seccomp+bubblewrap / Windows `srt-win.exe`） | `electron/agentLane/laneCodingSandbox.mts:1-30`、`:167-175`（linux `apply-seccomp`、win32 `srt-win.exe` 的 vendor 路径都已接） |
| 围栏的网络策略形状 = **域名白名单**，默认空即全拒 | `laneCodingSandbox.mts:55`（`allowedDomains`）、`:104`（`?? []`）、`:206`（`network: { allowedDomains, deniedDomains: [] }`） |
| **但今天没有任何声明式来源往 `allowedDomains` 里填东西**——全仓仅 4 处命中，全在该文件内部 | `grep -rn allowedDomains electron`（排除测试）＝ `laneCodingSandbox.mts:55/91/104/206` |
| 围栏只包住 **bash 工具的 operations**，不包住宿主进程本身 | `laneCodingSandbox.mts:16-17`（"我们只换 `operations`"） |
| 平台不支持时不假装有沙箱：返回 `active:false`，自动放行档整档消失，全落回人工点头 | `laneCodingSandbox.mts:18-21`、`:202` |
| 声明式收窄已有雏形：技能清单的 `requested-capabilities` **只能收窄**宿主能力天花板，不能放宽 | `electron/skills/skillManifestSchema.ts:112`、`:147`；`electron/skills/skillCapability.ts:1-6` |
| 技能包 = **纯数据**，文本白名单 + 深度上限，二进制/可执行不进包 | `electron/skills/skillPackage.ts:37-39`（`SKILL_TEXT_EXT` = md/markdown/json/txt/ya?ml/csv）、`:40`（`SKILL_PATH_MAX_DEPTH = 4`） |
| 完整性：顺序无关 SHA-256 覆盖整个文件映射，对不上直接拒 | `electron/skills/skillPackage.ts:82-91`；`skillStore.ts:336-338`（前置调研 §6 P-5 已记） |

**结论（供正文用）**：Nomi 今天的「插件」是纯数据技能，**一行第三方代码都不跑**。四块拼图里三块已经在盘上（花钱闸在主进程、工具闸在 `before_tool`、OS 围栏带域名白名单），缺的那块是 **「声明 → 围栏」的那根线**：manifest 里没有 `allowedDomains` 这种字段，围栏里也没有任何东西去填它。

**需更正任务书一处**：任务书写「Windows/Linux 暂无沙箱」。代码里 Linux（`apply-seccomp`）与 Windows（`srt-win.exe`）的 vendor 路径都已接（`laneCodingSandbox.mts:167-175`）；真正的限制是 Windows 侧上游标 alpha 且要一次提权安装，我们不替用户提权（`:23-27`），所以那台机器上 `active:false`。Linux 侧是否真跑通**未核实**（本次只读代码，没跑）。
