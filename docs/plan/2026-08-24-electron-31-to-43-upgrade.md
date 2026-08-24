# Electron 31.7.7 → 43：EOL 升级

> 2026-08-24 立项。用户拍板：与「nomi-local 流所有权」根因修复**拆成两个 PR**，目标版本 **Electron 43（当前稳定）**。
>
> **先说清这轮不是为了什么**：立项讨论里曾假设「升 Electron 能修掉 Windows 上那个
> `ERR_INVALID_STATE` 弹框」。已实测证伪——那条缺陷在 undici 6.19.8 / 7.29.0 / 8.10.0 / `main` 里**一模一样地存在**，
> 升级修不了（证据见 `2026-08-24-local-protocol-stream-ownership.md` §1.3）。
> **本轮的唯一理由是 Electron 31 已 EOL**：不再收安全补丁，而 Nomi 是要联网跑三方模型的桌面应用，
> Chromium 126 → 150 之间累积的安全修复拿不到，这才是真风险。

---

## 1. 版本事实（2026-08-24 实查 npm registry + electronjs.org，非凭记忆）

| | 现状 | 目标 |
|---|---|---|
| electron | `^31.7.7`（Chromium 126 / Node 20 / **EOL**） | **43.4.1**（Chromium 150 / Node 24.17） |
| electron-builder | `^25.1.8` | **26.15.3**（见 §4.4 的 dist-tag 坑） |

- 官方仅支持最新 3 个大版本：今天是 **41 / 42 / 43**。31 早已出列。
- **44 于 2026-08-25（明天）转正**——本轮**刻意不追 44**：它砍 macOS 12（要求 13+）、砍 Windows ia32 预编译、
  移除渲染层 `clipboard`。等 43 稳住、44 有早期反馈后再议（用户已拍板 43）。
- npm registry 核对：`electron` 43.x 最新 = `43.4.1`，**44 尚无稳定版**；41.x=41.10.6，42.x=42.9.3。

---

## 2. 破坏性变更 → 落到本仓真实代码

只列**扫到实锤的**。官网清单里与本仓无关的（`File.path`、`setPreloads`、老协议 API
`registerFileProtocol`/`registerStreamProtocol`、`webFrame.routingId`、渲染层 `clipboard`）**已逐条 grep，全部零命中**，不再占篇幅。

### 2.1 🔴 最高风险：macOS 通知会挂（Electron 42+）

