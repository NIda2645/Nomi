# 发版审计：把「用户真正拿到的东西」纳入检查

> 状态：🚧 进行中。2026-09-28 用户要求：
> - 「能否设计一种审核机制，然后检测这些问题，因为明显安装包这个事是个低级的错误」
> - 「还有哪些可以帮助我们减少问题的发生」
> - 「去构建一下」
>
> 本方案先建 A（包体审计）和 F（回归测试必须会咬人），其余几层按 §4 的顺序接上。
>
> 2026-09-28 进展：A 已在分支 `claude/release-audit` 本地实现并验证（Windows），记录见 §8；macOS 基线等下一次 desktop-rc。F 未开始。

## 1. 为什么会漏：我们只检查仓库里的代码

仓库里已经有一百多道门岗：类型、单测、token、i18n、文件大小、根因合同……但它们看的都是**仓库里的源代码**。用户真正拿到的是另外四样东西，没有任何一道门岗看过：

1. **安装包本身**：多大、里面装了什么。
2. **装完、升级的过程**：从上一版升上来，旧项目能不能打开，更新要下多少。
3. **真人从头到尾点一遍**：全部功能都走得通吗。
4. **发版以后在用户机器上的表现**：崩溃、报错、卡顿。

安装包 1.2GB 就是在第 1 样里长出来的。2026-09-28 实测，0.22.4 Windows 版安装包 350MB，装完 1.2GB：

| 部分 | 大小 | 问题 |
|---|---|---|
| `app.asar` 里的 `node_modules` | 约 620MB | electron-builder 会把 `dependencies` 里的库全部原样装进去。界面用的库已经被 Vite 打进 `dist/assets`（整个界面代码才 30MB），又原样多装了一份。大头：`onnxruntime-web` 92、`@tabler/icons-react` 55 + `@tabler/icons` 11、`@sparkjsdev/spark` 30、`three-stdlib` 25 + `three` 14、`hls.js` 23、`@mediapipe/tasks-vision` 19（单位 MB） |
| `app.asar.unpacked` | 161MB | ffprobe 78 + ffmpeg 62（真用得到），另有 esbuild 12（是否运行时要用待查） |
| Chromium 语言包 | 47MB | 50 多种语言，我们只用中英 |
| 其它 | — | `dist-electron/*.js.map` 也装进去了；`public/**` 与 `dist` 有重复（如两份 `tailwind.generated.css`） |

更新也是同一个盲区。Mac 版没签名，不能就地更新，每次都要用户打开网页重下约 500MB 的安装包（`electron/update/autoUpdater.ts:27`）。Windows 能就地安装，是否增量下载待查。

## 2. 六道检查 + 一个例行问题

| 层 | 看什么 | 什么时候跑 | 形式 | 能拦住的例子 |
|---|---|---|---|---|
| **A 包体审计** | 安装包与装完大小；按包拆分；多装的依赖；禁带文件（source map、测试夹具、别的平台二进制、多余语言包） | 每次打候选版，自动 | CI 门岗 + 基线棘轮（只许变小，变大要登记理由） | 这次的 1.2GB |
| **B 安装与升级审计** | 干净机器首装、从上一版升级（真实项目拷贝能打开、设置和密钥还在）、应用内更新真能走通、更新要下多少 | 每次候选版 | 候选版必验清单（Windows 本机 + Mac） | 升级后旧项目打不开、Mac 每次重下 500MB |
| **C 全功能真人走查** | 桌面版 Codex 用 computer use 点完全部功能 | 每次正式发版前，在候选版上跑 | 审计报告，阻断项不修不发 | 功能点不通、文案错、流程断 |
| **D 性能与资源预算** | 启动时间、空闲 CPU 与内存、真素材画布帧率、导入大素材耗时 | 每次候选版 | 预算棘轮（画布性能已有门岗，补启动与内存） | 越来越慢、越来越占内存 |
| **E 发版后盯盘** | 崩溃留痕、应用内反馈、错误率 | 每天，自动 | 超阈值提醒要不要热修（接待办 T-QA-47 / T-QA-48） | 闪退没人知道、反馈没人看 |
| **F 回归测试必须会咬人** | 带根因合同的 PR：CI 自动把生产代码退回修复前，合同里点名的回归测试必须变红 | 每个带根因合同的 PR | CI 门岗 | 测试其实空转（这周 Codex 交付里出现过好几次：读源码数字符串、手势不触发挤出、改反了方向还改测试） |

