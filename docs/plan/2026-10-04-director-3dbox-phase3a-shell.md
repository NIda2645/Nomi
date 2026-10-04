# 3D-BOX 段 3a：开关与导演视图外壳设计卡

改动名：Director 3D-BOX shell · 线/负责人：feat/director-3dbox-shell · 类别：[新界面]

| 格 | 结论 | 证据 |
|---|---|---|
| ★1 用户怎么用 | 当创作者在画布导演台里要一段预演时，开关开构建显示占画布区的导演视图；Agent 仍在右侧面板，用户浏览只读镜头条并切精修手调。空工程只显示空态，不做计划 schema、付费出片或历史并入。 | `/Users/aoqimin/Desktop/Nomi-3dbox-plans/mockups/director-3dbox-mockup.html`；真实任务走查待 3d |
| ★2 谁说了算 | 3D-BOX 开关 owner=`electron/shared/featureFlags/director3dbox.ts`；编辑工程 owner=DirectorEditor 的 store；外部写入唯一入口=`directorSessionRegistry.ts`；实测景别/运镜 owner=`directorEvalMeasurement.ts`。主进程值经 preload 同步 IPC，渲染层只消费证明。 | `node scripts/door-map.mjs director3dBoxProof`；`git grep director3dbox` |
| ★3 一致与复用 | 复用现有 DirectorViewport、DirectorEditor、EditorSplit、DirectorTopBar、directorEvalMeasurement；精修路径不新增实现。配置烘焙复用 build-electron/intake 的产物门岗形状，但开关读取规则独立为“打包只认 baked、dev 才认 env”。 | `pnpm exec vitest run ...directorSessionRegistry.test.ts ...directorEvalMeasurement.test.ts` |
| ★4 全状态 | 空：镜头条提示先让 Agent 搭预演；加载：沿用现有导演台 lazy boundary；成功：导演视图 + 实测镜头条 + 预览小窗；失败：保留现有精修错误与测量问题；部分成功：逐镜条保留可测值，未知显示未测量；取消/关闭：现有退出确认与自动保存；过期：开关证明带 `expiresOn=2026-11-15`，门岗可读。zh/en 文案都走 director locale。 | `src/i18n/locales/director.ts`；`pnpm run check:i18n` |
| 5 中途表 | 外壳只读渲染，不发起付费任务；关闭窗口沿用退出确认，编辑中的 store 由当前写者保存；Agent 外部写入在会话开启时进入 store，退出时一次写回。断网/重启不新增状态，保留旧工程。 | `DirectorEditor.tsx`；外部写入测试 |
| 6 外部数据与失败 | 烘焙文件缺失/坏值时打包默认关；preload 取不到主进程证明时强制关并记录 stderr/console；跨进程 fingerprint 不一致时强制关。实测模块遇到无相机或无主体显示未测量。 | `director3dbox.ts`；`check-packaged-flags.mjs` |
| 7 性能预算 | 镜头条测量采样 4fps，按工程时长计算；不增加视频导出帧数，也不生成大文件。真规模性能与离屏预演属于 3b/3d。 | `DirectorViewShell.tsx` |
| 8 真实条件 | macOS 真机已完成 zh/en 轨与开关关对照；真实 `t2-courtyard` 三镜工程写入、等待自动保存后重载仍保留 3 镜；Windows 与最小窗口未覆盖。第四轮代码已修复 PIP token、CTA 分割按钮与 static 词汇；同一最终构建的六张重拍仍未完成，保持 `unverified`。 | `docs/evidence/2026-10-04-director-3dbox-shell/README.md`；R13 表；CI Canvas job |
| ★9 验收与回滚 | 验收：开关门岗读包内 `feature-flags.json`、主/preload 指纹日志、导演视图 UI 单测/真机走查、开关关 core-smoke；回滚：revert 本 PR 或构建 `NOMI_DIRECTOR_3DBOX=false`，旧 DirectorEditor 外壳路径不变。 | `pnpm run build:electron`；`pnpm run test:core-smoke -- --fixture empty`；独立验收线待编排者安排 |

临时债：R13 真机截图与 Windows/英文走查，owner=3d 验收线，到期 2026-11-15；到期前未清即保持 `unverified`，不把本地绿灯写成完成。

## 样张对账（布局 A / 导演视图 v2）

