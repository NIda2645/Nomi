# 一个生成能力承载两种返回

> 状态：🚧 待后续拆分；本 lane 仅修动词级来源核对，2026-09-19 追加裁决已确认。

`generation.context.read` 经 pi `list_models` 返回 `{ models: AgentModelEntry[] }`（`electron/agentLane/laneModelRead.mts:36`）；经 `GENERATION_METHODS.context` 返回项目身份、`providerProfiles`、可选 `videoModels`、`nextAction`，且允许宿主注入 context（`electron/capabilityCore/mcpGenerationTools.ts:515`、`:542`）。两者不是同一对象的简繁版，字段与用途都不同。

这是 [结构评审 B 类](2026-09-18-workbench-symptom-cluster-review.md)：两种不同现实共用一个表示。按能力找返回 schema 会把目录误当项目上下文，或用 unknown 把两者一起遮住。本次按动词取真实输出，只让未声明的动词回退能力；目录直接复用 `availableModelsSchema.ts` 的元素 schema。

同族还有 `generation.plan`：create/patch 返回 `{ operation, nextAction, changeset? }`，present 返回 `{ operation, shots, nextAction }`，preview 返回编译/价格投影（`mcpGenerationTools.ts:562`、`:596`、`:643`、`:664`）；不能拿候选入参冒充它们的结果。`GenerationOperation`（`:104`）及嵌套执行契约/授权目前是 TS 类型，没有运行时 schema，故 draft_shots / generate 继续具名登记。

拆能力需安排 `generation.context.read` 的 alias/权限归属及已发布 `nomi_get_generation_context`（`GENERATION_METHODS.context`）的兼容契约，同时核 `nomi_generation_plan` 的 context 分支与内部 `list_models` 路由；plan 同族还涉及 `nomi_operation_create`、`nomi_submit_generation_plan`、`nomi_present_generation_plan`、`nomi_preview_execution`。这些对外名字本 lane 均冻结，按追加裁决不在此拆分，也不通过重命名或改磁盘格式绕过缺口。

R21 判 recurring：跨两个真实入口及 plan 的多返回可复发。修复合同见 [generation-contract-shapes](../fixes/2026-09-19-generation-contract-shapes.root-cause.json)；合同 residual_risks 保留能力层拆分与缺失的输出 schema，不宣称它们已解决。

## 症状簇结构评审：electron/shared 与 scripts

截至本次门岗，electron/shared 在 09-14～09-19 有 22 份 recurring 合同，scripts 有 20 份。沿用 [共享状态评审](2026-09-18-electron-unowned-state-structural-review.md) 与 [交付流水线评审](2026-09-18-delivery-pipeline-structure.md) 的结论，本次属于「表示的 owner 粒度错了」和「有清单、没有机器收口」。已逐条核对的近邻是 verb-host-input-conformance（宿主要求模型给不出的字段）、verb-transport-translation-derived（同一语义的多份手写）、shot-envelope-fields-die-in-hand-written-projections（下游手抄丢字段）。它们都不能靠再抄一份表解决；本次也不把两种返回拼成一份假 schema。

结构处理是复用实际结果 owner，并把动词输出选择收在 `outputFieldNames`，所有 from-read 来源共走这一处。scripts 沿用已有 conformance 入口和变异恢复装置，仅加入按身份收缩的基线；增项、等量换名、陈旧名额都失败，避免再长一套验证链。其余 operation 输出 owner 尚未存在，本次不冒充建立了完整结果体系；能力拆分与结果 schema 归属需后续对外契约评审。这是对本次相关簇的结构判断，不声称重新验收过那 42 份历史合同。
