# 参考图连接后的默认模式

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
