# F15 — 锚冻结门死锁：装上操作者 + 等待态去红 + 确认条三缺

日期：2026-08-25 · 分支：`claude/f15-freeze-gate-operator` · 基线：origin/main @ f372d3ab
范围：**只碰 GUI legacy 路径**（画布节点/依赖波次/确认条/走查）。**不碰** `electron/productionRun/*`、`electron/ai/*`、`src/workbench/ai/*`（另两个 agent 在改）。

---

## 0. 破案结论（先证明再修 —— 探针实测，不是脑补）

### 现象
J1 主链：拆镜落画布（4 视觉锚 + 7 镜）→ 选镜头 1 → 生成 → 执行计划确认条 → 按计划生成 → 锚「便利店」真生成成功 → **镜头 1 报错「参考卡『便利店』还没冻结」→ 从此无路可走**。审查者注入 `frozen` 后重试仍报同样错误；且注入后连确认条都不再出现。

### 探针（`buildDependencyWaves` + `collectUngeneratedReferenceAncestors` + `isAnchorFrozen` 实跑，4 断言全绿）

| 情形 | 实测 | 含义 |
|---|---|---|
| A. 锚**未**生成，点镜头 1 生成 | `collectUngeneratedReferenceAncestors('镜头1')` → `['便利店']`；`buildDependencyWaves(['便利店','镜头1'])` → 镜头 1 `blocked: unfrozen-anchor` | 确认条**这时**开（因为有未出图的上游），镜头 1 被拦 |
| B. 锚**已**生成、未冻结，点镜头 1 生成 | `collectUngeneratedReferenceAncestors('镜头1')` → `[]` | **确认条不再开**——批量分支被跳过，走单节点路径 |
| C. 注入 `frozen:{at,by}` | `isAnchorFrozen` → `true`；`buildDependencyWaves(['镜头1'])` → `blocked: []` | 注入本身**有效**，判据认账；批量路径确实放行 |
| D. 注入若丢 `referenceSheet`（半个 meta spread） | `isVisualAnchorNode` → `false` | 门对它**失明**（既不拦也不冻） |

### 根因（两层，缺一读不懂这个死锁）

1. **门造了，门把手从来没装。** 全仓 grep 证实：`meta.frozen` **零处生产写入**——`dependencyWaves.ts` / `productionRunDriverOps.ts` / `core.ts:704` 三处都**读** `isAnchorFrozen` 来拦，但没有任何 UI 写 `{ at, by:'user' }`。`anchorBible.ts:28-29` 白纸黑字：「目前只有用户视觉确认这一种（不吃自动放行）」——那个「用户视觉确认」的控件不存在。

2. **确认条不是被「冻结」触发的，是被「上游有没有出图」触发的**（谜底核心）。单节点生成钮 `NodeGenerationComposer.handleGenerate` 只在 `collectUngeneratedReferenceAncestors(node).length > 0` 时才开确认条（`buildDependencyWaves` 只在这条批量路径跑）。而 `collectUngeneratedReferenceAncestors` 把「已出图的上游」当**已满足**排除掉（`referenceAncestors.ts:37`）。所以：
   - 锚没出图时 → 上游未满足 → 开确认条 → `buildDependencyWaves` 把镜头 1 标 `unfrozen-anchor` → `runGenerationNodesByPlan:415` `failNode(镜头1, "参考卡「便利店」还没冻结")` **把这句话写进镜头 1 的 error 状态**（这就是审查者看到的、卡片上那条红字）。
   - 锚**一旦出图**（无论冻没冻）→ 上游被判满足 → 确认条**永远不再开** → 走单节点路径 `confirmAndRunNode`（**它根本不查冻结门**）。

   于是「注入 frozen 后重试仍报同样错误」= 单节点路径确实跑了、但**镜头 1 卡片上那条 `unfrozen-anchor` 旧红字是 sticky 的**（状态没被新一轮生成覆盖前一直在，loopback/无真 provider 时更明显）；「注入后确认条不再出现」= 因为注入 = 锚有果 = 上游满足 = 批量分支跳过，**与冻结无关**。

**一句话**：用户被困，是因为 **①没有冻结的 UI（无操作者）+ ②唯一会触发冻结门的批量确认条，只在锚没出图时才开——锚一出图，门既没法过、错误红字又擦不掉**。

---

## 1. 家底（file:line，实读过）