**例行问题**：每份审计报告最后都要回答一句——「这次有没有用户会碰到、但没有任何检查看过的东西？」答出来的就进待办，下一版变成一道检查。发现盲区本身也要有人管，不然只是在等下一次撞上。

## 3. 本次先建：A 和 F

### A 包体审计（门岗 + 瘦身）

- **`scripts/audit-package.mjs`**：输入打包产物目录（Windows `win-unpacked`，Mac `.app/Contents/Resources`），输出报告：
  - 安装包大小、装完大小；
  - asar 按包拆分、解包的原生依赖；
  - 语言包；
  - 禁带文件命中、别的平台二进制。

  报告和 `docs/engineering/package-budget.json` 基线比：
  - 大小只许变小；变大必须带理由登记。
  - 基线存**身份**不存裸数字：允许装进包的依赖清单，每条带理由。
- **`scripts/check-packaged-deps.mjs`**（contracts 里跑，静态，不用打包）：
  - 主进程与 preload 运行时真正加载的模块集合，从 `dist-electron` 产物的导入图推导；
  - 再加显式允许清单（运行时按路径加载的原生程序和二进制，如 ffmpeg、ffprobe、sandbox-runtime），每条带理由。
  - `package.json` 的 `dependencies` 必须落在这个集合里，多出来的挪到 `devDependencies`。
  - **加规则前先验它会红**：拿现在的 main 跑，必须报出上表那些包。
- **瘦身**：
  - 界面库挪进 `devDependencies`；
  - `electronLanguages` 只留中英；
  - 去掉与 `dist` 重复的 `public/**`；
  - `*.map` 带不带、esbuild 运行时要不要，先查清用途再定。
- **接进候选版流程**：`desktop-rc.yml` 每个平台打包后跑审计，超预算就红；报告作为 CI 产物上传；发版 PR 正文贴报告摘要。

### F 回归测试必须会咬人

- 新门岗（名字待定，例如 `check:regression-bites`），在 CI 的 PR 事件里跑，只对带根因合同的 PR 生效：
  1. 把本 PR 改动的**非测试**生产文件退回 merge-base；
  2. 跑合同里 `regression_tests` 列出的单测（走查脚本除外）；
  3. 至少要有一条红；全绿说明这些测试证明不了修复，门岗红。
- 例外只许登记，写明原因（比如修复在构建配置里，单测测不到）；登记是带到期日的承诺，不是防线（R17）。

## 4. 之后的顺序

1. B 的「从上一版升级」和「更新要下多少」进候选版必验清单。Mac 签名与自动更新要用户决定（Apple 开发者账号），单独出对比表。
2. C 按用户 09-28 要求，在下一版候选版上跑（待办 T-QA-51）。
3. E：崩溃留痕（T-QA-47）与反馈雷达接 R2（T-QA-48）。
4. D：补启动时间与内存预算。

## 5. 不做

- 不在 CI 里花钱；
- 不改 Electron 大版本；
- ffmpeg 与 ffprobe 这次不换更小的构建（真用得到，另议）。

## 6. 验收

- A：
  - 瘦身前后的审计报告对比表（Windows 和 Mac 各一份）；
  - 打包后的 Windows 版真机冒烟与核心冒烟（空项目 / 用过的项目）通过；
  - Mac 打包版在 CI 里能启动；
  - 故意把一个界面库挪回 `dependencies`，`check:packaged-deps` 必须红；
  - 故意让包体超预算，审计必须红。
- F：
  - 拿本周一个真实的根因合同 PR 试跑：修复退回后回归测试变红，门岗绿；
  - 把测试换成空转版本，门岗红。

## 7. 回滚

各自独立回滚：删门岗脚本、从 `desktop-rc.yml` 拿掉那一步、`package.json` 依赖分组还原。依赖只是挪分组，不删功能代码。

## 8. A 的实施记录（2026-09-28，分支 `claude/release-audit`，本地提交未推送）

### 8.1 瘦身前后（Windows x64，同一棵树本机各打一次 NSIS）

「前」= 并入 origin/main 后、挪依赖之前的树；「后」= 本分支。两次都是 `pnpm run build` + `electron-builder --win nsis --x64 --publish never`，用 `scripts/audit-package.mjs` 量。

