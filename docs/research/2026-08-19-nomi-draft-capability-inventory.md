# Nomi 现状盘点：从「对话 → 高质量视频初稿」看今天有什么

> 盘点日期：2026-08-19 ｜ 盘点范围：keen-mirzakhani-d26c73 worktree（只读）
> 目标背景：让用户「和 AI 对话（经 MCP）生成质量足够高的视频初稿」。这份文件只描述**现状**，供三份外部调研对照算 gap。
> 证据一律 file:line。「产品路径」= 用户真能走到；「仅评测」= 只在 `evals/` 跑得到；「已建未接」= 代码在但主链路没调用。

---

## 1. 能力清单表（能力 × 现状 × 在哪 × 证据）

| 能力 | 现状 | 产品路径 / 仅评测 / 已建未接 | 证据 file:line |
|---|---|---|---|
| 导演/编剧技能库（方法论正文） | 14 个 craft 技能（10 director- + 后述 writer-），每个是完整方法论 Markdown（景别表/运镜情绪表/一致性五维/结构工具…）；`skill.json` manifest 已第一次被解析出来 | 产品路径（经 MCP `resources/`+`prompts/` 渐进披露）+ 内部编排读正文 | `electron/skills/skillStore.ts:145-163`（craft 前缀过滤 + 列表）；正文如 `skills/director-cinematography/SKILL.md:1-182` |
| 技能加载/查找单一真相源 | 扫 builtin+user 两根、去重、精确→前缀→归一模糊匹配 | 产品路径 | `electron/skills/skillStore.ts:74-134` |
| brand.promo playbook（文案→宣传片四阶段） | storyboard→build→generate→assemble 四阶段状态机，每阶段暂停审阅 | 产品路径（MCP `nomi_start_playbook`） | `skills/brand-promo/SKILL.md:12-20`；驱动 `electron/productionRun/productionRunDriverOps.ts:160-348` |
| 分镜方案 IR（StoryboardPlan 结构化对象） | 字段级 schema（anchors[]+shots[]），zod 校验 + 编译期漂移守卫 | 产品路径 | `src/workbench/generationCanvas/agent/storyboardPlan.ts:72-153` |
| 方案→画布转换器（落节点+参考边+波次） | 纯函数：视觉锚→定妆/场景卡节点、文本锚拼 prompt、镜头→image/video 节点、锚→参考边 | 产品路径 | `src/workbench/generationCanvas/agent/storyboardPlan.ts:311-403` |
| 分镜规划师（剧本→方案，LLM） | 创作区就地跑，规划阶段只允许 `propose_storyboard_plan`/读画布，写画布工具一律 deny（免费铁律） | 产品路径 | `src/workbench/generationCanvas/agent/runStoryboardPlanner.ts:16-67`；消息构造 `storyboardLauncher.ts:50-82` |
| 方向候选生成（2-3 个方向让用户选） | driver 调 `production.plan-directions` 让 renderer LLM 拟候选；**但 renderer 端未实现该 op** → 真机降级为 gate 的 title/summary 兜底 | 已建未接（driver 有，renderer handler 缺） | driver 调用 `productionRunDriverOps.ts:130-158`；renderer switch 缺此 case `src/workbench/capability/capabilityApplyHandler.ts:127-176`（只有 fixture `productionRunE2eFixture.ts:74` 应答） |
| 镜头→生成任务（provider 提交） | driver 逐 job：授权→提交意图→submitting→轮询→下载→落 artifact；带 shot 门/样片门/预算门 | 产品路径 | `productionRunDriverOps.ts:219-323`；实际生成 `capabilityApplyHandler.ts:149-159` |
| 提示词优化（NodePromptOptimizer） | 节点级「AI 优化」按钮：说想法→文本大脑流式改写→diff 高亮→确认才应用；**无结构化校验/rubric**，纯自由文本改写 | 产品路径 | `src/workbench/generationCanvas/nodes/NodePromptOptimizer.tsx:19-97` |
| 跨镜一致性（参考边解析） | 参考边按 mode 分流：character_ref/style_ref/composition_ref/first_frame/last_frame/reference，喂各模型参考槽；headless 兜底 `referencesFromEdges` | 产品路径 | 渲染层 `generationReferenceResolver.ts:111-241`；主进程兜底 `electron/capabilityCore/core.ts:69-92` |
| 定妆/定景卡 prompt 构造 | 「版面/网格」式：先锁 identity DNA 再列多视图+多变体，中性背景平光 | 产品路径 | `storyboardPlan.ts:247-277`（buildAnchorSheetPrompt） |
| 定妆规划师（fixation planner，剧本→角色/场景卡） | 从剧本识别主角+关键场景，建卡注入身份板/场景板 prompt | 产品路径（创作区「💄 定妆」chip） | `src/workbench/generationCanvas/agent/fixationLauncher.ts:22-39`；skill `skills/workbench-fixation-planner/SKILL.md` |
| 审片：镜级画面校验（shotVerify，产品内 VLM 判质量） | 3 轴 rubric（identity/composition/continuity，1-5 档）→ 首帧图喂多模态模型判决 → 低于 3 档进对账卡（ReconcileDeviationCard）→ 可闭环回灌重生成 | **产品路径，但只挂在手动画布批量生成后**（MCP/production run 路径不触发） | 纯函数 `shotVerify.ts:25-190`；接线 `shotVerifyJudge.ts:20-55`；**触发点仅** `batchPlanPreview.ts:170-178`；MCP 路径无引用（见 §2 第五段） |
| 审片：拆镜头质量四维（evals judge） | 4 维 analytic rubric（忠实/可生成/连续/一致，1-5 档）LLM-judge；**未校准前判决不计入 pass** | 仅评测 | `evals/lib/judge.mjs:99-195`（rubric+judgeOne） |
| VBench 式镜头质量 rubric | 视频质量客观维度评分脚手架 | 仅评测 | `evals/lib/vbenchRubric.mjs`、`evals/verify-shot-smoke.mjs` |
| 真实用户旅程 E2E（J1-J6） | promo/story-styling/first-success/reference/edit-export/camera-move 六条 journey | 仅评测 | `evals/journeys/j1-promo.mjs` … `j6-camera-move.mjs`；契约 `journeyContracts.test.ts` |
| 剧本的家（创作文档） | Tiptap JSON 文档（`workbenchDocument.contentJson`），随项目持久化 | 产品路径 | 类型 `src/workbench/workbenchTypes.ts:1-4`；store `workbenchStore.ts:107,318,356`；持久化 `project/projectRecordSchema.ts:48` |
| 排时间轴 + 导出 MP4 | 按 shotIndex 排片→timeline artifact→导出门→MP4 | 产品路径 | `productionRunDriverOps.ts:329-337,350-361`；`capabilityApplyHandler.ts:160-176` |