### 冻结判据（单一真相源 + 镜像，不动）
- `electron/capabilityCore/anchorBible.ts`：权威。`ANCHOR_META_KEYS.frozen='frozen'`；`AnchorFrozenMark={at:number;by:'user'}`；`isVisualAnchorNode`（需 `referenceSheet===true` 且 kind∈character/scene/prop）；`isAnchorFrozen`（`frozen.at>0`）。
- `src/workbench/generationCanvas/model/anchorBibleKeys.ts`：渲染层纯镜像，`anchorBible.equivalence.test.ts` 钉死等价。

### 门（读判据来拦，三处）
- `src/workbench/generationCanvas/runner/dependencyWaves.ts:67-73`（GUI 批量）—— reason `unfrozen-anchor`，detail「参考卡「X」还没冻结」。**本次改这里的 detail 文案 + 一个新的 waiting 语义（见 §3.3）。**
- `electron/productionRun/productionRunDriverOps.ts:427-440`（headless run 冻结门）—— **不碰**（PR #156 语义 checkpoint 落这）。
- `electron/capabilityCore/core.ts:704-708`（MCP 单镜提醒，只提醒不拦）—— **不碰**（另 agent 域）。

### 三个「相近概念」的真实语义（裁定依据）
- **定妆 / makeup**（`NodeImageEditToolbar.tsx:35,53-60` + `fixation/buildFixationNode.ts:68`）：基于当前图**建一个新节点**、预填身份板 prompt（不自动生成）。zh 标签「定妆」，**en 标签已经是 "Create reference"**（`generationCommon.ts:1654`）——zh 是唯一没对齐的。
- **锁定节点 / lock**（`NodeLockBadge.tsx` + `agent/gate.ts:92-114`）：软开关，AI 不能改这个节点（入边/删除/重生成 deny），**但仍可作参考**（出边放行）。是「防 AI 改」的机制，跟冻结不同轴。
- **冻结 / frozen**（本次装把手）：用户视觉确认「这张参考卡的形象定了」→ 写 `meta.frozen` → 下游镜头才放行。一致性地基。

### 确认条 UI
- `src/workbench/generationCanvas/components/BatchPlanOverlay.tsx`：确认条本体。⚠ 徽标 `title=blocked.detail`；顶条一句话 `summary` + `firstWave` + `blocked`。**F10/F11/F12 改这里。**
- `src/workbench/generationCanvas/components/batchPlanPreview.ts:55-68` `describeBlockedNotice`：blocked 人话汇总。
- 价格数据源：模型 catalog 的 `priceLabel`（`src/config/modelCatalogMeta.ts`，renderer 可见的字符串，如「¥0.3/张」）。解不出 → 「价格未知」。

### 锚卡工具条（冻结把手的家）
- `src/workbench/generationCanvas/nodes/BaseGenerationNode.tsx:406-427`：图像结果卡（含锚卡）选中时挂 `NodeImageEditToolbar`。**巨壳（731 行，白名单），不塞实现**——新按钮走既有 `ToolbarButton` 原子 + 一个抽出的纯 action 模块。
- `src/workbench/generationCanvas/nodes/NodeFloatingToolbar.tsx`：`ToolbarButton`/`FloatingToolbarShell` 共享原子（token 合规）。

---

## 2. 裁定：冻结操作者收进哪个家（P1 一功能一个家）

**候选**：(a) 锚卡上新增显式「确认形象」动作；(b) 与「锁定节点」合一；(c) 批量路径自动弹「形象确认」。

**裁定 = (a)，且把用户可见词汇统一到「定妆」。理由：**

- **不选 (b)**：锁定是「防 AI 改」（anti-overwrite，出边放行、入边 deny），冻结是「形象定稿供下游引用」（一致性基准）。两者语义正交——一个防 AI、一个给下游放行信号。合一会让「我只是不想 AI 动它」和「我确认形象定了」互相绑架（锁了就被迫冻、想冻必须锁）。查 `gate.ts` 消费方后确认不兼容。
- **不选 (c) 作为主操作者**：自动弹依赖批量确认条——但确认条只在「锚没出图」时开（见破案 §0.2），锚出图后压根不开，正是死锁本身。且 (c) 已由 PR #156 在 headless `productionRun` 侧以语义 checkpoint 落地（**不在本次 GUI 范围**）。GUI legacy 路径需要一个**与「有没有出图」解耦**的、锚卡上的常驻操作者。
- **选 (a)**：锚生成成功后，**在锚卡工具条最左**给一个 accent 主动作「定妆」（= 确认形象/写 `meta.frozen`）。它是 L2 情境控件（选中锚卡才出），不占常驻预算，就近贴在它作用的那张卡上（§1.5 手法优先级：就近，代价 0）。已冻结 → 同位显示「已定妆 ✓」非 accent 态，点击可撤销（改图要重新确认，符合 `AnchorFrozenMark` 注释「若改了 static 自动解冻」的方向）。

