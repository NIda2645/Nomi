# Lane E — pi 生态是否已经有人做了「扩展沙箱 / 权限 / 策略层」

调研日期 **2026-09-14**。只读调研，未改仓库代码。
本仓依赖版本：`@earendil-works/pi-coding-agent`（npm latest 0.85.1，本地 node_modules 一份 docs 完整）。

## TL;DR

**结论是正面的，不是负面的：pi 生态已经长出一整片权限/沙箱层，不需要从零造。**
但有一条关键分界线必须先认清：

> **市面上所有这些包都拦「工具调用」，没有一个拦「扩展 factory 代码」。**
> 扩展的 factory 在 load 时就跑了，比任何 `tool_call` 钩子都早，而这些权限扩展自己也是同一个 loader 加载的普通扩展。
> 想拦住 factory，只有两条路：**装之前审（vetting）** 或 **整个 pi 进程放进 OS/容器沙箱**。

pi 上游对此**明确拒绝修**（见 §3 的 issue #6715，closed as `not_planned` + `no-action` 标签）。

---

## 1. npm 生态扫描（我实际跑了哪些检索）

端点：`https://registry.npmjs.org/-/v1/search?text=keywords:pi-package%20<kw>&size=25`
关键词逐个跑过：**sandbox / permission / policy / guard / isolate / secure / security / approval / allowlist / firewall / audit / trust**（12 个）。
每个关键词返回 25 条，人工筛出安全相关的约 90 个独立包。
周下载量端点：`https://api.npmjs.org/downloads/point/last-week/<name>`，全部于 2026-09-14 取。

> ⚠️ 检索口径说明：npm 的 `text=keywords:X Y` 是宽松全文匹配（每次都返回 `total: 9831` ＝ 整个 pi-package 关键词池大小），不是严格 keyword AND 过滤。所以结果是「相关度排序的前 25」，不是穷举。**下面的名单是有代表性的样本，不是生态全集。**

### 1.1 周下载量排行（2026-09-14 实测）

| 周下载 | 包 | 类别 |
|---|---|---|
| 1,999,808 | `@earendil-works/pi-coding-agent` | （基线：pi 本体） |
| **7,549** | `@gotgenes/pi-permission-system` | 决策层（见 §2） |
| **895** | `pi-sandbox` | OS 沙箱 |
| **878** | `@erichll/pi-auto-review` | 模型审批 broker |
| **768** | `pi-landstrip` | OS 沙箱（原生二进制） |
| **686** | `@amaster.ai/pi-security` | 决策层（Codex 式 profile） |
| **627** | `@erichll/pi-sandbox` | OS 沙箱 |
| 542 | `@yaosu/pi-path-guard` | 路径 guard |
| 478 | `pi-daddy` | 子 agent 能力治理 |
| 368 | `@zhushanwen/pi-permission` | 决策层 |
| 349 | `@xzzpig/pi-permission-system` | gotgenes 的 fork |
| 325 | `pi-permission-system` | 上游原版（MasuRii） |
| 209 | `@upstash/box-pi` | 远程沙箱 |
| 203 | `pi-permission-modes` | 决策层 + OS 沙箱 |
| 143 | `@casualjim/pi-heimdall` | secret / 命令策略 |
| **106** | `pi-vetter` | **装前审包（唯一能拦 factory 的那一类）** |
| 66 | `pi-auto-approval` | 模型分类审批 |
| 61 | `@thurstonsand/pi-permissions` | 决策层 |
| 53 | `pi-ast-guard` | Bash AST 拦截 |
| 50 | `@daytona/pi` | 远程沙箱 |
| 45 | `pi-marketplace` | 装前审 + 安装 |
| 43 | `pi-better-sandbox` | OS 沙箱 |
| 34 | `pi-approval-guardian` | fail-closed 审批 |
| 33 | `pi-permission-control` | 决策层 |
| 22 | `zmarketplace` / `pi-extension-e2b` | 跨 agent 市场 / 远程沙箱 |
| 21 | `pi-permission-suite` | 决策层 |
| 18 | `@silmaril-security/pi-firewall-plugin` | firewall |
| 16 | `@bacnh85/pi-permission` | 决策层 |
| 13 | `pi-perm` | sandbox-runtime 封装 |
| 12 | `pi-seatbelt-sandbox` / `pi-agent-permissions` | macOS Seatbelt / 策略 |
| 11 | `@nqbao/pi-sandbox` / `pi-guard-sandbox` / `@biratkk/pi-trust-policy` | OS 沙箱 / 允许表 |
| 8 | `pi-secure-it` / `pi-docker-sandbox` / `@alexleekt/pi-pkg-guard` | 两层 guard / Docker / 包登记 |
| 7 | `@xicode/pi-permission-system` | 预构建审计版分发 |
| 6 | `pi-security-scanner` / `@artale/pi-sentinel` | 扫描 / 审计链 |
| 5 | `@oddsjam/pi-sandbox` / `@igormaka/pi-sandbox` | OS 沙箱 |
| 4 | `@melihmucuk/leash` / `@jonstuebe/pi-guard` / `@iota-policy/pi-extension` | guardrail / Gondolin / YAML 策略 |
| 3 | `@bruschill/pi-plugin-security-audit` | **扩展静态审计 + 指纹防篡改** |
| 2 | `@grwnd/pi-governance` | RBAC / HITL |

