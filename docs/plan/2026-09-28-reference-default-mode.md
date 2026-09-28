# 参考图连接后的默认模式

> 状态：🚧 进行中（2026-09-28，用户要求：连了参考图后默认应是参考模式，不是首尾帧）

## 范围

调整 `referenceEdgeCapability.ts` 的连线后模式推导：当前模式不能消费新图时，优先使用档案声明的参考类模式；没有参考类模式时使用档案声明的首帧模式。判断只读 `ModelArchetype.modes` 的 `intent` 与 `slots`。

## 不动项

- 当前模式已经能消费参考图时不切换。
- Agent/MCP 显式 `modeId`、分镜表显式 `first_frame`、D 站位连线、已保存项目的 `modeId` 均沿用原路径。
- 不在 UI、供应商名称或节点组件中新增判断。

## 回滚

回滚本次提交即可恢复旧的槽位优先级；没有数据迁移或外部契约变化。

## 验收门

- `npx vitest run src/workbench/generationCanvas/agent/referenceEdgeCapability.test.ts`
- `pnpm run typecheck`
- `node scripts/check-i18n.mjs`（无用户可见文案变更）
- 真实 App 隔离资料目录走查：Seedance 2.0 APIMart 与 Wan 3.0 APIMart 从文生视频节点连接一张图，模式显示为参考类；已选首尾帧节点连接两张图仍显示首尾帧。

## 先查别人

- 档案里已经声明了「哪个模式是参考类工作流」：Seedance 2.0 的全能参考模式是 `intent: "character"`、带 9 张有序 `image_ref` 槽（`electron/shared/videoCapabilities/seedance.ts:85`），首尾帧模式是 `intent: "firstlast"`（同文件 `:69`）。所以默认往哪个模式走，从档案的 `intent` 与 `slots` 推导，不按模型名写死（P4）。
- 「当前模式能不能接、接不住就切到能接得最多的模式」已有唯一 owner `resolveModeForReferenceDemand`（`src/workbench/generationCanvas/agent/referenceEdgeCapability.ts:319`）；本改动只在它前面加一条偏好顺序（参考类工作流 → 其它图参考工作流 → 首帧工作流），并让「连线类型」与「切模式」共用这一份顺序（`preferredImageWorkflow`）。
- 竞品：LibTV 的视频生成器同时有首尾帧与多参考（`docs/product/2026-09-07-libtv-competitor-gap-analysis.md:22`），但「连上一张图后默认进哪种方式」没有竞品证据，这版按用户的直接要求定。
- 结论：不引入新概念、不加新判断入口，只调整既有推导的偏好顺序并收成一个 owner。