### 词汇统一（用户可见收敛为一个词，内部键名不动）

| 事 | 旧文案（漂移） | 新文案（统一） | 内部键 |
|---|---|---|---|
| 确认锚形象（写 `meta.frozen`）| 「冻结」（无控件）| **定妆**（zh）/ **Confirm look**（en）| `frozen` 不动 |
| 从图建参考卡（`applyFixationMakeup`）| 「定妆」（zh）/ Create reference（en）| **建参考卡**（zh）/ Create reference（en，不变）| — |
| 冻结门拦截 detail | 「参考卡「X」还没冻结」 | **「参考卡「X」还没定妆——在卡上点『定妆』」** | — |
| 批量 notice | 「…还没冻结——先在卡上点「冻结」」 | **「…还没定妆——去卡上点『定妆』」** | — |
| 锁定节点 | 「锁定节点」 | 「锁定节点」**不变**（不同轴） | `locked` |

**为什么围绕「定妆」而不是「冻结」**（D6 讲清）：用户摩擦是「我点了个叫『定妆』的按钮以为定了，结果镜头说我没『冻结』」——同一件事两个名字，是这个死锁的**认知放大器**。「定妆」是产品里已经最普及、最具象的隐喻（规划器叫「定妆规划师」、卡叫「定妆卡/场景卡」、en 版 makeup 早已是 Create reference、`core.ts:708` 已经说「还没冻结**定妆**」）。「冻结」是抽象术语、「锁定」是另一个机制。收敛到「定妆」= 顺着用户已有的心智，不新造词。碰撞（旧 makeup 也叫「定妆」）用「建参考卡」化解——那本就是它 en 版的名字。

---

## 3. 改动清单（按根因层）

### 3.1 装真把手（新纯 action + 锚卡工具条按钮）
- 新 `src/workbench/generationCanvas/fixation/freezeAnchor.ts`（纯 action，不塞巨壳）：`freezeAnchor(nodeId)` 写 `meta.frozen={at:Date.now(),by:'user'}`；`unfreezeAnchor(nodeId)` 删除 `frozen`；判据复用 `anchorBibleKeys`。经 `store.updateNode(id,{meta:{...oldMeta, frozen}})`——**全量 spread 旧 meta，别丢 `referenceSheet`**（破案 §0-D 的坑）。
- `NodeImageEditToolbar.tsx`：新增可选 `onFreeze`/`frozen`/`isAnchor` props；`isAnchor` 时最左渲染「定妆」accent 钮（冻结）/「已定妆 ✓」态，**并隐藏原 makeup（建参考卡）钮**（锚卡上再建参考卡冗余）。非锚卡：makeup 钮改标签「建参考卡」。
- `BaseGenerationNode.tsx`：算 `isAnchor=isVisualAnchorNode(node)`，把 `onFreeze/frozen/isAnchor` 传下去（一行 wiring，不塞逻辑）。

### 3.2 词汇统一（i18n zh+en）
- `imageToolbar.makeup`：zh「定妆」→「建参考卡」（en 不变）。
- 新 `imageToolbar.freeze` / `freezeHint` / `frozen` / `frozenHint`（定妆/已定妆）。
- `dependencyWaves.ts:71` detail、`batchPlan.unfrozenAnchors`：文案改「定妆」。

### 3.3 等待态不许穿红衣（runner 把 blocked 分「等待」与「失败」）
- **根因**：`runGenerationNodesByPlan:415` 对**所有** blocked 一律 `failNode`（status='error'，红）。但 `unfrozen-anchor`/`missing-upstream` 是「**在等一个还没做的前置**」，不是「失败」——该走 S5 三态占位家族的**等待**语义，红只留给真失败（provider 报错）。
- 改：`unfrozen-anchor` 与 `missing-upstream`（「等上游/等定妆」类）→ 设节点为**等待态**（非 error status），detail 作为 hint；`cycle` 与「上游本批真失败」仍 error。BatchPlanOverlay 的 ⚠ 徽标按 reason 分色（等待=中性/accent-soft，失败=danger）。

