# 先查别人：分镜表作为 Run 落地节点的投影（单一账本）

> 2026-09-18 · 分支 `fix/storyboard-single-ledger-20260918` · 方案 `docs/plan/2026-09-18-agent-storyboard-write-path.md` §5 方案 B
> 问题一句话：Agent 起草的分镜有两个 owner（Run 的 `generationPlan` → 画布节点；`storyboardDesignsByDocumentId`），分镜表只读后者。要不要新长一套「表的行存储」？

## 依赖里已有？

- `@xyflow/react`（`node_modules/@xyflow/react/dist/esm/index.d.ts`）：节点数据（`Node.data`）就是画布的单一真相，官方状态管理指引明确要求派生视图从 nodes 读、不另存副本 — https://reactflow.dev/learn/advanced-use/state-management 。本仓画布已按此（`src/workbench/generationCanvas/store/generationCanvasStore.ts`），表要做的只是再派生一层。
- `zod`：`z.never().optional()` 让「这张表不许存行」在持久化 schema 上成为不可能，而不是靠人守（`electron/shared/canvas/shotTable.ts:60` storyboard 表早已这么写）。

## 仓库里已有？

- `electron/shared/canvas/shotTable.ts:53-61`：storyboard 表 `rows: z.never()`——表不存行、行从方案 derive，是同一条纪律的现成实现；production 表照抄这条形状（`:66-77`）。
- `src/workbench/creation/storyboard/exec/ensureStoryboardShotTable.ts:16`：表与方案「同生」（方案写入时建表、只在显式写时建）；production 表的「与节点同一落地事务同生、纯重放不建」照它的边界搬到 `src/workbench/capability/multiShotCanvasLanding.ts`。
- `src/workbench/generationCanvas/nodes/shotTable/factBridge.ts:23`：deconstruction 表是**有自己 owner 的**表（rows 是测量事实），说明 union schema 已经容纳「多种表源」，加第三种不必改读表器的外壳。
- `docs/lessons/shot-table-is-a-projection-of-canvas-nodes.md`：2026-09-01 拍板「分镜表 = 画布节点的表格表示版；左半列片种模板 derive、右半列该行模型 derive」——本刀的 `productionShotRows.ts` 就是这两半列。
- `docs/fixes/2026-09-10-agent-draft-single-ledger.root-cause.json`：Agent 草稿单一账本合同（Run 是唯一 owner、幂等 apply），里面已经查过 Automerge / IETF idempotency-key 两份外部 prior art，本刀延用同一 owner，不另起。
- `electron/productionRun/productionGenerationPlanEdits.ts:105-135` `applyGenerationCandidatePatch`：reducer 早就按 `shotId` 改一镜——「改一镜」不需要新写路径，缺的只是四层门没把 `shotId` 传到这里。

## 生态里已有？

- Automerge（https://automerge.org/docs/concepts/）：一份文档 + 从文档派生的视图，编辑只写文档；与 09-10 合同同一来源，本刀是它在渲染层多一个派生视图。
- IETF `Idempotency-Key` 草案（https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/）：改一镜的幂等键跟「那一镜的 revision」走（`generation.patch:{op}:{shotId}:{rev}`），否则第二次改同一镜会被当成重放吃掉——键的粒度必须和被改对象的粒度一致。
- OpenTimelineIO（https://opentimelineio.readthedocs.io/）：时间线是单一结构，任何「表格/列表」视图都是投影、不回写——与「表不存行」同一取向；本仓时间轴层已按 OTIO 思路（`docs/lessons/layer-by-layer-prior-art-before-asking.md`）。

## TikHub 自媒体里怎么说？

- 未查。本刀是内部数据流所有权修复（两份账本合一），用户看到的差异是「表里终于有 Agent 落的镜头」，不存在「别家产品怎么做同一功能」的对照点；真实用户对「Agent 分镜 vs 手写分镜」分叉的反馈已在 `docs/roadmap/TODO.md` T-DS-19 与群反馈对账里，不在本报告重抄。

## 结论

用已有：Run 账本 + `rows: z.never()` 的表源 + reducer 已有的按镜 patch；自研的只有「第三种表源的行派生」与「对应表上 `lift` 一档」（两者都是把现成边界再接一层，不是新机制）。不做方案 A（A→B 投影 = 第二份真相）、不做方案 C（加回写账本 B 的动词 = 两扇门）。
