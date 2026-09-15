# 设计账本重盘：哪些设计真的还没做进去

> 状态：📎 交接/日志 — **实扫结果，不是账本抄写**。基准 `origin/main @ 155f660ce`（2026-09-14）。
> 用法：想做某个 UI 面之前先查这张表，别再按 09-08 那份旧账本派工——**旧账本里有三项判错了**（见文末）。
> 待办条目在 [TODO](TODO.md)，原始需求在 [sources/](sources/)。

**一句话结论**：设计欠的不是一大片，是**一大一小两块**——大的是**全局左侧栏**（整组零代码），小的是**Agent 面板 v4 的两条分隔线**（A3 阶段线、A6 压缩线）。其余 09 月的设计**大都已经在 main 上跑着了**，包括 09-08 账本记成「未落地」的 `shot_table` 节点和生成过程渐显。

---

## 一、逐面对账

| 面 | 设计产物 | origin/main 真实状态 | 差什么 |
|---|---|---|---|
| **全局左侧栏** | [`docs/design/2026-09-08-left-sidebar-canvas-nodes-process-feedback.md`](../design/2026-09-08-left-sidebar-canvas-nodes-process-feedback.md) A 组 | ⛔ **只有设计，零代码**。`GlobalRail\|NavRail\|SidebarRail\|globalSidebar` 全仓 0 命中；`src/workbench/sidebar/` 是**项目内画布节点树**（`CategoryTree.tsx`），不是它；顶栏仍在（`WorkbenchShell.tsx:8` 仍 import `NomiAppBar`） | 整组 A：常驻导航五功能簇、顶栏归位去重、资源抽屉、窄屏区间。设计文档自己写了「本单不改左侧栏」——**从没人接过这一单** |
| **画布节点 · 拆解/分镜表节点** | 同上 B 组 + [`docs/plan/2026-09-07-storyboard-table-node.md`](../plan/2026-09-07-storyboard-table-node.md) | ✅ **已落地**（09-08 账本记的「src 无 shot_table」已过期）。`src/workbench/generationCanvas/nodes/registry.ts:63` 注册 `kind:'shot_table'`；主进程 `electron/capabilityCore/nodeKindDomain.ts:15`；实体 `nodes/shotTable/ShotTableNode.tsx` + `factBridge.ts`（拆解片→表投影）+ `creation/storyboard/exec/ensureStoryboardShotTable.ts:15`（原稿拆镜→表）；共 123 处引用 | 表节点本体齐了。**新需求在另一张纸**：用户 09-13 要的「上视频下表格、跟播放联动滚动」是**新面**，不在这份设计里（TODO `T-DS-06`） |
| **生成过程反馈渐显** | 同上 C 组 + [`docs/plan/2026-09-09-process-feedback-imgfx.md`](../plan/2026-09-09-process-feedback-imgfx.md) | ✅ **已落地**（09-08 账本记的「未落地」已过期）。`img-fx@0.5.1` 真装（`package.json:272`）；`GenerationWaitingSurface.tsx:2` 接 `<ImageGeneration>` + 4 槽并发门控 → `NodeGeneratingOverlay` → `BaseGenerationNode.tsx:624` 挂在每个生成节点；带 `useReducedProcessMotion` | 无明显欠账；「完成后两秒内动画结束、媒体零遮挡」没跑真机复验 |
| **Agent 面板 v4** | [`docs/design/2026-09-06-agent-panel-v4.md`](../design/2026-09-06-agent-panel-v4.md) + [偏差清单](../design/2026-09-06-agent-panel-design-lab-deviations.md) | 🟡 **大面积落地，两件确实还欠**。v3 常驻面板整体下线（`ResidentThinkingState/SpendCard/ArtifactCard/FoldableText/CollapsedDock` 全仓 0 命中），现役 `src/workbench/ai/v4/`（50+ 文件）。已落：思考条+落定态、付费卡、产物五态卡、收据 icon 家族、事件内联不置顶（D1）、六卡接入、介入槽默认「仅这一次」 | ⛔ **A3 阶段分隔线**（`阶段分隔\|stage-line` 0 命中）、⛔ **A6 压缩分隔线带轮数**（`不再记得\|轮已折叠` 0 命中）。B3–B6 四条要跑 `design-lab.html?screen=agent-panel` 逐格比对才判得了 |
| **Agent 过程状态与面板框** | [`docs/design/2026-09-09-agent-process-state-and-panel-frame.md`](../design/2026-09-09-agent-process-state-and-panel-frame.md) | ✅ 已落地。`AgentPanelV4Receipt.tsx:184` 导出 `V4Process`，`AgentPanelV4Panel.tsx:171` 按 `item.kind==='process'` 真渲染；面板外框 = `WorkspacePanelFrame` | **文档抬头「仅设计实验室，未实施到产品」已过期，要改** |
| **分镜表 v6** | [`docs/design/2026-09-05-storyboard-table-v6-design-contract.md`](../design/2026-09-05-storyboard-table-v6-design-contract.md) | ✅ 大面积落地。`creation/storyboard/shotRow/` 就是 v6 形状：`ShotComposerBar` + `ShotParamControls` + `ShotReferenceSlotPopover`（按模型能力出槽 §4.4）+ `StoryboardVariantsDrawer`（§2.9）+ `anchorZone/` + `StoryboardBulkBar` + `shotFrameGeometry` | 合同抬头「尚未接真数据与生成链」也已过期。**真正欠的是 09-12 那一串交互 bug**（TODO `T-DS-05`），不是设计没做 |
| **剪辑面** | [`docs/design/2026-09-05-editing-panel-design-contract.md`](../design/2026-09-05-editing-panel-design-contract.md) + [T1 plan](../plan/2026-09-05-editing-panel-t1.md) | 🟡 T1 落了：`preview/panelLayout.ts`、`editingPanelLayoutSlice.ts`、`PreviewWorkspace.tsx`、`timeline/TimelinePanel.tsx`，布局状态随项目落盘 | **T2 未核**（转场选择器 §2.4 / 右键菜单 §2.5 / 字幕样式），没找到对应文件；属性面板四态未确认。另：09-11 已拍板剪辑要**重写数据模型**，但用户说不着急 |
| **技能库卡片 + 节点效果 chip** | [`docs/design/mockups/2026-09-08-skill-library-cards/`](../design/mockups/2026-09-08-skill-library-cards/) | ✅ 已落地。`skillLibrary/SkillCard.tsx`/`SkillMedia.tsx`/`SkillDetail.tsx`；节点 chip `generationCanvas/nodes/NodeEffectChips.tsx:12`（四件 starter + 按 `appliesTo` 过滤）。数据：仓库根 `skills/` **88 个 SKILL.md，73 个带 `assets/cover.png`** | **15 个技能还没封面**；技能卡左上角黑胶囊角标在浅色封面上看不清（用户 09-12 点名，见 [截图](sources/screenshots/2026-09-12-0047-skill-card-badge.jpg)）；列表式排版空间浪费 |
| **创作面三栏** | [`docs/design/2026-09-10-creation-workspace-columns.md`](../design/2026-09-10-creation-workspace-columns.md) | ✅ 外框已落（`WorkspacePanelFrame.ts` + 三处消费）。设计本身也只批了外框 | 栏内内容不在该单范围；**用户 09-10 说的「三栏各不相同不搭配」需要的是全局左侧栏那一单** |
| **节点参数条 v1** | [`docs/design/2026-09-10-node-composer-bar-v1.md`](../design/2026-09-10-node-composer-bar-v1.md) | ✅ 已落地：`NodeGenerationComposer.tsx` + `InlineParameterBar.tsx` + `NodeParameterControls.tsx`，双份走查 | 用户 09-10 的「节点下面东西太多、只留 icon、运镜挪右上」是**下一档**，样张退回过一次（#784） |
| **付费卡=介入槽 + 全自动档** | [`docs/design/2026-09-10-spend-card-node-params-and-full-auto.md`](../design/2026-09-10-spend-card-node-params-and-full-auto.md) | ✅ 已落地：`agentPanelV4Intervention.ts` + `agentPanelSpendCard.ts` + `AgentPanelV4AutoMode.tsx`，文案「付费生成也会直接跑」 | 无缺件。但**用户实际撞到的是「全自动档还要确认卡 / 工具说有卡宿主没卡」**（TODO `T-AG-04`） |
| **AI 协助接入入口** | [`docs/design/2026-09-11-ai-assisted-onboarding-entry.md`](../design/2026-09-11-ai-assisted-onboarding-entry.md) | ✅ 已落地：`ui/onboarding/AiAssistedOnboardingCard.tsx` + `AssistedIntegrationProgress.tsx` | 入口位置/触发条件逐条未核 |
| **矩形框工具（Group→Frame）** | 09-06 用户点名「用户用得很多」 | ✅ 已落地：`components/useCanvasFrameTool.ts`（F 键拖框）+ `model/canvasFrameBounds.ts` + `GroupFrame.tsx`（空框虚线 / 有内容实线 / 拖动入退组反馈） | **命名双轨**：数据类型仍叫 `NodeGroup`。用户 09-12 报的「编组后点空白框就没了、拉环易丢」未核 |
| **跨设备同步** | [thesis](../design/2026-09-02-cross-device-sync-design-thesis.md) + [最小能量合同](../design/2026-09-04-cross-device-min-energy-contract.md) | 🟡 按「最小能量」口径基本落了：`settings/ProjectLocationSection.tsx` + i18n「换电脑继续 / 同步工具」 | thesis 里更大的同步中心合同自己就砍了。**用户 09-12 报的是显示问题**：项目卡「可在另一台电脑继续」徽标换行挤在卡片下沿（[截图](sources/screenshots/2026-09-12-0045-project-library-badge.jpg)） |
| **借结构（跑量片→我的分镜）** | [`docs/design/2026-09-08-borrow-structure-design.md`](../design/2026-09-08-borrow-structure-design.md) | ⛔ **只有设计**：`borrowStructure\|borrow-structure\|借结构` 全仓 0 命中；文档自己也写「未写一行生产代码」 | 整单没开工 |
| **导演台** | 无独立设计文档（#721 已合） | 🟡 功能在，**没有教学/空状态** | 用户 09-12：「进来不知道 WASD 能移动」「输入『热闹十字街道』输出很差」（[截图](sources/screenshots/2026-09-12-0205-director-stage.jpg)） |