| 样张约束 | 实现 | 证据 / 状态 |
|---|---|---|
| 导演视图占画布区，Agent 保留在右侧 | `DirectorEditor` 依据 flag 给壳留下 `assistantPaneWidth`，`DirectorViewShell` 只填画布区 | 七张 R13 真截图；中英文导演态均对上 |
| 导演 / 精修切换；精修沿用现有导演台 | `DirectorViewShell` 与既有 `EditorSplit` 分支切换，flag 关闭完全走旧分支 | `core-smoke --fixture empty`（flag off）通过 |
| AiSceneBar 不挂 | 导演视图传 `showAiSceneBar={false}` | zh/en 导演态截图；未出现 AiSceneBar |
| 镜头条只读，显示实测景别 / 运镜 / 时长 | 4fps 调用 `directorEvalMeasurement`，镜头按钮只切预览机位 | zh/en 三镜截图各有 3 卡；定向测量测试通过 |
| 预览小窗与主按钮占位 | 复用 `DirectorViewport` 现有预览小窗；主按钮显示 `用这段预演出成片 ▾` / `Produce from this preview`，禁用并给 3b 原因提示 | zh/en 导演截图；出片留给 3b |
| 空工程态 | 镜头条显示空态，不创建计划 schema；PIP 空态使用 `bg-nomi-media-veil` 语义 token | `pnpm run check:tokens`；第四轮截图重拍待完成 |

## R13 第三轮真机收货（2026-10-04）

Playwright/Electron dev 构建（`NOMI_DIRECTOR_3DBOX=true`）截图已入库，均为 1280×933 PNG 且小于 400 KB：

| 截图 | 实际画面 | 样张对账 |
|---|---|---|
| `zh-empty-director.png` | 中文空工程导演视图：返回+标题、导演/精修+重置、撤销/重做、禁用主按钮四簇；PIP 深色空态；右侧 Agent 与底部空镜头条保留 | 对上样张布局 A、v2 四簇顶栏、深色空态；右侧反馈卡属于既有 Agent 壳 |
| `zh-three-director.png` | 中文三镜导演视图：PIP 有机位预览，底部 3 卡为 0.0–4.3s 远景/拉远、4.3–8.3s 远景/static、8.3–12.0s 全景/推近 | 对上样张只读镜头条、实测景别/运镜/时长与画布占区 |
| `zh-three-refine.png` | 中文精修：既有对象/资产面板、检查器、时间轴与 PIP | 对上“精修＝今天整套原样” |
| `en-empty-director.png` | English Director view with Director/Refine, Produce, Program and empty shot strip | 对上英文轨；该文件是 z-index 修复前的已读证据，PIP 浅色空态差异保留为限制 |
| `en-three-director.png` | English three-shot Director view with 3 cards: 0.0–4.3s Far/Pull out, 4.3–8.3s Far/Static, 8.3–12.0s Wide/Push in | 对上英文镜头条与测量文案 |
| `en-three-refine.png` | English Refine with the existing full editor | 对上精修原样复用 |
| `flag-off-legacy-director.png` | 开关关中文旧导演台：原工具条、场景对象/资产面板、时间轴与浅色旧 PIP | 对上开关关逐字节旧壳对照；未改变旧分支 |

三镜重载丢失的根因已修复：外部 registry 写入过去只更新 mounted store，没有同步调用节点 writer，2 秒自动保存或重载前会把旧 `node.meta.directorProject` 写回；现在外部写入在同一调用栈导出并写入节点，测试覆盖写入后重载保留 3 镜。开关关走同一旧分支，core-smoke empty 通过。

CI `Canvas Acceptance (Linux) (1)` 新一轮 [run 37184939085](https://github.com/aqm857886159/Nomi/actions/runs/37184939085) 仍为 7/8：第 8 项是 `read-only-reload`，在断言前因 Electron spawn 60s timeout 退出，因此没有第 8 项输出；`open-fit` 自身 5 条断言全部打印并通过。干净 `origin/main` 的 [run 37169425485 job](https://github.com/aqm857886159/Nomi/actions/runs/37169425485/job/111339218677) 同 job 通过，说明本 PR 没有改动 `open-fit` 判据，当前红是走查启动不稳定。

## R13 第四轮（2026-10-04）

- 根因修复：preload 首帧同步 feature-proof 曾复用要求稳定 frame URL 的普通 IPC 守卫，阻塞首次 `loadURL`；新增仅校验登记主窗口身份/角色的 bootstrap 守卫，其他 IPC 仍走原严格守卫。
- 启动证据：修复前分支 flag-off 走查 61.49s/61.52s/61.68s 均在 Electron 启动超时；干净 `origin/main` 同命令 16.10s/13.37s/13.12s 通过；修复后分支三次 14.59s/13.44s/13.39s 通过。
- 代码门岗：`pnpm run typecheck`、`check:tokens`、`check:i18n`、`check:mockup-contracts`、`check:root-cause-contracts` 通过。
- 截图重拍：尚未完成，见证据目录 README 的明确限制；不得把旧图当作第四轮完成收据。