| 项 | 前 | 后 | 变化 |
|---|---:|---:|---:|
| 安装包 `Nomi-win-x64.exe` | 333.8MB | 272.4MB | −18.4% |
| 装完（win-unpacked 全部文件） | 1189.9MB | 769.9MB | −35.3% |
| `app.asar` | 670.2MB | 312.9MB | −53.3% |
| `app.asar.unpacked` | 162.6MB | 144.9MB | −10.9% |
| 语言包 | 55 个 / 46.6MB | 3 个（en-US zh-CN zh-TW）/ 1.6MB | −96.5% |
| 包里的 npm 包 | 659 个 | 266 个 | −393 |
| 禁带文件 | 14,910 处（source map 14,705 个 187.7MB、测试 161、夹具 7、`.env` 1、public 重复 30、别的平台二进制 6） | 0 | |
| 运行时闭包断链 | 4 处（@mantine/hooks、@leafer-in/resize 两个 peer 没装） | 0 | |

界面产物 `dist/` 前后 540 个文件逐个 sha256 相同：挪依赖只改了「装不装进包」，没改 Vite 打出来的东西。
安装包只降 18%、装完降 35%，是因为 NSIS 压缩对重复的 JS 很有效；剩下的大头见 8.6。

### 8.2 依赖：挪了 47 个，留下 28 个

`check:packaged-deps` 在挪之前红，列出 47 个找不到主进程运行时证据的包，全部挪进 `devDependencies`（lockfile 只搬分组，版本一个没变，`pnpm install --frozen-lockfile` 通过）：
@fontsource-variable/fraunces、@fontsource-variable/inter、@imgly/background-removal、@leafer-in/editor、@leafer-in/export、@mantine/core、@mantine/modals、@mantine/notifications、@photo-sphere-viewer/core、@radix-ui/react-dropdown-menu、@radix-ui/react-switch、@radix-ui/react-tooltip、@react-three/drei、@react-three/fiber、@sparkjsdev/spark、@streamdown/cjk、@streamdown/code、@tabler/icons-react、@tanstack/react-virtual、@tiptap/core、@tiptap/extension-highlight、@tiptap/extension-list、@tiptap/extension-placeholder、@tiptap/extension-table、@tiptap/pm、@tiptap/react、@tiptap/starter-kit、@tiptap/suggestion、@xyflow/react、clsx、framer-motion、i18next、img-fx、immer、leafer-ui、perfect-freehand、react-dom、react-i18next、react-resizable-panels、react-router-dom、scheduler、streamdown、swr、tailwind-merge、three、use-sync-external-store、zustand。

留下的 28 个，门岗逐个打印证据：24 个主进程真 import（如 electron-updater ← `dist-electron/update/autoUpdater.js`，zod 58 处）；4 个按路径加载、进 `runtimeAllowlist`（ffmpeg、ffprobe、sandbox-runtime、onnxruntime-web，各写理由与出处）；react 是 `ai` 带进来的 @ai-sdk/react 与 swr 的非可选 peer（electron-builder 不跟 peer，必须由我们的 dependencies 提供）。

### 8.3 查用途的结论