**机制**：Electron 42 把 macOS 通知从 `NSUserNotification` 迁到 `UNNotification`。
UNNotification **要求 app 已代码签名**；未签名时 `Notification` 对象直接发 `failed` 事件、**什么都不弹**
（[Electron 42 发布说明](https://www.electronjs.org/blog/electron-42-0)）。

**本仓命中**：
- 用了通知：`electron/notificationIpc.ts:33`、`electron/productionRun/productionNotificationsDesktop.ts:33`
- 签名现状：`package.json` → `build.mac.identity = null`（builder 跳过签名），
  再由 `scripts/after-pack-mac.cjs` 手工 `codesign --force --deep --sign -` 打**ad-hoc 签名**
  （这是为绕开 macOS XProtect 误报而存在的，不是为分发签名）。

**未定项（必须实测，不许猜）**：**ad-hoc 签名算不算「已签名」**，公开资料只给到「可能不够」的含糊说法，
没有权威结论。因此 §6 步骤 0 是一个**强制 spike**：先打一个 Electron 43 的 ad-hoc 包，真机点一次通知。
- spike 通过 → 按原样升级；
- spike 失败 → **升级在拿到真实签名身份之前不予合并**（否则等于用「静默丢通知」换「Chromium 更新」，
  这是拿用户可见功能换不可见收益，不接受）。这条是本轮的**否决门**。

### 2.2 🔴 `console-message` 的 `level` 变成字符串（Electron 35）

**本仓命中** `electron/main.ts:213`：

```ts
mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
  const method = level >= 2 ? console.error : console.log;   // ← level 变字符串后恒 false
```

`level` 从数字变成 `'info'|'warning'|'error'|'debug'` 之后，`"error" >= 2` 求值为 `false`
（字符串转数字得 NaN），**所有渲染层报错会静默降级成普通日志**。
这类坏法**全门都是绿的**、不崩不报，只是以后线上排障时错误级别全丢——正是最该在计划里点名的那种。

改法：迁到结构化事件对象（`event.level` / `event.message` / `event.lineNumber` / `event.sourceId`），
按字符串判级。`electron/browser/core/browserViews.ts:120` 用的是 `_level`（忽略），只需同步签名、无语义风险。

### 2.3 🟡 `webContents` 导航 API 废弃（Electron 32）

命中 6 处：`browser/core/browserViews.ts:215,216,291,296`、`browser/core/browserViewUtils.ts:76,77`
（`canGoBack` / `canGoForward` / `goBack` / `goForward`）。
43 上**仍可用（deprecated 未移除）**，但本轮顺手迁到 `webContents.navigationHistory.*`，
避免下次升级再被拦一道（P1：不留并行版）。

### 2.4 🟡 Electron 42 起 `postinstall` 不再下载二进制

`pnpm install` 之后 `node_modules/electron` 里**没有二进制**，首次 `npx electron` 才拉。
**本仓命中**（三处都靠 `require("electron")` 拿路径）：
- `scripts/dev-electron.mjs:54`
- `scripts/start-electron.mjs:10`
- `scripts/ensure-electron-signature.mjs:132`（macOS XProtect 重签脚本，链条起点）

另外 `package.json` 的 `pnpm.onlyBuiltDependencies` 里那条 `"electron"` 随之失去意义。
改法：在 `postinstall` 或上述脚本入口显式跑一次 `npx install-electron`（并处理 CI 缓存）。
**注意这是开发/CI 链路问题，不是运行时问题**——打包产物不受影响（electron-builder 自己用 `@electron/get` 下载）。

### 2.5 🟢 不需要原生模块重编

逐条核过依赖：`@ffmpeg-installer/ffmpeg`、`@ffprobe-installer/ffprobe` 是**独立可执行文件**（子进程 spawn，
不链接 Node ABI）；`quickjs-emscripten` 是 **WASM**；其余 `undici`/`socks`/`xlsx` 等均为纯 JS。
全仓**零 `.node` 原生插件**，故 NODE_MODULE_VERSION 125 → 148 与我们无关，
不需要 `@electron/rebuild`，`npmRebuild: false` 维持原样。
（Electron 33 起原生模块需 C++20——因为我们没有原生模块，同样不适用。）

### 2.6 🟢 其余低风险项

- **macOS 最低版本**：33 起要 11+，38 起要 **12+**。43 落在 12+，比 31 收紧，需在下载页/文档同步说明。
- **Windows**：32→44 无最低版本变化；44 才砍 ia32，而我们 `win.target` 只有 **x64**，不受影响。
- **ASAR integrity**：39 起转正，但**仍是 opt-in fuse、非强制**，本轮不启用（另立项）。
- **Electron 43**：对话框 `defaultPath` 默认指向「下载」目录；Linux 去掉 `showHiddenFiles`。对本仓影响可忽略。
- **utilityProcess**（37）：未处理的 rejection 从「崩进程」改为「只告警」。全仓未用 `utilityProcess`，不适用。

---

## 3. 范围

1. `electron` `^31.7.7` → `43.4.1`；`electron-builder` `^25.1.8` → `26.15.3`。
2. 修 §2.2 `console-message`（**语义修复，必做**）。
3. 迁 §2.3 六处导航 API 到 `navigationHistory.*`。
4. 修 §2.4 三个脚本 + `onlyBuiltDependencies` 清理。
5. mac/win 双平台打包验证 + §2.1 通知 spike。
6. 文档：下载页/README 的 macOS 最低版本 11+ → 12+。

---

## 4. 不动什么

- **不动 `localProtocol.ts`**。那是另一个 PR 的地盘；本 PR 与它**无依赖、可各自独立回滚**。
  两个 PR 都改到 `electron/` 但**文件不重叠**，合并顺序无所谓。
- 不启用 ASAR integrity fuse、不改 `npmRebuild`、不动 `asarUnpack` 名单。
- 不追 Electron 44（用户已拍板 43）。
- 不动 `electron-updater@^6.8.9`（6.x 仍是稳定线，7.0 还在 alpha）。
- 不借机做无关重构——升级 PR 必须**只含升级**，否则出问题时二分不出来是哪一边。
- **不动 macOS 签名策略**（除非 §2.1 spike 逼我们动）；ad-hoc 重签是为躲 XProtect 误报的既有决策，不在本轮推翻。

---

## 5. 回滚

`package.json` 版本号回退 + `pnpm install` 即可；§2.2–2.4 的代码改动本身向后兼容
（`navigationHistory` 在 31 上不存在，故这一项**必须与版本号同 commit 回滚**——步骤里单独成 commit 正是为此）。
无数据/配置迁移。已发布安装包不受影响（用户仍在旧版上，升级失败不影响存量）。

---

## 6. 验收门

**步骤 0（否决门，先于一切代码改动）**：Electron 43 + ad-hoc 签名的 macOS 包，真机验通知能弹。
失败则本轮**就地停住**并上报，不进入后续步骤。

其余门：

1. `pnpm run gates` 全绿。
2. `pnpm run test:e2e` + `pnpm run test:packaging` 绿。
3. **mac**：`pnpm run dist:mac:dir` 出包 → 打开 → 走查（起动、建项目、画布放视频、导出）+ **通知实弹**。
4. **win**：NSIS x64 出包 → 真机安装 → 同一套走查（改哪面验哪面，win32 不能拿 mac 结果顶）。
5. **§2.2 专项**：渲染层故意 `console.error` 一条，确认主进程日志里级别**仍判为 error**（防静默降级）。
6. **§2.4 专项**：干净克隆 → `pnpm install` → 直接 `pnpm dev`，确认不因缺二进制而失败。
7. 走查截图必须**自己 Read 过**才算数（R13 眼见链）。

---

## 7. 步骤（每步独立 commit）

0. `spike:` §2.1 通知验证（不合并，结论回填本文档）。
1. `fix:` §2.2 `console-message`（**先于升级**，在 31 上就能验「不依赖新版本」的那部分）。
2. `refactor:` §2.3 导航 API 迁移。
3. `chore:` §2.4 脚本 + `onlyBuiltDependencies`。
4. `chore:` 版本号 bump（electron + electron-builder），单独一 commit，便于二分。
5. `docs:` macOS 最低版本说明 + 本文档回填验收结果。

---

## 8. 风险与未验证项（诚实标注）

- **[未验证·否决门]** ad-hoc 签名能否满足 UNNotification。资料含糊，只能实测（步骤 0）。
- **[未验证]** electron-builder 25.1.8 能否打 Electron 43：**未发现**任何已知不兼容，
  builder 也没有官方兼容矩阵。本轮直接升到 26.15.3 规避，而不是赌 25 能用。
- **[dist-tag 坑]** `electron-builder` 的 `latest` = **26.15.3**，但 `v26` tag = **26.15.7**，两者不一致、
  原因未公开。本轮取 `latest`（26.15.3）——即 `npm i electron-builder` 的默认落点，用户面最一致；
  若过程中需要 26.15.4–.7 的某个修复再单独议。
- **[需注意]** 若将来接 Windows 签名，electron-builder 26 已把 `win.signtoolOptions`/`win.azureSignOptions`
  合并进 `win.sign`（可用 `electron-builder migrate-schema` 自动迁）。当前未签 Windows，暂不适用。
- **[连带]** Node 20 → 24 是两个 semver-major。主进程代码可能踩到与 Electron 无关的 Node 行为变化，
  §6 的 e2e + 双平台走查是主要防线。
