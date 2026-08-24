# workbench-* 语义 token 提升到 :root 单一真源

日期：2026-08-24 ｜ 分支：claude/exciting-davinci-fb7080 ｜ 触发：P4 设计评审实证（库页确认卡勾勾退化继承灰）

## 根因（P2：不是「勾勾颜色错」，是「token 解析依赖挂载点」这一类病）

`--workbench-*` 语义 token 只定义在 `.workbench-shell` 作用域；CSS 自定义属性沿 **DOM 树**继承，
所以任何「挂在 app 根 / 库页分支 / portal 到 body」的组件都够不到它们，`var()` 静默失效退回继承色。
本次实证入口：SpendConfirmDialog（挂公共根，NomiStudioApp.tsx:736）里的
ProductionContractSummary.tsx:44,79,82 `text-workbench-success` 勾勾 → 继承灰，光暗双模式都中。

这一类的既有证据（同病已反复发作、每次都打局部桥 = 症状修法）：

| 入口 | 现状 |
|---|---|
| 任务中心 portal | 实锤 rgb(201,201,201)，当时补了根层 `--nomi-danger`（tailwind.config.ts:54 注释）|
| CreationAiPanel 对话框 | CreationAiPanel.tsx:783 注释直说「portal 脱离作用域→带上 workbench-shell 类接回来」|
| Scene3D 全屏壳 | Scene3DFullscreen.tsx:499 同款桥 |
| 模型详情弹窗 | ModelSettingsDetailDialog.tsx:112 `root: 'workbench-shell'` 桥 |
| toast 容器 | NomiAppProviders.tsx:24 挂 workbench-shell 类桥 |
| AI 聊天对话框 | workbench.css:2 选择器并挂 `.app-ai-chat-dialog.tc-ai-chat` 桥 |
| 库页 SettingsDialog/onboarding 全片 | NomiStudioApp.tsx:683 无壳包裹；`src/ui/onboarding/*` 有 ~90 处 workbench-* 消费，从库页打开全部解析不到 |

并且 token 真相源已经是**两份并行**（违 P1）且已实际漂移：
`--workbench-preview-timeline-height` tailwind.config.ts:404 = 208px（陈旧）vs workbench.css:9 = 222px（活值，
靠 css 后加载才赢）。workbench-ai.css:3-12 与 tailwind 445-454 又是第三处重复。

## 方案（修根因：让 token 解析与挂载点无关）

1. **单一真源**：`--workbench-*` 全量（含 `--workbench-ai-*`、`--canvas-surface-bg`、`--tc-spotlight-grid-color`）
   移入 tailwind.config.ts addBase 的 `':root'`（浅色）与 `':root[data-mantine-color-scheme="dark"]'`（暗色，
   值取 workbench.css:61-84 现行覆写），与 `--nomi-*` 同机制同位置。冲突值取 cascade 现行赢家（222px）。
2. **删旧（P1，同 commit）**：删 tailwind `.workbench-shell` addBase 块（401-455）、workbench.css 两个 token 块（1-84）、
   workbench-ai.css 首块（1-13）；删 4 处 workbench-shell 桥类（Scene3DFullscreen / CreationAiPanel /
   ModelSettingsDetailDialog / NomiAppProviders toast）。`.workbench-shell` 类保留在真壳上（e2e 地标）。
3. **过时注释/文档对齐**：tailwind.config.ts:54、nomi-tokens.css:18、roleTone.ts:8、
   docs/design/nomi-design-system.md §0.5(:58) / §2.1(:217) / §2.1.4(:266) 中「② 层住在 workbench.css /
   只活在 .workbench-shell」的表述改为「② 层与 ① 层同住 addBase `:root`」。
4. **结构保证（P2③ 门岗，零容忍非棘轮）**：check-design-tokens.mjs 加第 6 类——
   src/**/*.css 与 tailwind.config.ts 里 `--nomi-*` / `--workbench-*` 的**定义**只许出现在
   `:root`-锚定选择器下；困在类作用域 = 红牌列 file:line。新增同病当场拦。
5. **走查（R13）**：新增 tests/ux/workbench-token-root-scope.walk.mjs——真 GUI 停在库页（探针证明
   DOM 无 .workbench-shell）+ stdio MCP 子进程 mock vendor 零额度触发真确认卡浮在库页上，
   光/暗各断言 `--workbench-success` 解析为 #34c759 / #45d483 并截图（人眼 Read 核对）。

## 不动项

- 所有 token **值**不变（壳内零视觉变化；壳外从「错误灰」恢复成设计值，即修复本身）。
- `--nomi-*` 层、nomi-tokens.css 参考镜像机制、`.workbench-shell__*` BEM 样式、
  workbench-ai.css 的 `.tc-ai-chat` 消费映射块、全部消费方 className：都不动。
- 不把 workbench hex 回收成 oklch（设计文档 §14 既有漂移议题，另案）。

## 回滚

单 PR 原子回滚（`git revert`）；token 值未变，回滚无视觉抖动。

## 验收门

五门全过 + check:dangling-tokens + 新走查过 + 既有 spend/production 走查不回归 + 光暗截图人眼核对。