---

## 二、和 09-08 旧账本不一致的三项（以本次实扫为准）

| 面 | 09-08 账本写的 | 今天实扫 |
|---|---|---|
| 拆解表/分镜表节点 | 「**未落地**（src 无 shot_table）」 | **已落地**，123 处引用，两个 owner 都接了 |
| 生成过程反馈渐显 | 「**未落地**（无设计稿）」 | **已落地**，`img-fx@0.5.1` 真装真接 |
| 跨设备同步 | 「设计只」 | **部分落地**（设置页两区 + 文案已在） |

**这三项为什么会错**：09-08 之后合了几波 PR，账本没跟着改——**这正是为什么 TODO 要有唯一真相源，而账本类文档要标日期和基准 SHA**。

## 三、这份表没核到的（明着标）

- Agent v4 偏差清单的 **B3/B4/B5/B6**（两个「几镜」打架、折叠尾、价格行、计划失败卡）：原组件已删，要跑设计实验室逐格比对才有结论。
- **剪辑面 T2** 三项（转场选择器 / 右键菜单 / 字幕样式）没找到对应文件，判不了。
- 分镜 v6 §9 对账项、节点参数条 v1 的几何/收纳规则、AI 协助入口的位置与触发条件：逐条没核。
- `2026-09-07-libtv-remediation-interaction-design.html`：未核。