---

## 2. 五段现状（剧本→分镜→镜头prompt→生成→审片）

**① 剧本（有什么/缺什么）**
有：创作区一个富文本编辑器（Tiptap JSON），加一整套「编剧」方法论技能库（结构/对白/改编/孵化/风格…共 12 个 writer- 技能），创作 AI 助手可按技能写作/改写。缺：剧本本身**只是一坨自由文本文档**，没有场/幕/角色表/beat 的结构化数据模型——它不是「结构化剧本」，只是「一段会被喂给规划师的正文」（`CreationAiPanel.tsx:167` 把整篇 `documentText` 或选区当 `storyText` 递给规划师）。编剧技能是「参考方法论」，不产出结构化产物。

**② 分镜（有什么/缺什么）**
最厚的一段。有：`StoryboardPlan` 是真正的结构化 IR（`storyboardPlan.ts:72-153`）——`anchors[]`（character/scene/prop/style，带 carrier=visual/text、scope、variants）+ `shots[]`（shotKind、durationSec、anchorIds、prompt、modelKey/modeId/params、keyframe）。规划师第一手产出这个对象（不是自由文本），创作区渲染成可改字段卡（改字段=改对象，无「文字→结构」解析），用户确认才落画布。schema 有 zod 运行时校验 + 编译期漂移守卫。缺：分镜方案里**没有「机位/景别/运镜」等镜头语言的结构化字段**——这些全塞在 `shot.prompt` 自由文本里，规划师靠 SKILL.md 方法论自觉写好，没有字段级约束或校验。