### 3.4 确认条三缺（F10/F11/F12，改 BatchPlanOverlay）
- **F11 价格**：顶条加「本波预估 ¥X」——遍历 `plan.waves.flat()` 的节点、查其模型 `priceLabel` 求和；**任一解不出 → 标「价格未知」**（未知 ≠ ¥0，分开显示）。
- **F10/F12 被拦可点下一步**：⚠ 不再是裸符号。blocked 项带一句人话原因（已有 detail）+ **可点动作**：`unfrozen-anchor` → 「镜头 X 在等『Y』的形象确认——去定妆」，点击选中并聚焦那张锚卡（`selectNode` + 居中）。顶条 blocked 计数同样可点展开。

### 3.5 P2 通用性（走查断言模式 + 全仓扫描）
- 断言模式：**每个 blocked/gate 状态必须携带可达的下一步动作**。冻结门断言进 `tests/ux/`（`_assert.mjs` proveProbe/expectAbsent 阳性对照）。
- 全仓 gate 扫描见 §4。

### 3.6 死锁旅程走查
- `tests/ux/f15-freeze-gate.walk.mjs`：隔离实例（设 `NOMI_CAPABILITY_DIR` 防串库）→ 建项目 → 画布种 scene 锚「便利店」（`referenceSheet`+模拟出图 result）+ 镜头引用边 → **用真实 UI 点锚卡「定妆」钮** → 断言 `buildDependencyWaves([镜头])` 不再 `unfrozen-anchor`（门放行）→ loopback 生成镜头走通。零额度。

---

## 4. P2 全仓 gate/blocked-reason 扫描（file:line + 有无操作者）

| # | reason/gate | 产出点 | 操作者（用户怎么解）| 可达？|
|---|---|---|---|---|
| 1 | `unfrozen-anchor` | `dependencyWaves.ts:71`（GUI）+ `productionRunDriverOps.ts:436`（headless）+ `core.ts:704`（单镜提醒）| **定妆**（写 frozen）| ❌ **无操作者（本 bug）→ 本次装上（GUI 侧）** |
| 2 | `missing-upstream` | `dependencyWaves.ts:85,114` | 生成上游 | ✅ 上游卡生成钮 |
| 3 | `cycle` | `dependencyWaves.ts:122` | 删循环边 | ⚠ 无直接指针（自明、罕见，本次不新增指针，进 backlog 观察）|
| 4 | freeze gate `waiting` | `productionRunDriverOps.ts:104,436` | 定妆（同 #1）| ✅ headless 侧 PR #156 checkpoint（**非本次范围**）|
| 5 | sample gate `waiting` | `productionRunDriverOps.ts:150` | 审样片 | ✅ gate 卡 |
| 6 | direction gate `waiting` | `productionRunDriverOps.ts:262` | 选方向 | ✅ gate 卡 |
| 7 | agent lock `deny` | `gate.ts:92-114` | 解锁（reason 点名解锁路径）| ✅ reason 文案 + 锁徽标 |

**结论**：只有 #1 缺操作者（本周第三个「结构门没操作者」，前两个 S6 版本条 / P4 链无生产入口已修）。#3 cycle 无直接指针但自明+罕见，记 backlog。

---

## 5. S7 收敛注记

本次只装 **GUI legacy 路径**的冻结操作者（锚卡「定妆」钮 + 确认条）。headless `productionRun` 侧的冻结门语义 checkpoint 已由 PR #156 在 `electron/productionRun/*` 落地。**S7 收敛时**：把 GUI「定妆」写入的 `meta.frozen` 与 headless checkpoint 的过目确认合并成一条语义链——两侧读同一份 `anchorBible` 判据（已等价），只需让「用户在 GUI 点定妆」与「run 冻结门 waiting→放行」互通信号（渲染层 `production.check-frozen` 桥已在读 `meta.frozen`，`capabilityApplyHandler.ts:550`，天然贯通）。

## 6. 不动项 / 回滚
- 不动：`meta.frozen` 键名、`anchorBible.ts` 判据、`electron/productionRun/*`、`electron/ai/*`、`src/workbench/ai/*`、锁定机制。
- 回滚：本分支独立，PR 未 merge 前 `git worktree remove` 即净。
- 验收门：check:filesize/tokens/i18n/heavy-path/controls/walkthroughs/lint:ci/typecheck/test/build 全过 + 死锁走查绿 + 光暗截图。
