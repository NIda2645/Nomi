# Nomi 侧 MCP 体验重划范围：看片台 + 兜底（不复刻门 UI）

> 2026-08-11 用户两刀砍出来的方案，取代 Phase B 里「Nomi 侧完整门 UI」的隐含假设。
> ① 「不能既有本身的文字描述和操作，又有现在的操作」→ 同一个决定不许做成两层。
> ② 「Claude Code / Codex 本身就能在软件内部做操作，还需要做 Nomi 里这个东西吗」→ **大部分不需要**。

## 底层逻辑（为什么要砍）

CLI 已经能就地做完的事（选方向、批预算、暂停继续、看状态），在对话里一个回车 10 秒完事；用户刚在 CLI 打完字，人就在那边。**在 Nomi 里再造一套等价入口 = 重复建设**，而且有害：两套文案要同步、两处状态要一致、用户不知道该在哪操作（= 用户实测抱怨的「两个地方做操作，很容易误操作」）。

**Nomi 真正不可替代的只有三件**：
1. **看像素** —— 终端渲染不了图。样片/粗剪/成片必须在 Nomi 看。CLI 永远给不了。
2. **深度编辑** —— 改分镜、调提示词、换素材、时间轴（Nomi 本体能力，本 plan 不动）。
3. **兜底与自主发起** —— 用户切走 / CLI 关了 / 会话断了，run 还在跑；以及 `origin=nomi` 时根本没有 CLI 可用。

## 一条总规则

> **门首选发起端（origin）；发起端超时 / 不支持 elicitation / 用户不在 → Nomi 兜底 + 系统通知。**

这套机制 Phase A 已建成（elicitation 300s 超时 + A5 系统通知）。本 plan 只改**呈现层的主次**：Nomi 侧从「主决策面」降级为「看片台 + 兜底面」。

## 目标形态

| 面 | 职责 | 变化 |
|---|---|---|
| **任务中心**（380px 右浮层，制作任务本来就在这列） | 制作任务唯一的家：一行状态（谁驱动/跑到哪/花了多少）+ **产物可看可播** + 指路「Codex 那边等你选方向」+ 暂停/取消 + 兜底决策（收次级） | 从「只有一行标题+状态文字，点了跳走」升级成完整看片台 |
| **助手面板** | 只和 Nomi 聊画布 | **移除 ProductionStatusPanel 挂载**（P1 加新删旧）——两套操作不再相邻 |
| **SpendConfirmDialog** | 兜底决策 + 用户不在生成区时的全屏拦截 + 预算/导出门（需 680px 合同表） | 保留，但不再是 CLI 驱动 run 的主路径 |

`origin=nomi`（用户在 Nomi 内自主发起制作）时，门在 Nomi 里是**主路径**（那时没有 CLI），走同一套弹窗，不另造。

## 工单

### N1 · 任务中心承载制作任务（新家）
- `TaskCenterPanel` 的 production_run 行从「标题+状态文字」升级为**可展开的制作卡**：状态行（身份/阶段/预算/耗时 chip）+ 最新产物预览（图可看、视频可播，点击进 Nomi 对应位置）+ 情境动作（暂停/取消）+ 「制作详情」折叠（台账/阶段/技能）。
- 等待门时显示**指路条**：「Codex 那边等你选方向 · 也可以在这里决定」——次级键才是兜底决策入口（打开现有 SpendConfirmDialog）。
- 组件复用：状态/预览/详情从 `ProductionStatusPanel` / `ProductionDetails` 抽成共享子组件，避免两处实现（P1）。

### N2 · 助手面板卸载制作面板
- `CanvasAssistantPanel` 移除 `ProductionStatusPanel` 挂载与 `useProductionStatus` 依赖（同 commit 删旧，无并行版）。
- 保留深链定位能力：外部深链跳进来仍能定位到节点/产物（走既有 `nomi:production-deep-link`）。

### N3 · 按门类分文案（内容硬伤，已确诊）
- `productionRunView.ts:159` 所有 waiting gate 共用 `approvalRequired` 文案 → 按 gateId/scope 分：方向门（不花钱）/ 样片门（看一眼）/ 预算门（真花钱）/ 导出门。中英齐（R15）。

### N4 · 设计系统违规与细节（已确诊清单）
- `ProductionStatusPanel.tsx:33` `IconLoader2+animate-spin` → `NomiLoadingMark`（§3.9.1 全仓唯一加载动画）。
- 主按钮图标不再用 `IconAlertTriangle`（正向操作挂警告符号）。
- 空预览：无产物不渲染（不再占 220px 空框 + 三重「没有产物」文案）。
- 视频：封面 + 播放键，点击才进播放态；去掉硬编码 `bg-black`（token-only）。
- 预算台账在 380px 面板里改单列 label→value。

### N5 · 走查与测试
- e2e 补任务中心截图点（本轮已加 `00-task-center.png`）+ 断言：助手面板不再出现 `[data-production-status-title]`、任务中心内出现制作卡与产物。
- 单测：门类文案映射矩阵；view 模型 controls/指路态。

## 不动项
Phase A/B 的 CLI 侧全部能力（转述/进度/elicitation/工具/信任档位/B6 widget 卡）—— 那才是主路径，一行不动。
`origin=nomi` 的门走既有弹窗。预算门永不跳过。

## 验收
每工单单测 + `pnpm run gates` 亲见退出码 + 走查截图逐张亲眼 Read + 与获批样张逐项对账。
