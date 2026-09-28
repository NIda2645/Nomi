# 发版审计：把「用户真正拿到的东西」纳入检查

> 状态：🚧 进行中。2026-09-28 用户要求：
> - 「能否设计一种审核机制，然后检测这些问题，因为明显安装包这个事是个低级的错误」
> - 「还有哪些可以帮助我们减少问题的发生」
> - 「去构建一下」
>
> 本方案先建 A（包体审计）和 F（回归测试必须会咬人），其余几层按 §4 的顺序接上。

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

## 先查别人

- **electron-builder 官方**：`dependencies`（生产依赖）不管你怎么配 `files` 都会整包复制进应用，`devDependencies` 不会；构建期工具（文中以 esbuild 为例）应挪到 `devDependencies`，或用 `ignoredProductionDependencies` 排除。
  - 源码注释：`packages/app-builder-lib/src/options/PlatformSpecificBuildOptions.ts`
  - 收集逻辑：`packages/app-builder-lib/src/util/appFileCopier.ts`
  - 排错文档：`website/docs/troubleshooting.md`
  - 仓库地址：https://github.com/electron-userland/electron-builder
- **v27 起 node_modules 按目标平台和架构过滤**：`website/docs/migration/v27-breaking-changes.md`。另一平台的二进制本不该出现在包里，出现就是配置问题。
- **包体预算的通行做法**：基线加 CI 超了就红，PR 里贴变化量，例如 size-limit（https://github.com/ai/size-limit）。本方案借这个思路，但对象是整个安装包而不是前端 bundle，所以自己写审计脚本，不引依赖。
- **仓库里已有**：
  - `check:filesize`（源文件行数门岗，不看产物）；
  - `check:supply-chain-pins`（依赖版本钉死，不看有没有必要装进包）；
  - `desktop-rc.yml`（已经打三平台包，审计接在它后面）。