**判断：最大的一个（7.5k/周）也只占 pi 本体（2M/周）的 0.38%。生态很热闹，但没有任何一个成了事实标准。**

### 1.2 按「在哪一层拦」分类（四类，机制真的不同）

**A 类 · 决策层（in-process，钩 `tool_call` / `user_bash`）** — 最多人做，也最弱
- `@gotgenes/pi-permission-system` 7549 — 见 §2
- `@amaster.ai/pi-security` 686 — 「资源感知策略引擎」，把工具调用分类成 files/shell/network 资源，按 `sandbox × approval` 两轴 profile 判 allow/deny/ask（明说抄 Codex）。听 `tool_call`/`user_bash`，**不注册 LLM 可调用的工具**（避免被模型绕过），无 UI 时 fail-closed。
- `@iota-policy/pi-extension` 4 — 一份 `agents.yaml` 放仓库里像 `.gitignore`；**hash-pinned bless**（仓库策略要你按哈希批准，改了给你看 diff）；策略文件本身对 agent 写保护；决策落 `.iota/decisions.jsonl`；~0.2ms/次、零 token。机制上是这批里最干净的一个，但几乎没人用。
- `@artale/pi-sentinel` 6 — SHA-256 哈希的不可变审计链 + 22 条破坏性命令模式 + **自修改检测**（监控对 extensions / AGENTS.md / .ssh / .env 的写）。
- 其余同层：`@zhushanwen/pi-permission`(368, AST+规则三层)、`@thurstonsand/pi-permissions`(61)、`pi-permission-modes`(203)、`pi-permission-control`(33)、`@bacnh85/pi-permission`(16)、`@biratkk/pi-trust-policy`(11)…

