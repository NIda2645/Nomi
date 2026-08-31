# 创作链路五修（2026-08-17）

来源：用户实测反馈五条。样张 A/B/C 已拍板（2026-08-17）。
分支：`claude/fervent-noyce-f7fb85`，基线 `main@3d110c20`。

## 用户原话 → 根因 → 处置

| # | 用户原话 | 根因（已实查确认） | 处置 |
|---|---|---|---|
| A | 分镜方案没有整体切换类型和模型的地方，选了图片后要换视频模型十几次 | 拆镜头默认 `shotMode='image'`（`CreationAiPanel.tsx:167`）→ 全镜是图片；类型/模型选择器只在单张镜卡内（`StoryboardShotCard.tsx:115-147`）；唯一批量入口「套用全部」埋在 L3 参数抽屉里（`ShotParamControls.tsx:197`）**且不复制 `shotKind`**（`StoryboardPlanEditor.tsx:230-233`）→ 类型必然逐镜手改 | 加「全部镜头」批量条（L1，归位不是新增）；抽屉按钮降级为只套 `params` |
| B | 智能分组很多东西加载视频失败 / 是不是不需要 | `thumbOf()` 退化到 `result.url`（`autoGroup.ts:47-50`）= `.mp4`，被塞进 `<NomiImage>` = `<img src="x.mp4">` → 必然失败。仓库已有 `AssetVideoCover` 抽首帧但此处没用 | **整个删掉**（用户 2026-08-17 拍板：没人用）|
| C | 分镜卡一直在对话框下面，跟着我的对话跑 | `<StoryboardPlanCard/>` 渲染在 `messages.map()` **外面**、是消息容器最后一个子元素（`CreationAiPanel.tsx:671`）→ 结构上被钉死在列表末尾 | 锚定到产出它的那条 assistant 消息（对齐既有 `message.action` 卡做法）|
| D | 选了素材规划技能，最后依然做了拆分镜 | `skipIntentRouting = activeSkill \|\| mode==='storyboard'`（`CreationAiPanel.tsx:272`）——素材规划走 `onSelect(null)+onModeChange('assets')`（`ActiveSkillChip.tsx:126-127`）→ 守卫不触发 → 含「镜头/画面/场景」即被 `routeCreationIntent` 劫持。**第二漏点**：`StoryboardNudge` 完全不看已选技能/模式（`CreationAiPanel.tsx:545`）| 守卫收口 + Nudge 尊重模式 + 提示词层写死约束（三处同治）|
| E | 系统提示词能看到但局限在一个非常小的框里 | `ActiveSkillChip.tsx:145-152`：284px 宽 / `max-h-16`(64px) / `.slice(0,360)` 截断 / 只读 | 搬进设置 → AI，**可编辑 + 恢复默认**（用户 2026-08-17 拍板）|

## 范围

### A 分镜批量条
- 新增 `src/workbench/creation/storyboard/StoryboardBulkBar.tsx`（防巨壳 R9，不进编辑器）
- `storyboardPlanEdits.ts` 加纯函数：`applyShotKindToAll` / `applyModelToAll` / `applyDurationToAll` / `deriveBulkValue`（不一致 → `'mixed'`）
- `StoryboardPlanEditor.tsx` 挂批量条；`onApplyParamsToAll` 收窄为只复制 `params`
- `ShotParamControls.tsx` 按钮改名「把这一镜的参数套用到全部」
- i18n：`zh-CN` + `en` 同步

### B 删智能分组（P1 加新必删旧）
- 删目录 `src/workbench/assets/autoGroup/`（`autoGroup.ts` / `.test.ts` / `autoGroupService.ts` / `AssetFinderPanel.tsx`）
- `AssetLibraryPanel.tsx` 去 import + `sourceFilter==='smart'` 分支 + 工具条条件
- `assetLibraryUsage.ts` 去 `'smart'`；`assetLibraryUsage.test.ts` 同步
- `i18n/locales/assetLibrary.ts` 删 `smartGroups` + 整个 `finder` 块

### C 分镜卡锚定
- `workbenchAiTypes.ts`：`WorkbenchAiMessage` 加 `storyboardPlan?: true` 标记
- `launchStoryboardPlanning` 给产出方案的那条 assistant 消息打标
- `CreationAiPanel.tsx`：卡片挪进 `messages.map()`，删末尾那份
- **老项目兼容**：hydrate 时若有 plan 但无消息带标 → 给最后一条 assistant 消息补标（一次性迁移，非并行版）

