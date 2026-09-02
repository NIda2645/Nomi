# 参考槽已是声明式数据，别重造

> 📎 已拍板的产品设计事实 + 重造风险 · 首次记录 2026-09-01 · 状态：现行
> **触发场景**：要做任何「这个模型能接什么参考 / 能接几个」的 UI 或数据结构时；准备新建 slot / reference 抽象时；要显示参考槽上限时；要让 Agent 修改已建节点的模型或参数时。

> 架构现状以 [`../ARCHITECTURE-NOW.md`](../ARCHITECTURE-NOW.md) 为准，本条记的是**设计意图**与踩过的**重造风险**。以下 file:line 记录于 2026-09-01，动手前请复核。

**结论**：「这个模型能接什么参考、能接几个」**已经是目录里的一等声明式数据**，渲染器也已拍板存在。做新功能时直接消费它，**不要新建抽象**。（2026-09-01 做分镜表设计时差点重造一遍。）

**既有的东西长什么样**：

- `ArchetypeReferenceSlotKind` 六种：`first_frame | last_frame | image_ref | video_ref | audio_ref | source_video` — `electron/shared/videoCapabilities/types.ts:31`
- `ArchetypeMode.slots: ArchetypeReferenceSlot[]` — `src/config/modelArchetypes/types.ts:93`；每槽带 `min / max / label / inputKey / characterIndexed / requiresAnyOf / roleName`
- **模式（`modeId`）决定一切**：哪些槽、哪些参数、transport task kind 全由它定。切模式只改变**显示**哪些槽，**不清空**已存数据（`archetypeMeta.ts:9`）
- **渲染器已存在且已拍板**：`src/workbench/assets/AssetReference.tsx`，吃 `slots[]`，注释写明「对齐样张 v4 / 最少文字·形态自明」。单帧槽横排（≥2 才显标签），数组槽**合并成一排 + 一个「+」**
- `ShotParamControls.tsx` 是「控件随模型 derive」的既有范式，但它**只管标量参数、不管参考槽**——别拿它当参考槽的先例
- 请求体映射是**声明式的**：`slot.inputKey` → `extras.archetypeInput` → 供应商 mapping body

**两个坑**：

1. **声明上限 ≠ 有效上限。** `slotReachByKey`（`NodeParameterControls.tsx:157`）是**运行时上限**——一个声明 `max: 9` 的槽，会被具体供应商的映射体静默压到 1。任何 UI 要显示的是**有效上限**，不是声明上限，否则就是「显示能加、点了没反应」（撞设计系统 §1.6 C1 门岗）。
2. **锚 → 槽是语义绑定，不是位置绑定。** `character_ref` / `style_ref` / `reference` 三种边模式**全部汇进 `image_ref` 数组**，顺序靠 `edge.order` 决定。只有 `first_frame` / `last_frame` 是独立具名槽。按位置去推语义会错。

**Agent 侧的真实边界**：`create_canvas_nodes` 建节点时能设 `modelKey` / `modeId` / `params`；**建完之后唯一的修改工具是 `set_node_prompt`**。没有 `set_node_model` / `set_node_mode` / `set_node_params` / `set_node_reference`（`electron/harness/tools/canvasDescriptors.ts`、`agentChatPolicy.ts:42`）。要让 Agent 改已有节点的模型或参数，**必须新增工具**——不要假设它已经能改。

**怎么用**：
- 动手写任何 slot 相关代码前，先读上面这几个文件确认现状，别凭「应该需要一个抽象」开新的。
- UI 显示上限时取有效上限（过一遍 `slotReachByKey`），不要直接渲染 `slot.max`。
- 需要「第 N 张参考图是角色/风格」这类语义时，读边模式，不要数数组下标。

**出处**：2026-09-01 查实。相关：[`shot-table-is-a-projection-of-canvas-nodes.md`](shot-table-is-a-projection-of-canvas-nodes.md)。