**③ 镜头 prompt（有什么/缺什么）**
有：两条写 prompt 的路。(a) 规划师按 `director-*` 方法论直接把运镜/光线/节奏写进 `shot.prompt`（`storyboardLauncher.ts:28-48` 按 image/video/image-video 模式下硬指令）；文本锚描述会自动拼接（`storyboardPlan.ts:280-288`）。(b) 落画布后每个节点有 `NodePromptOptimizer`（`NodePromptOptimizer.tsx`）——说一句想法、文本大脑流式改写、diff 确认。缺：**prompt 优化完全无结构化校验**——它就是「把原 prompt + 你的想法喂给同一个文本大脑，让它重写一段」（`NodePromptOptimizer.tsx:19-33`），没有污染词检查、没有运镜翻译表强制、没有 rubric 打分，改得好不好全看底座模型。方法论（`director-shot-translation` 的污染词铁律等）只在规划师的 SKILL.md 里，优化按钮不读它。

**④ 生成（有什么/缺什么）**
有：完整的 provider 提交状态机 + 三道花钱门（shot 门/样片门/预算门，`productionRunDriverOps.ts:237-303`），一致性靠参考边落地（定妆卡→镜头连 character_ref/style_ref/reference，`generationReferenceResolver.ts:130-182`）。跨镜一致性机制 = **共享定妆卡/场景卡参考图**（同一批镜头引用同一组锚 → 视觉一致），**刻意不连 shot→shot 链**（`storyboardPlan.ts:397-399`，因为视频→视频首帧接力抽帧未实现）。缺：一致性**断在「锚必须先生成出参考图」**——如果定妆卡没生成或生成得不像，下游所有引用它的镜头就各长各的；且道具锚无专用节点种类、退化成通用 image（`storyboardPlan.ts:228-232`）。没有跨镜身份的语义级校验（只有下游 shotVerify 事后判，见⑤）。

**⑤ 审片（有什么/缺什么）**
有：**两套独立的 LLM-judge**。(a) 产品内 `shotVerify`——生成完成后对每个镜头首帧图跑 3 轴 rubric（身份/构图/连贯，`shotVerify.ts:25-45`），低于 3 档进对账卡、可一键回灌重生成，是 MUSE「plan-execute-verify-revise」闭环的 verify 原语。(b) 评测侧 `evals/lib/judge.mjs` 4 维拆镜头质量 judge（未校准不计 pass）。**关键缺口：shotVerify 只挂在手动画布批量生成路径**（`batchPlanPreview.ts:170-178`），**MCP/production run 路径（`electron/productionRun/`）完全不触发它**——即「对话生成初稿」这条核心链路上，生成完之后没有任何自动判质量。审片能力已建，但没接到目标链路上。

---

## 3. 数据模型现状：剧本 / 分镜 / 镜头今天分别以什么形态存在，互相打通吗

