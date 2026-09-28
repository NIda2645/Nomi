# 生成域契约形状：按动词核返回

> 状态：🚧 进行中；依据 2026-09-19 原任务书与追加裁决，冲突以追加裁决为准。

## 范围与根因

`generation.context.read` 同时表示模型目录与项目生成上下文，能力级输出无法回答「这个动词返回什么」。归类 recurring：另一动词、另一路宿主都能重复触发。在 `VerbDeclaration` 声明可复用的真实输出；来源核对优先读动词，未声明时读能力。移除生成域共享 input/output 占位符，各能力复用已有语义输入，缺失运行时真相源则逐项说明。

登记表目标 5→2：模型目录复用 `agentModelEntrySchema`；时间轴与导出复用原结果 schema 的对应分支。草稿/出卡缺少 `GenerationOperation` 的运行时 schema，保留具名缺口，不手抄 TS 字段。

## 先查别人

沿用已批准的 [工具层反方报告](2026-09-18-tool-layer-prior-art-verdict.md) §2：一份 schema 派生多个消费者，手抄字段表会漂移。仓库现有先例是 `exportCapabilities.ts` 的 `projectExportWriteResult`、`timelineWrite.ts` 的 `projectTimelineWriteResult`；二者执行端已经用结果 schema 校验。棘轮参考 `scripts/check-heavy-path.mjs` 的仓库基线，复用 `gate-mutation-harness.mjs` 的变异恢复装置，不引入框架或通用映射库。

- 真实结果 owner：`electron/shared/agentCapabilities/timelineWrite.ts:35` 定义 apply/undo 返回，`:72` 执行端直接 parse；动词取对应分支即可，无需另一份字段表。
- 同族导出 owner：`electron/shared/agentCapabilities/exportCapabilities.ts:82` 的成功/拒绝/取消结果 union；动词取前两支，保留真实拒绝结果。
- 既有机器装置：`scripts/gate-mutation-harness.mjs:36` 的 `createGateMutationHarness` 提供真实文件变异与恢复；`scripts/check-heavy-path.mjs:214` 示范仓库基线，但本次用动词身份而非裸数量，防等量偷换。

## 不动项与回滚

20 个动词的输入/描述/examples 完全冻结；不改 MCP 方法名、能力 id、磁盘格式、执行器、审批语义和 UI。能力合并留 [审计](../audit/2026-09-19-generation-context-two-payloads.md)。不派子 agent。回滚为整条任务提交的普通 revert，不改远端历史。

## 验收

先运行输出声明优先级/错误字段/能力回退的红测，再实现。登记表身份基线常跑于 `check:verb-host-conformance`，真实加条验红、撤掉验绿，并保留变异自检。依次 typecheck、conformance、model-face-frozen、test-types、三个指定目录 Vitest、agent-runtime，最后 gates→review:branch→push→PR。模型面逐字节未变，按任务裁决不重跑真模型，不冒充新的工具成功率。
