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
| 8 真实条件 | macOS 真机截图、Windows、英文、最小窗口、真实 3 镜工程尚未在本轮完成，均标 `unverified`；开关关 core-smoke 先跑空工程。 | 截图与走查收据待补 |
| ★9 验收与回滚 | 验收：开关门岗读包内 `feature-flags.json`、主/preload 指纹日志、导演视图 UI 单测/真机走查、开关关 core-smoke；回滚：revert 本 PR 或构建 `NOMI_DIRECTOR_3DBOX=false`，旧 DirectorEditor 外壳路径不变。 | `pnpm run build:electron`；`pnpm run test:core-smoke -- --fixture empty`；独立验收线待编排者安排 |

临时债：R13 真机截图与 Windows/英文走查，owner=3d 验收线，到期 2026-11-15；到期前未清即保持 `unverified`，不把本地绿灯写成完成。

## 样张对账（布局 A / 导演视图 v2）

| 样张约束 | 实现 | 证据 / 状态 |
|---|---|---|
| 导演视图占画布区，Agent 保留在右侧 | `DirectorEditor` 依据 flag 给壳留下 `assistantPaneWidth`，`DirectorViewShell` 只填画布区 | 代码已实现；真机 R13 `unverified` |
| 导演 / 精修切换；精修沿用现有导演台 | `DirectorViewShell` 与既有 `EditorSplit` 分支切换，flag 关闭完全走旧分支 | `core-smoke --fixture empty`（flag off）通过 |
| AiSceneBar 不挂 | 导演视图传 `showAiSceneBar={false}` | 代码已实现；真机 `unverified` |
| 镜头条只读，显示实测景别 / 运镜 / 时长 | 4fps 调用 `directorEvalMeasurement`，镜头按钮只切预览机位 | 定向测量测试 + 代码审阅；真机 `unverified` |
| 预览小窗与主按钮占位 | 复用 `DirectorViewport` 现有预览小窗；主按钮禁用并标占位 | 代码已实现；出片留给 3b |
| 空工程态 | 镜头条显示空态，不创建计划 schema | 代码已实现；真机 `unverified` |

## R13 第二轮真机收货（2026-10-04）

Playwright/Electron dev 构建（`NOMI_DIRECTOR_3DBOX=true`）截图已入库，均为 1280×933 PNG 且小于 400 KB：

| 截图 | 实际画面 | 样张对账 |
|---|---|---|
| `docs/evidence/2026-10-04-director-3dbox-shell/zh-empty-director.png` | 中文导演视图，画布区占左侧，顶部导演/精修、右上出片占位、左上预览小窗、底部只读镜头条为空态；右侧 Agent 保留 | 对上布局 A 的画布占位、PIP、只读镜头条、Agent 不被覆盖；未对上的是空工程仍有右侧 Agent 反馈卡（属于现有壳） |
| `docs/evidence/2026-10-04-director-3dbox-shell/zh-three-director.png` | 中文三镜注入走查截图，导演视图壳与 Agent 保持；当前画面未显示可播放机位 | 三镜工程注入未形成有效镜头数据，记录为未对账，不宣称通过 |
| `docs/evidence/2026-10-04-director-3dbox-shell/zh-three-refine.png` | 中文精修切换后回到完整编辑器：对象/资产面板、时间轴、工具条可见 | 对上“精修＝现有整套原样”，且导演壳不再覆盖编辑器 |
| `docs/evidence/2026-10-04-director-3dbox-shell/en-empty-director.png` | English Director view，Director/Refine、Produce、Program、No cameras yet、Shot strip 英文可见 | 对上布局 A 与英文轨；未对上的是尚未完成三镜英文截图 |
| `docs/evidence/2026-10-04-director-3dbox-shell/flag-off-legacy-director.png` | 开关关中文旧导演台，对照图保留旧全屏编辑器与原镜头条 | 对上开关关旧行为与旧控件层级；与开关开空态壳有明确视觉差异 |

R13 英文三镜工程两张截图因隔离工程落盘重载时未能稳定重新打开节点，保留为未完成项；没有把中文三镜空镜头截图当作三镜验收通过。