- **public/**：Vite 的 publicDir 已把 public 下每个文件拷进 dist（逐个比对过），页面按 `dist/index.html` 的相对路径取；主进程没有任何地方按 `app.asar/public` 读文件（`electron/assets/assetsIpc.ts` 的注释早就写了「进包两份」）。从 `build.files` 去掉。
- **source map**：运行时没人读——没有 `process.setSourceMapsEnabled`、`--enable-source-maps`、`source-map-support`；崩溃日志记原始栈帧，Crashpad 记原生 minidump。`!**/*.map` 排除（绝大多数在 node_modules 里）。
- **esbuild**（解包目录 11MB）：由 @earendil-works/chord 的 dependencies 带进来；chord 里只有 `dist/node/bundle.js` import 它，只经 `chord/bundler` 导出可达，而我们随包的 pi-agent-core / pi-coding-agent 只 import `chord/context`。用 `!**/node_modules/esbuild/**`、`!**/node_modules/@esbuild/**` 排除，在 `package-budget.json` 的 `excludedModules` 登记理由和「谁 import 它」名单；上游多一处 import，`check:package-budget` 就红，逼人重判。
- **语言包**：Chromium 的 .lproj 命名是 en-US → en、其余把 `-` 换成 `_`；electron-builder 26.15.3 按文件名字面匹配（master 才加了 `-`/`_` 等价），所以 Windows 写 `en-US zh-CN zh-TW`，macOS 写 `en zh_CN zh_TW`。留 zh-TW 的原因：`app.getLocale()` 只报包里有语言包的语言，首启界面语言由它经 `normalizeDesktopLocale` 决定（zh-* → 中文，其余 → 英文）。本机探针（拷一份 Electron 运行时、只换语言包、打印 `app.getLocale()`）：留 en-US zh-CN zh-TW 时 `--lang=zh-TW`/`zh-HK` 都解析成 zh-TW；只留 en-US zh-CN 时解析成了 zh-CN——那是因为本机系统语言是简体中文，Chromium 回落到了系统语言，繁体系统上没有这条回落，会落到 en-US 变成英文界面。多留 0.8MB 换繁体用户首启仍是中文。同一探针里，包里没有的语言（ja、tr、de）会回落到系统首选语言中第一个包里有的，都没有才是 en-US；对非中文系统结果和以前一样是英文界面。
- **测试、夹具、.env**：第三方包自带的 `*.test.*` / `*.spec.*` / `__tests__`（zod、tiptap、entities…）、`dist/fixtures`（只给设计实验室用）、编进 dist-electron 的 `providerAdapter/tests` 竞争夹具、@ffmpeg-installer/ffmpeg 里的 `.env`，一并排除。
- **别的平台二进制**：0.22.4 的 Windows 包里还有 6 个跑不起来的原生文件（sandbox-runtime 的 Linux apply-seccomp 两个、srt-win arm64，pi-tui 的 darwin 两个与 win32-arm64）。afterPack 原先只认 ffmpeg/ffprobe 的子包名，现在按包的 `os`/`cpu` 与文件头判断，判据与审计共用 `scripts/packaging/native-binaries.cjs`。

### 8.4 门岗、基线与接线

- `check:packaged-deps`（contracts）：用 build:electron 的两份 tsconfig 在内存里 emit 主进程（不读盘上可能过期的 dist-electron），扫全部 1,122 个产物的 require / import / import() / resolve / createRequire 别名；另算 allowlist 与随包包的非可选 peer。
- `check:package-budget`（contracts）：审计脚本单测、平台二进制单测（此前没有任何流程跑它）、预算文件自检（形状、macOS 欠账到期、excludedModules 与 build.files 同步、排除模块的 importers 名单）。
- `scripts/audit-package.mjs`：量产物、出 JSON 报告和人读摘要；大小超预算（基线 × 1.05）、npm 包或语言包多一个、禁带文件、运行时闭包断链、ffmpeg/ffprobe 目标不对，任一条红。基线只许 `--update-baseline` 显式改，变大要 `--allow-growth "<理由>"` 记进 history；有毛病的包不许当基线。`pnpm run audit:package-size` 现在跑它。
- `desktop-rc.yml`：Windows 与 macOS 作业在 MCP 冒烟之后、候选包上传之前各跑一次审计，红了作业就红；报告不论红绿都上传（`package-audit-windows` / `package-audit-macos`），摘要写进作业 summary。原「Verify packaged media target(s)」步骤并进审计。
- 基线：win32-x64 已按本机瘦身后的包登记；darwin-arm64 / darwin-x64 登记为带到期日（2026-10-12）的欠账，下一次 desktop-rc 跑完用 `node scripts/audit-package.mjs --from-report <报告> --update-baseline` 登记。

### 8.5 验证

- 打包版冒烟（Windows，瘦身后的 `release/win-unpacked/Nomi.exe`）：
  - `tests/ux/packaged-mcp-smoke.e2e.mjs`（desktop-rc 同款）通过：24 个工具、165 个资源、四个签名客户端建项目与起 run、未签名写入被拒。
  - 核心冒烟清单三个场景（node-params-and-version-pill、canvas-drag-pan-gestures、spend-confirm 两例）在空项目与用过的项目两种夹具下全过；外加一条本地走查覆盖「新建项目 → 画布渲染 → 预览导出 MP4（ffprobe 验出 1920×1080 视频流）」。
  - `test:core-smoke` 本身不支持打包版（`initialLocalStorage` 靠开发版才认的 `-r` 预加载），上面是用一个不入库的本机外壳把清单场景指向打包版跑的：偏好改为首个文档后写入再刷新，其余夹具、依赖、断言原样复用。
  - 所有主进程输出、App 自己的日志目录、走查输出里 `Cannot find module` / `MODULE_NOT_FOUND` 命中 0 处。
- 变异校验：把 @tabler/icons-react 挪回 dependencies → `check:packaged-deps` 红；把 asar / 装完预算临时调到 300MB / 700MB → 审计红；从基线里删掉 ws 与 zh-TW → 审计红（「多了 1 个 npm 包」「语言包多了」）；拿登记好的基线审「前」那个包 → 大小、393 个多出的包、52 个多出的语言包、禁带文件、4 处断链全部报红。

### 8.6 发现但本次没做

- **导出按钮的静默吞点击**：切到预览页后，顶栏「导出 MP4」比预览里的导出监听器早约 80ms 可点，这一瞬间的点击派发给 0 个监听器、没有任何反馈（打包版两次实测）。与本次改动无关（界面产物逐字节相同），交协调会话排期。
- **下一批包体大头**：`skills/` 在 asar 里 110MB（精选技能的预览大图，单张 2–4MB）；onnxruntime-web 70MB，而运行时只伺服深度 worker 用的 jsep 那一份 wasm/mjs。两项都要先查清用途再动，本次不做。
- **macOS**：本机没有 mac，mac 包的对比表、基线与「在 CI 里能启动」要等下一次 desktop-rc（quality-gate 的 mac-package 作业也会在本 PR 上打 mac 目录包并跑打包版 MCP 冒烟）。
- **Nomi Preview**：继承了同一套 `build` 配置，瘦身同样生效，但 desktop-preview 没接审计。

## 先查别人

- **electron-builder 官方**：`dependencies`（生产依赖）不管你怎么配 `files` 都会整包复制进应用，`devDependencies` 不会；构建期工具（文中以 esbuild 为例）应挪到 `devDependencies`，或用 `ignoredProductionDependencies` 排除。
  - 源码注释：`packages/app-builder-lib/src/options/PlatformSpecificBuildOptions.ts`
  - 收集逻辑：`packages/app-builder-lib/src/util/appFileCopier.ts`
  - 排错文档：`website/docs/troubleshooting.md`
  - 仓库地址：https://github.com/electron-userland/electron-builder
- **实施时逐条核对过的出处（2026-09-28，读的是本机装的 app-builder-lib 26.15.3 编译产物，对应源码如下）**：
  - 生产依赖收集：https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/node-module-collector/pnpmNodeModulesCollector.ts ——跑 `pnpm list --prod`，每个包只跟 manifest 里的 dependencies / optionalDependencies，peer 一律不跟，所以随包库要的 peer 只能由我们的 dependencies 提供。
  - node_modules 的文件过滤：https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/util/NodeModuleCopyHelper.ts ——`files` 里的排除模式按 `node_modules/<包>/…` 的相对路径匹配，所以 `!**/node_modules/esbuild/**` 能把传递依赖整包排除。
  - 语言包裁剪：https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/electron/ElectronFramework.ts ——26.15.3 按文件名字面匹配（只转小写，不把 `-`/`_` 视为等价，master 才加），Windows 删 `.pak`、macOS 删 `.lproj`。
  - Chromium 的 macOS 语言包命名：https://raw.githubusercontent.com/chromium/chromium/main/build/config/locales.gni ——en-US 输出为 en，其余把 `-` 换成 `_`（zh_CN、zh_TW）。
- **v27 起 node_modules 按目标平台和架构过滤**：`website/docs/migration/v27-breaking-changes.md`。另一平台的二进制本不该出现在包里，出现就是配置问题。
- **包体预算的通行做法**：基线加 CI 超了就红，PR 里贴变化量，例如 size-limit（https://github.com/ai/size-limit）。本方案借这个思路，但对象是整个安装包而不是前端 bundle，所以自己写审计脚本，不引依赖。
- **仓库里已有**：
  - `check:filesize`（源文件行数门岗，不看产物）；
  - `check:supply-chain-pins`（依赖版本钉死，不看有没有必要装进包）；
  - `desktop-rc.yml`（已经打三平台包，审计接在它后面）。