| 环节 | 存储形态 | 存在哪 | 证据 |
|---|---|---|---|
| 剧本 | Tiptap 富文本 JSON（`contentJson: unknown`），自由文本、无结构 | `workbenchDocument`（Zustand store + 随项目持久化到 project record） | `workbenchTypes.ts:1-4`；`workbenchStore.ts:107,318`；`projectRecordSchema.ts:48,111` |
| 分镜 | `StoryboardPlan` 结构化对象（anchors[]+shots[]），字段级、zod 校验 | `storyboardPlan` + `storyboardPlanCommitted`（store，随项目持久化）；driver 侧另落盘 `.nomi/runs/<id>/storyboard-v<n>.json` | store `workbenchStore.ts:118-120,390`；持久化 `projectRecordSchema.ts:60-62`；driver 落盘 `productionRunDriverOps.ts:174-177` |
| 镜头 | 画布节点（image/video kind）+ 参考边；prompt 是节点上的自由文本字段 | `generationCanvasStore` 的 nodes/edges（随项目持久化） | 转换 `storyboardPlan.ts:311-403`；落画布 `StoryboardPlanEditor.tsx:88-95` |

**打通情况：单向、半打通。**
- **剧本 → 分镜：单向、文本级（非结构）。** 规划师把整篇剧本正文当输入产出方案（`CreationAiPanel.tsx:167-172`），但**剧本文档与分镜方案之间无字段级绑定**——改了剧本不会自动更新方案，反之亦然；它们是创作区的两个 tab（`CreationWorkspace.tsx:54-93`「原稿 / 分镜」切换），共享一个创作阶段但各存各的。
- **分镜 → 画布：单向、确认时一次性转换。** 用户在方案编辑器点确认 → `storyboardPlanToCreateNodesArgs` 转成 create_canvas_nodes → 落画布（`StoryboardPlanEditor.tsx:88-95,123`）。落完方案转「已落画布」状态**保留可回看**，但**画布节点改了不会回写方案对象**（无反向同步）。
- **production run ↔ 画布：有 binding 回执。** 落画布后把节点 id 绑回 production run 的 storyboard artifact（`plan.attach`，`StoryboardPlanEditor.tsx:96-120`），这是唯一一处跨层双向登记。

一句话：**分镜是唯一「结构化」的中枢；剧本和镜头 prompt 都退化成自由文本，且三者之间只有「确认时一次性单向转换」，没有活的双向数据流。**

---

## 4. 给蓝图设计者的 10 条要点

1. **分镜 IR 已是坚实地基**——`StoryboardPlan`（anchors+shots，zod 校验+漂移守卫）是全链路唯一结构化中枢，蓝图应围绕它扩展而非另造（`storyboardPlan.ts:72-153`）。
2. **剧本没有结构化模型**——今天只是 Tiptap 自由文本，场/幕/角色表/beat 全无；「剧本→分镜」是把整篇正文喂 LLM，不是结构映射（`workbenchTypes.ts:1-4`、`CreationAiPanel.tsx:167`）。
3. **镜头语言（机位/景别/运镜）无字段**——全塞在 `shot.prompt` 自由文本里，靠规划师读 SKILL.md 自觉，没有字段约束/校验（`storyboardPlan.ts:39-70`）。
4. **方向候选生成是「已建未接」**——driver 会调 `production.plan-directions`，但 renderer 端没实现该 handler，真机降级为 title/summary 兜底（`productionRunDriverOps.ts:130-158` vs `capabilityApplyHandler.ts:127-176` 缺 case）。
5. **提示词优化无结构化校验**——纯自由文本改写，不读运镜翻译表/污染词铁律，无 rubric（`NodePromptOptimizer.tsx:19-33`）。
6. **跨镜一致性 = 共享参考图，刻意不连 shot 链**——靠同批镜头引用同一组定妆/场景卡；视频→视频首帧接力抽帧**尚未实现**（`storyboardPlan.ts:397-399`）。
7. **一致性断点在「锚要先出图且要像」**——定妆卡没生成/不像 → 下游全崩；道具锚无专用节点、退化成通用 image（`storyboardPlan.ts:228-232`）。
8. **审片能力已有且不错，但没接到核心链路**——`shotVerify`（3 轴 VLM 判质量+回灌闭环）只挂手动画布批量路径，**MCP/production run 生成后不判质量**（`batchPlanPreview.ts:170-178`，`electron/productionRun/` 零引用）。这是「对话生成初稿」最直接可补的一块。
9. **两套 judge rubric 口径已对齐（1→0/3→0.5/5→1 归一）**——产品 shotVerify 3 轴与评测 judge 4 维可互为参照，蓝图统一质量标尺时有现成基线（`shotVerify.ts:80-83` ⟺ `evals/lib/judge.mjs:126-133`）。
10. **数据流是单向一次性转换，无双向同步**——剧本↔分镜↔画布改了都不互相回写（`CreationWorkspace.tsx:54-93`、`StoryboardPlanEditor.tsx:88-123`）；蓝图若要「边改边同步」需要新建反向通道。