### D 拆分镜劫持
- 守卫收口：给模式加能力声明 `dedicatedJob` + `modeAllowsIntentRouting()`（照抄既有 `chatOnly`/`modeAllowsWriteTools` 范式）。专职模式（assets/storyboard/seedance/review）一律不被路由劫走；自由写作模式（general/story/script）保留路由。**不再硬编码模式名**——新增专职模式自动纳管
- `StoryboardNudge` 接 `allowed`，读同一个判定源（同一根因的第二个出口，只堵一个还会漏）
- 纯函数单测锁死守卫口径

> **实施时改判：不动 `ASSET_MASTER_PROMPT`。** 原计划要在提示词里补「不拆镜头」硬约束。
> 想清楚后判定这是治症状：① 那份 537 行规范是用户 2026-08-12 亲自提供的，属「用户拍板的形态默认不动」；
> ② assets 模式下模型根本拿不到 `propose_storyboard_plan` 工具（只在 `runStoryboardPlanner` 里），
> 用户看到的「依然做了拆分镜」100% 是前端动作卡劫持。守卫是根因层，修在那里就够，
> 加提示词文字属于在根因已修的路径上再糊一层软约束。

### E 系统提示词进设置
- `electron/settings/systemPromptsContract.ts` + `systemPromptsSettings.ts` + `systemPromptsIpc.ts`（照抄 automationPolicy 四件套）
- `registerSettingsIpc.ts` + `src/desktop/settingsBridge.ts` 挂通道
- 新增 `src/workbench/settings/SystemPromptSection.tsx`（模式 chip + textarea + 已自定义徽标 + 恢复默认）
- `creationAiModes.ts`：`getCreationAiMode` 应用用户覆盖，默认值仍是唯一真相源
- `ActiveSkillChip.tsx`：**删**那个 64px 只读小框，换成一行「在设置里查看和编辑 →」

## 不动项（明确不碰）

- 拆镜头规划师本身的产出质量 / prompt 结构（`runStoryboardPlanner`）
- 画布节点的模型选择器（`useDedupedModelSelect` 复用，不改它）
- `AssetVideoCover` / `useFilmstrip`（B 走删除路线，不再需要修它）
- 默认 `shotMode='image'` 这个选择本身——批量条让它一键可改，够了；改默认值是另一个产品决策
- 设置页其余 tab

## 回滚

单分支单 PR，五块各自独立 commit。任何一块出问题可单独 `git revert` 该 commit：
A/C/D 互不依赖；B 是纯删除；E 新增独立文件 + 两处接线。
E 的设置文件若已写盘，回滚后 `getCreationAiMode` 忽略未知覆盖、退回默认，不会崩。

## 验收门

1. 五门全过：`check:filesize` → `check:tokens` → `check:i18n` → `lint:ci` → `typecheck` → `test` → `build`
2. 新增纯函数全部带单测（批量条 mixed 判定、守卫口径、提示词覆盖合并）
3. **R13 真机走查**（截图自己 Read 过才算）：
   - 拆 12 镜 → 批量条一次改成视频 → 12 张镜卡全变（截图对账样张 A）
   - 说一句话 → 分镜卡留在原处不跟随（截图）
   - 选素材规划 → 说「帮我盘一下需要哪些画面」→ 不弹拆分镜卡（截图）
   - 设置 → AI → 改提示词 → 恢复默认（截图对账样张 B）
   - 素材库里「智能分组」tab 已消失（截图）
4. **R16 真实用户任务闭环**：一条真实任务「写故事 → 素材规划 → 拆镜头 → 批量设视频模型 → 落画布」端到端跑通，过程中冒出的体验/UI 问题全修掉才算完成

## 走查结果（2026-08-17 · `tests/ux/creation-flow-fixes.walk.mjs`）

12/12 通过，截图在 `tests/ux/shots/creation-flow-fixes/`。已逐张人眼对账样张 A/B。

**走查自身踩的两个坑（记下来，别再犯）**：
1. D 第一版检查「页面上有没有『拆成镜头』字样」→ 被脚本自己 seed 的用户消息「把这个故事拆成镜头」骗了，误报成产品 bug。改成只数 `[data-action-card="storyboard"]` 这个精确锚点。
2. D 第一版跑在「已有方案」的项目上——那种状态下浮现卡本来就不显示，等于什么都没测。
   → 另起一个无方案项目，**并先跑一条基线断言「通用模式下这张卡确实会出现」**。
   没有基线的「没看到卡」是个空洞的通过，这类假绿比红更危险。
3. E 第一版量了页面上第一个 textarea（量到别的控件，55px），且拿默认选中的「通用」模式验「不截断」——
   而它的提示词本来就只有 48 字。改成量 `[data-settings-field="system-prompt"]`、切到「素材」（14343 字）再验。