**B 类 · OS 内核沙箱（bubblewrap / Seatbelt / seccomp）** — 真边界，但只包住 bash
- `pi-sandbox` 895（carderne）— 依赖 `@carderne/sandbox-runtime`（fork 自 **Anthropic 的 `anthropic-experimental/sandbox-runtime`**）。read/write/edit 走 allow/deny 列表直接控制，bash 走 OS 沙箱控网络+文件系统；**被拦时弹交互提示让你临时/永久放行**，不是静默失败。README 自己承认为了兼容 agent-browser 等工具，示例 config「开了不小的安全口子」。
- `@erichll/pi-sandbox` 627 — 直接用 **Anthropic 官方 `@anthropic-ai/sandbox-runtime`**。Linux = bubblewrap 命名空间 + seccomp，macOS = 生成 Seatbelt profile。文件系统是**静态策略、fail-closed**，明确说「不把运行时文件系统拒绝转成动态授权，因为 sandbox-runtime 没有可信的 fs ask 回调」；网络走 静态 deny → 静态 allow → 动态审查（交给 `@erichll/pi-auto-review`），一次批准只对那一条连接生效。工程上是这批里最严谨的。
- `pi-landstrip` 768 — 自带 Linux/macOS/**Windows** x64+Arm64 原生二进制（这批里唯一覆盖 Windows 的）。关键设计：**「agent 权限管工具派发，不管沙箱访问；批准永远不能绕过沙箱硬拒绝」** —— 决策层和隔离层职责分得很清。二进制或平台不可用时 fail-closed。
- `pi-secure-it` 8 — 三层：①OS bash 沙箱 ②**in-process 工具 guard 补 OS 沙箱够不到的工具**（read/write/edit/fetch_content/web_search）③子 agent 无头时降网络。这个「两层互补」的拆法值得抄。
- 其余：`pi-perm`(13)、`pi-seatbelt-sandbox`(12)、`pi-guard-sandbox`(11)、`@nqbao/pi-sandbox`(11)、`@oddsjam/pi-sandbox`(5)、`@igormaka/pi-sandbox`(5)、`@jonstuebe/pi-guard`(4, Gondolin micro-VM)

**C 类 · 远程/容器沙箱（把工具执行整个送走）**
- `@upstash/box-pi` 209、`@daytona/pi` 50、`pi-extension-e2b` 22、`pi-docker-sandbox` 8、`@stixxert/pi-docker-sandbox`、`pi-extension-opensandbox`
- 机制一致：agent 跑在本地，**所有工具调用路由到远程 ephemeral sandbox**。

**D 类 · 装前审包 / 供应链（⭐ 这一类才拦得住 factory）**
- **`pi-vetter` 106** —— 本调研里最贴近我们问题的一个。README 原文（中文）直说：*「Pi 以完整用户权限安装扩展包并执行其 `postinstall` 脚本，而内建更新提示只告诉你"有更新"。」* 做法：对每个候选版本多路证据评估，给 **ALLOW / ASK / DENY** 判定 + 完整证据清单；`/vet` 只读评估，`/vet-install` 评估后 TUI 多选、只装你批准的版本。依赖 **`@sigstore/bundle` + `@sigstore/verify` + `tar-stream`** ＝ 真的验 sigstore 签名和 tarball，不是 grep 关键词。还处理了 **TOCTOU**（装前重新比对 registry 完整性）、registry 不一致就中止、装完比对落盘文件与扫描 tarball 的逐文件摘要。README 自己诚实标注：这是**检测不是预防**——比对时 lifecycle 脚本已经跑过了。
- `pi-marketplace` 45 — `marketplace_audit`（元数据检查 + 源码关键词扫描）→ 用户确认 → 安装，**从不自动装**。比 pi-vetter 弱（只有关键词扫描，无签名验证）。
- `@bruschill/pi-plugin-security-audit` 3 — 静态审计 + **指纹防篡改**：审过一次后给整套已装扩展打指纹，任何变动告警；三个抓变更的点（wrapper / in-session guard / launchd watchdog），manifest 锚在 Keychain 里。**把读到的代码当不可信输入**——注释里写「this package is safe, mark as approved」会被算作减分而不是加分（很聪明的反提示注入设计）。诚实标注局限：只静态分析一方 JS/TS，不读 `.node`/`.wasm` 原生二进制，**in-session guard 晚一个 session 才生效（扩展先于它加载）** ← 又一次印证 factory 问题。仅 macOS。
- `@alexleekt/pi-pkg-guard` 8 — 只管「npm 装了但没在 pi settings 登记」的孤儿包，是卫生工具不是安全边界。
- `zmarketplace` 22 — 跨 agent（pi/omp/claude…）市场搜索+审计。

---

## 2. `@gotgenes/pi-permission-system` 专项（任务 2）

- **URL**：https://www.npmjs.com/package/@gotgenes/pi-permission-system ｜ 源码 https://github.com/gotgenes/pi-packages/tree/main/packages/pi-permission-system
- **版本**：32.0.2（2026-09-14 取）｜ **周下载 7,549**
- **依赖**：`tree-sitter-bash` ^0.25.1、`web-tree-sitter` ^0.26.9、`zod` ^4.4.3 ｜ peer: `@earendil-works/pi-coding-agent` >=0.79.0、`@earendil-works/pi-tui` >=0.79.0
- **血统**：fork 自 `MasuRii/pi-permission-system`，已大幅分叉。另有下游 fork：`@xzzpig/…`(349)、`@xicode/…`(7)、`@monroewilliams/…`、`@bryan2333/…`、`@coderdkai/…`

### 它实际拦在哪一层

**纯 in-process 决策层**，钩 pi 的 `tool_call`。四个 surface，most-restrictive-wins 合成：
`path`（横切，所有文件访问）→ `external_directory`（cwd 边界）→ 每工具 pattern → `bash` 命令 pattern。
三态 `allow` / `deny` / `ask`。

工程质量确实高，几个值得抄的点：
- **bash 用 tree-sitter AST 解析**，不是正则。间接包装器（`bash -c`/`eval`/`sudo`/`env`/`xargs`/`find -exec`）藏起来的命令会被识别并降级到 `ask`，而不是静默放行。
- **fail-closed**：内部 gate 报错 → 阻断（记 `gate_error`）；bash 解析不出来 → `ask`（哨兵 `<unparseable-bash-command>`），不 fall through 到宽松的 `*`。v16.0.0 专门做了这个 breaking change。
- **符号链接解析**：path pattern 同时匹配「agent 写的路径」和「符号链接解析后的规范路径」，堵住 symlink 别名绕过。
- **方向轴**（ADR 0013）：`path_read` / `path_write` / `external_directory_read` / `external_directory_write`。bash 里靠重定向算子（`> out.txt` 证明写、`< in.txt` 证明读）和一张冻结的 20 个只读命令词表（`cat`/`grep`/`ls`/`find`…）来**证明**方向；证明不了的两个方向都查。
- **`path` 是横切的，per-tool allow 盖不过它** —— 扩展和 MCP 工具凡是带路径参数的默认都被这一层管住。
- **项目配置要 project trust**（v22.0.0）：不可信目录里只有全局配置生效，一个恶意仓库无法放宽你的全局策略。
- **`authorizerChain`**：`ask` 落地前可以先问一串已注册的决策链接（比如小模型判官 `@gotgenes/pi-permission-model-judge`），opt-in，链主会把任何链接在 path/external_directory 上的 `allow` 降级为 `defer`。核心本身**不发任何 LLM 请求**。

### ❗ 它挡不挡扩展的 factory 代码 —— **不挡**

三条证据：

1. **README 的 Non-goals 原文明说**：*「_Implementing isolation._ This is a decision layer — it decides and records; a sandbox contains.」* 并把「对被允许动作的真正隔离」指向「agent sandbox」。
2. **时序对不上**。pi 的 `docs/extensions.md:156` 说扩展默认导出一个 factory，`:181` 说 factory 返回 Promise 时 pi 会 await 它，**在 `session_start` 之前、在 `resources_discover` 之前**。这个权限系统靠 `tool_call` 事件工作 —— 那时 factory 早跑完了。
3. **它自己也是一个普通扩展**，被同一个 jiti loader 加载。谁先加载由 load order 决定，它对同批次其它扩展的 factory 没有任何优先权。

**所以：它保护的是「pi 跑起来之后，agent 想干什么」，不保护「一个恶意包在被加载那一刻能干什么」。**
对我们的 `pi-web-access` 读 Chrome cookie 那类问题 —— 如果那是在工具调用里读的，这层能拦（`path` deny `~/Library/Application Support/Google/Chrome/*`）；如果是在 factory 里读的，这层一点办法没有。

---

## 3. pi 官方安全立场（任务 3 + 4）

### 3.1 官方文档（本地 node_modules 一份 = 上游同一份）

- 本地：`node_modules/@earendil-works/pi-coding-agent/docs/security.md`（**存在**，任务 4 答案）
- 线上：**https://pi.dev/docs/latest/security**（2026-09-14 可访问；`https://pi.dev/docs/security` 是 404，正确路径带 `/latest/`）
- 相关：`docs/containerization.md` / https://pi.dev/docs/latest/containerization
- 仓库（从 npm `repository` 字段确认，任务给的 `earendil-works/pi` 是**对的**）：https://github.com/earendil-works/pi ，coding-agent 在 `packages/coding-agent`

`security.md` 的立场非常明确，三段核心（原文要点）：

1. **「No Built-in Sandbox」——是刻意的，不是没做完。**
   > 内建工具能读写文件、跑 shell，权限等同 pi 进程；**扩展是以同样权限运行的 TypeScript 模块**。
   > 理由原文：*「一个半吊子的 in-process 沙箱很容易被误以为是安全边界，而它实际上仍然依赖宿主 shell、文件系统、包管理器、凭据和扩展代码。真正的隔离必须来自操作系统或虚拟化/容器边界。」*

2. **Project Trust 只是「输入加载门」，不是沙箱。**
   原文：*「It is not a sandbox and it does not restrict what the model can ask tools to do after you start working in a directory.」*
   管的是 `.pi/settings.json`、`.pi/extensions|skills|prompts|themes`、`.pi/SYSTEM.md`、`.agents/skills` 这些要不要加载；决定存 `~/.pi/agent/trust.json`，默认 `defaultProjectTrust: "ask"`。
   **注意两个口子**：`AGENTS.md` / `CLAUDE.md` / `AGENTS.override.md` **无视 project trust 照常加载**；非交互模式（`-p`、`--mode json`、`--mode rpc`）**不弹 trust 提示**。

3. **安全边界之外的明确列表**（上游不接的报告）：
   > *「Expected local-agent behavior, lack of a built-in sandbox, prompt injection from untrusted content, and behavior of user-installed extensions or skills are generally outside the security boundary」* —— 除非能证明真的绕过了权限边界。

`packages.md` 里的安全提示：
> *「Pi packages run with full system access. Extensions execute arbitrary code, and skills can instruct the model to perform any action including running executables. Review source code before installing third-party packages.」*

**核实：`grep -i "integrity|checksum|signature|sign|verify|audit" docs/packages.md` → 0 命中。官方文档里没有任何包完整性/签名机制。**（与 2026-09-07 的 `package-manager.js` 零完整性检查结论一致）

`containerization.md` 给的是三条外部路径，全是「把整个 pi 进程放进去」：**Gondolin micro-VM / Docker Sandboxes (`sbx`) / NVIDIA OpenShell**。

### 3.2 GitHub issue 实况（GitHub Search API，2026-09-14）

跑过的查询：`repo:earendil-works/pi` + `sandbox`(173) / `permission`(148) / `extension security`(56) / `trust`(144) / `package signing`(9)。

**最关键的一条 —— 正是我们的问题，上游明确不修：**

> **#6715「Extensions auto-execute from project-local `.pi/extensions/` without approval」**
> https://github.com/earendil-works/pi/issues/6715
> 状态：**closed · `not_planned` · 标签 `no-action`**（关闭于 2026-07-16）
> 报告人指出 `packages/coding-agent/src/core/extensions/loader.ts` 用 jiti 编译执行任意 TS/JS，全进程权限，**clone 一个恶意仓库、用 pi 打开就跑了，还没等你输入第一句 prompt**。
> 提的三条建议 —— ①发现项目级扩展时告警 ②执行前要显式批准 ③**考虑扩展签名或校验和验证** —— **全部被以 no-action 关闭。**
>
> （补充事实：pi 后来确实把项目级扩展挂到了 project trust 后面 —— `extensions.md:111` 附近写「Project-local `.pi/extensions` entries load only after the project is trusted」。但这只解决了「项目仓库里的扩展」，**完全没解决「你自己 `pi install` 装的 npm 包」** —— 那些在 trust 之前就以全局扩展身份加载。）

其它相关：
- **#9381「Package Report: pi-safe-compact」** https://github.com/earendil-works/pi/issues/9381 — closed `not_planned` / `no-action`，但带 **`package-report` 标签** ⇒ 上游确实有一条「举报可疑包」的 issue 通道。这一例是有人发现发布者 GitHub 账号消失了，问「这扩展谁负责？代码托管在哪？」—— **典型的匿名 npm 包供应链风险，无人应答。**
- **#9228「Add an opt-in custom-tool confirmation example for untrusted tool output」** https://github.com/earendil-works/pi/issues/9228 — closed `not_planned`。含有价值的实测：报告人用 **AgentDojo v1.2.2** 跑 pi，一个只读请求（读网页）因网页里的 `<INFORMATION>` 注入块，导致 pi 执行了三次无关的 Slack 成员变更，三次工具结果都 `error: null`，AgentDojo 判 `security=true`（注入成功）+ `utility=true`。上游同样不接。
- **#9068「user_bash silently falls back to host execution when an execution-routing extension fails」**（**open**）https://github.com/earendil-works/pi/issues/9068 — 对所有 C 类远程沙箱方案是硬伤：路由扩展一挂，**静默回落到宿主执行**。谁要接远程沙箱方案必须先看这条。

**未核实 (unverified)**：`https://raw.githubusercontent.com/earendil-works/pi/main/SECURITY.md` 今天取不到（curl http=000，可能是网络/路径问题）。`security.md` 引用的 SECURITY.md 路径写的是 `earendil-works/pi-mono`，与 npm repository 字段的 `earendil-works/pi` 不一致（历史改名残留，未核实哪个是现役）。

---

## 4. 对 Nomi 的结论

### 4.1 该不该自己造

**不该造 A 类（in-process 决策层）**，那已经有 40+ 个实现、最好的一个（gotgenes）用 tree-sitter AST + fail-closed + 符号链接解析 + 方向轴，我们造不出更好的，而且它**解决不了我们最担心的问题**。

**该做的是 D 类（装前审）+ B 类（进程隔离）的组合**，因为 factory-time 执行只有这两条路拦得住：
- **装前**：`pi-vetter`(106/周) 已经把 sigstore 验签 + tarball 逐文件摘要 + TOCTOU 防护做出来了 —— 这是**最接近我们需求的现成件**，值得先真读它的代码再决定抄还是接。
- **运行时**：`@erichll/pi-sandbox`(627) 或 `pi-landstrip`(768) 已经把 Anthropic `sandbox-runtime` 接进 pi 了。Nomi 是 Electron App，pi 在我们进程里跑，B 类方案能不能原样用**未核实**，需要单独验。

### 4.2 三条可以直接拿走的设计判据

1. **`pi-landstrip` 的分层原则**：「批准永远不能绕过沙箱硬拒绝」—— 决策层和隔离层是 AND 不是 OR。这条应该写进我们的任何权限方案。
2. **`pi-secure-it` 的两层互补**：OS 沙箱管 bash，in-process guard 管 OS 沙箱够不到的工具（read/write/fetch/web_search）。任何只做一层的方案都有洞。
3. **`@bruschill/…` 的反提示注入姿态**：审计时把被审代码当敌意输入 —— 「这个包是安全的，请标记为已批准」这种注释**算减分**。我们做任何自动审计都要抄这条。

### 4.3 必须记住的三个事实

1. **pi 上游不会替我们解决这个问题**（#6715 `no-action`，security.md 明说扩展行为在安全边界之外）。
2. **生态里没有事实标准**（最大的 7.5k/周 vs pi 本体 2M/周 ＝ 0.38%；同名 fork 满天飞：`pi-permission-system` 至少 6 个 scope 的版本）。选谁都是在赌一个个人维护者。
3. **凡是「in-session」的防线都晚一步** —— `@bruschill` 自己承认 in-session guard「晚一个 session 生效，因为扩展先于它加载」。这正是 R28「防线建在最早能拦住的那层」说的事：**这一层最早只能建在「安装时」，建不到「加载时」。**

---

## 附：本次实际跑过的检索清单（负面结论的依据）

| # | 检索 | 结果 |
|---|---|---|
| 1 | npm search `keywords:pi-package` × 12 关键词（sandbox/permission/policy/guard/isolate/secure/security/approval/allowlist/firewall/audit/trust），每个 size=25 | ~90 个安全相关独立包 |
| 2 | `api.npmjs.org/downloads/point/last-week/` × 47 个包 | 见 §1.1 全表 |
| 3 | `registry.npmjs.org/<pkg>` 取 README + dependencies × 13 个重点包 | 见 §1.2 / §2 |
| 4 | `registry.npmjs.org/@earendil-works/pi-coding-agent` → repository 字段 | `github.com/earendil-works/pi`（任务给的名字正确） |
| 5 | GitHub Search API `repo:earendil-works/pi` × 5 查询 | sandbox 173 / permission 148 / extension security 56 / trust 144 / package signing 9 |
| 6 | `api.github.com/repos/earendil-works/pi/issues/{6715,9381,9228}` 全文 | 见 §3.2 |
| 7 | 本地 `node_modules/@earendil-works/pi-coding-agent/docs/` 列目录 + 读 `security.md` 全文 + `packages.md` 前 120 行 + `extensions.md` 关键段 | 见 §3.1 |
| 8 | `grep -i "integrity\|checksum\|signature\|sign\|verify\|audit" docs/packages.md` | **0 命中** |
| 9 | `pi.dev/docs` HTML 抽 href → 真实文档路径 | `/docs/latest/security` 存在；`/docs/security` 404 |

**未核实 (unverified)**：
- B 类 OS 沙箱在 Electron 内嵌 pi 的场景下是否可用 —— 没验。
- `pi-vetter` / `@erichll/pi-sandbox` 的**实际源码**没读，以上机制描述来自它们各自的 README（作者自述）。要选型必须先读码。
- `earendil-works/pi-mono` vs `earendil-works/pi` 哪个是现役仓库名 —— SECURITY.md 今天取不到。
- npm 搜索是宽松匹配的前 25 条，**不是穷举**；可能有未出现在样本里的包。