---

## 附：14 个 craft 技能一句话（服务「剧本→分镜→镜头prompt」链路的标 ★）

来源目录 `skills/`，经 `skillStore.ts` 以 `director-`/`writer-` 前缀暴露为 craft 库。

**导演（director-，服务分镜→镜头 prompt）**
- ★ `director.cinematography`——镜头语言与摄影技法方法论（景别体系/构图/运镜情绪/打光/景深→怎么写进 prompt）。
- ★ `director.shot-translation`——把镜头意图翻译成 prompt 的手册（运镜翻译表/焦点/复合镜头/污染词替换铁律）。
- ★ `director.consistency`——治「换脸/换形/换景」三顽疾（五维一致性检查/参考图锚定/场内状态表/段间承接）。
- ★ `director.transitions`——创意转场方法论（遮挡/甩镜/匹配剪辑把相邻两条缝合，兼当叙事工具）。
- ★ `director.staging`——多角色调度（3+ 人同框站位/视线网络/前后景分层）。
- ★ `director.action`——非对抗动作场景编排（跑酷/追逐/特技，物理化描述进 prompt）。
- ★ `director.performance`——文戏表演指导（微表情/视线/沉默，把情绪物理化成可拍身体信号）。
- ★ `director.art-design`——服化道，设计人物设定图/场景环境图的生图 prompt（风格前缀块+identity DNA+avoid）。
- `director.guzhuang`——中国古装形制知识（服饰/建筑/礼仪/穿帮自检）。
- `director.keyframe-review`——参考图 Go/No-Go 审图清单（判设定图合不合格）。
- `director.sound`——声音设计（⚠️不写进 shot prompt，供时间轴后期配乐）。
- `director.style-otomo-wright`——导演风格融合招式（大友启史×赖特，按情节类型配运镜+剪辑节奏）。

**编剧（writer-，服务剧本）**——`writer.screenwriter`/`writer.structure`(Truby)/`writer.dialogue`(Mamet)/`writer.adaptation`/`writer.incubation`/`writer.novel-digester`/`writer.review`/`writer.improv`/`writer.behavior-psychology`/`writer.songfangjin`/`writer.style-schrader` 共 11 个，覆盖结构/对白/改编/孵化/审查/风格，均为「参考方法论」性质，产出自由文本剧本，不产结构化产物。

> 注：`skillStore.ts:148` 的 `CRAFT_SKILL_PREFIXES` 只含 `director-`/`writer-`；`workbench.*`（storyboard/fixation/generation/creation planner）与 `brand.promo`、`creation-edit`、`skill-author` 是**内部编排技能**，不经 craft 库外暴露。

---

## 补遗（2026-08-19 · 用户当场抓出的盘点遗漏）

**全资产大师 V3.0**（`src/workbench/creation/assetMasterPrompt.ts`，525 行，用户 2026-08-12 提供并接入，commit c9ed0b7e）：创作助手「素材规划」模式的领域规范——场景七层递进模板、角色概念表布局、道具小资产卡、题材万能、默认真人写实、纯中文输出。**产品路径**（选中素材规划模式即生效，约 27KB 随该模式发送）。本盘点初版只记了 `buildAnchorSheetPrompt`（定妆卡）而漏了它。对蓝图的意义：它就是「角色圣经」的内容生成器（幕 1-2），其道具卡正好补第 7 条「道具锚无专用节点种类」的缺口。
